// app/api/forms/submit/route.ts
//
// Called non-blocking after the respondent submits the form.
// Moves the HubSpot deal to the appropriate stage based on deal_type:
//
//   deal_type = 'new_business'
//     pipeline  → HS_NEW_BUSINESS_PIPELINE_ID
//     stage     → HS_STAGE_NB_QUALIFICATION_ID   (Discovery → Qualification)
//
//   deal_type = 'renewal' (default)
//     pipeline  → HS_RENEWAL_PIPELINE_ID
//     stage     → HS_STAGE_WAITING_FOR_PROPOSAL_ID (Request Information → Waiting for Proposal)
//
// Env vars:
//   HUBSPOT_PRIVATE_APP_TOKEN
//   HS_RENEWAL_PIPELINE_ID
//   HS_STAGE_WAITING_FOR_PROPOSAL_ID
//   HS_NEW_BUSINESS_PIPELINE_ID
//   HS_STAGE_NB_QUALIFICATION_ID

export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const HS_TOKEN          = process.env.HUBSPOT_PRIVATE_APP_TOKEN          || "";
// Renewal
const R_PIPELINE        = process.env.HS_RENEWAL_PIPELINE_ID             || "";
const R_STAGE_WAITING   = process.env.HS_STAGE_WAITING_FOR_PROPOSAL_ID   || "";
// New Business
const NB_PIPELINE       = process.env.HS_NEW_BUSINESS_PIPELINE_ID        || "";
const NB_STAGE_QUAL     = process.env.HS_STAGE_NB_QUALIFICATION_ID       || "";

/* ---------- tiny helpers ---------- */

async function insertLog(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  form_instance_id: string,
  action: string,
  details: any = null
) {
  await supabase
    .from("form_hubspot_sync_logs")
    .insert({ form_instance_id, action, details });
}

async function updateForm(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  form_instance_id: string,
  patch: Record<string, any>
) {
  await supabase
    .from("form_instances")
    .update(patch)
    .eq("id", form_instance_id);
}

/* ---------- POST ---------- */

export async function POST(req: NextRequest) {
  const debug: any = { steps: [] };

  try {
    const supabase = getSupabaseAdmin();

    debug.env = {
      HUBSPOT_PRIVATE_APP_TOKEN_present : HS_TOKEN.length > 10,
      HS_RENEWAL_PIPELINE_ID_present    : !!R_PIPELINE,
      HS_STAGE_WAITING_present          : !!R_STAGE_WAITING,
      HS_NEW_BUSINESS_PIPELINE_present  : !!NB_PIPELINE,
      HS_STAGE_NB_QUAL_present          : !!NB_STAGE_QUAL,
    };

    const body = await req.json().catch(() => ({} as any));
    const form_instance_id  = body?.form_instance_id as string;
    const submitted_by_email = (body?.submitted_by_email || "").toLowerCase();

    debug.steps.push("BODY_PARSED");
    if (!form_instance_id) {
      debug.error = "Missing form_instance_id";
      return new Response(JSON.stringify({ ok: false, debug }), { status: 400 });
    }

    /* 1. Mark STARTED */
    await updateForm(supabase, form_instance_id, {
      hubspot_sync_status: "STARTED",
    }).catch(() => {});
    debug.steps.push("STATUS_STARTED");

    /* 2. Load form row */
    const { data: form, error } = await supabase
      .from("form_instances")
      .select("*")
      .eq("id", form_instance_id)
      .single();

    if (error || !form) {
      debug.steps.push("FORM_NOT_FOUND");
      await insertLog(supabase, form_instance_id, "FORM_NOT_FOUND", {
        error: String(error?.message || error),
      }).catch(() => {});
      return new Response(
        JSON.stringify({ ok: true, hubspotUpdated: false, reason: "form_not_found", debug }),
        { status: 200 }
      );
    }

    await insertLog(supabase, form_instance_id, "FORM_LOADED", {
      hasDealId : !!form.hubspot_deal_id,
      dealType  : form.deal_type || "renewal",
    }).catch(() => {});
    debug.steps.push("FORM_LOADED");

    /* 3. Guard: deal ID required */
    const dealId = form.hubspot_deal_id?.toString().trim();
    if (!dealId) {
      await updateForm(supabase, form_instance_id, {
        hubspot_sync_status : "MISSING_DEAL_ID",
        hubspot_sync_error  : "No hubspot_deal_id on form instance",
        needs_attention     : true,
        submitted_by_email  : submitted_by_email || form.submitted_by_email || null,
      }).catch(() => {});
      await insertLog(supabase, form_instance_id, "MISSING_DEAL_ID_FLAGGED", null).catch(() => {});
      debug.steps.push("MISSING_DEAL_ID_FLAGGED");
      return new Response(
        JSON.stringify({ ok: true, hubspotUpdated: false, reason: "missing_deal_id", debug }),
        { status: 200 }
      );
    }

    /* 4. Resolve pipeline + stage based on deal type */
    const dealType  = (form.deal_type || "renewal") as string;
    const isNewBiz  = dealType === "new_business";
    const pipeline  = isNewBiz ? NB_PIPELINE   : R_PIPELINE;
    const stage     = isNewBiz ? NB_STAGE_QUAL : R_STAGE_WAITING;

    debug.dealType = dealType;
    debug.pipeline = pipeline;
    debug.stage    = stage;

    /* 5. Env-var guard for HubSpot call */
    if (!HS_TOKEN || !pipeline || !stage) {
      debug.steps.push("ENV_MISSING_FOR_HS_CALL");
      await updateForm(supabase, form_instance_id, {
        hubspot_sync_status : "FAILED_UPDATE",
        hubspot_sync_error  : `Missing HS env for deal_type=${dealType} (token/pipeline/stage)`,
        needs_attention     : true,
      }).catch(() => {});
      await insertLog(supabase, form_instance_id, "HUBSPOT_UPDATE_FAILED", {
        reason: "env_missing",
        dealType,
      }).catch(() => {});
      return new Response(
        JSON.stringify({ ok: true, hubspotUpdated: false, debug }),
        { status: 200 }
      );
    }

    /* 6. Breadcrumb before HubSpot call */
    await insertLog(supabase, form_instance_id, "ABOUT_TO_CALL_HUBSPOT", {
      dealId,
      pipeline,
      stage,
      dealType,
    }).catch(() => {});
    debug.steps.push("ABOUT_TO_CALL_HUBSPOT");

    /* 7. Move the deal to the target stage */
    const hsRes = await fetch(
      `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`,
      {
        method  : "PATCH",
        headers : {
          Authorization  : `Bearer ${HS_TOKEN}`,
          "Content-Type" : "application/json",
        },
        body: JSON.stringify({
          properties: { dealstage: stage, pipeline },
        }),
      }
    );

    debug.steps.push(`HS_RESPONSE_${hsRes.status}`);

    if (!hsRes.ok) {
      const text = await hsRes.text();
      await updateForm(supabase, form_instance_id, {
        hubspot_sync_status : "FAILED_UPDATE",
        hubspot_sync_error  : `HTTP ${hsRes.status}: ${text?.slice(0, 800)}`,
        needs_attention     : true,
      }).catch(() => {});
      await insertLog(supabase, form_instance_id, "HUBSPOT_UPDATE_FAILED", {
        status : hsRes.status,
        body   : text?.slice(0, 2000),
        dealType,
      }).catch(() => {});
      return new Response(
        JSON.stringify({ ok: true, hubspotUpdated: false, debug }),
        { status: 200 }
      );
    }

    /* 8. Success */
    await updateForm(supabase, form_instance_id, {
      hubspot_sync_status : "SUCCESS",
      hubspot_sync_error  : null,
      needs_attention     : false,
      submitted_by_email  : submitted_by_email || form.submitted_by_email || null,
    }).catch(() => {});
    await insertLog(supabase, form_instance_id, "HUBSPOT_UPDATE_SUCCESS", {
      dealId,
      dealType,
      pipeline,
      stage,
    }).catch(() => {});
    debug.steps.push("HUBSPOT_UPDATE_SUCCESS");

    return new Response(
      JSON.stringify({ ok: true, hubspotUpdated: true, debug }),
      { status: 200 }
    );
  } catch (err: any) {
    debug.steps.push("HANDLER_EXCEPTION");
    debug.error = String(err?.message || err);
    return new Response(
      JSON.stringify({ ok: true, hubspotUpdated: false, debug }),
      { status: 200 }
    );
  }
}
