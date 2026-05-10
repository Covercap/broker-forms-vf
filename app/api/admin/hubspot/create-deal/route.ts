// app/api/admin/hubspot/create-deal/route.ts
//
// Creates a HubSpot deal + contact for a "New Business" form instance.
// Called by the admin panel immediately after the form link is generated.
//
// Env vars required:
//   HUBSPOT_PRIVATE_APP_TOKEN        — HS private app bearer token
//   HS_NEW_BUSINESS_PIPELINE_ID      — "New Business" pipeline ID
//   HS_STAGE_NB_DISCOVERY_ID         — "Discovery" stage ID (deal starts here)

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HS_TOKEN        = process.env.HUBSPOT_PRIVATE_APP_TOKEN     || "";
const NB_PIPELINE     = process.env.HS_NEW_BUSINESS_PIPELINE_ID   || "";
const NB_STAGE_DISC   = process.env.HS_STAGE_NB_DISCOVERY_ID      || "";

/* ---------- helpers ---------- */

async function hsPost(path: string, body: unknown) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/* ---------- POST handler ---------- */

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const {
      adminSecret,
      formId,
      company,
      contactName,
      contactEmail,
      contactPhone,
      productCode,   // first word used in deal name
    } = body as {
      adminSecret: string;
      formId: string;
      company: string;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      productCode?: string;
    };

    /* auth */
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!formId || !company) {
      return NextResponse.json(
        { error: "formId and company are required" },
        { status: 400 }
      );
    }
    if (!HS_TOKEN || !NB_PIPELINE || !NB_STAGE_DISC) {
      return NextResponse.json(
        {
          error:
            "HubSpot env vars not configured " +
            "(HS_NEW_BUSINESS_PIPELINE_ID / HS_STAGE_NB_DISCOVERY_ID)",
        },
        { status: 500 }
      );
    }

    const supabase = getSupabaseAdmin();
    const today    = new Date().toLocaleDateString("pt-BR");
    // "first word" of product_code — split on space / underscore / dash / slash
    const firstWord =
      (productCode || "").split(/[\s_\-\/]+/)[0] || productCode || "seguro";
    const dealName  = `${company} - ${firstWord} - ${today}`;

    /* ── 1. Create HubSpot contact (best-effort, non-fatal) ── */
    let contactId: string | null = null;

    if (contactEmail || contactName) {
      const contactProps: Record<string, string> = {};
      if (contactName) {
        const [first, ...rest] = contactName.trim().split(/\s+/);
        contactProps.firstname = first;
        if (rest.length) contactProps.lastname = rest.join(" ");
      }
      if (contactEmail) contactProps.email  = contactEmail;
      if (contactPhone) contactProps.phone  = contactPhone;

      const contactResult = await hsPost("/crm/v3/objects/contacts", {
        properties: contactProps,
      });

      if (contactResult.ok) {
        contactId = contactResult.json?.id ?? null;
      } else {
        // Log but do not fail — deal creation continues without contact
        await supabase.from("form_hubspot_sync_logs").insert({
          form_instance_id: formId,
          action: "HS_CONTACT_CREATE_FAILED",
          details: {
            status: contactResult.status,
            body: contactResult.json,
          },
        });
      }
    }

    /* ── 2. Create HubSpot deal ── */
    const dealPayload: any = {
      properties: {
        dealname:  dealName,
        pipeline:  NB_PIPELINE,
        dealstage: NB_STAGE_DISC,
      },
    };

    // Associate contact inline (HubSpot v3 deals endpoint accepts associations)
    if (contactId) {
      dealPayload.associations = [
        {
          to: { id: contactId },
          types: [
            {
              associationCategory: "HUBSPOT_DEFINED",
              associationTypeId: 3, // HUBSPOT_DEFINED deal → contact
            },
          ],
        },
      ];
    }

    const dealResult = await hsPost("/crm/v3/objects/deals", dealPayload);

    if (!dealResult.ok) {
      await supabase.from("form_hubspot_sync_logs").insert({
        form_instance_id: formId,
        action: "HS_DEAL_CREATE_FAILED",
        details: { status: dealResult.status, body: dealResult.json },
      });
      return NextResponse.json(
        {
          error: `HubSpot deal creation failed (HTTP ${dealResult.status})`,
          details: dealResult.json,
        },
        { status: 502 }
      );
    }

    const dealId = dealResult.json?.id as string;

    /* ── 3. Persist deal_id (and contact_id) to Supabase ── */
    const patch: Record<string, string> = { hubspot_deal_id: dealId };
    if (contactId) patch.hubspot_contact_id = contactId;

    await supabase
      .from("form_instances")
      .update(patch)
      .eq("id", formId);

    /* ── 4. Audit log ── */
    await supabase.from("form_hubspot_sync_logs").insert({
      form_instance_id: formId,
      action: "NEW_BUSINESS_DEAL_CREATED",
      details: {
        dealId,
        contactId,
        dealName,
        pipeline: NB_PIPELINE,
        stage: NB_STAGE_DISC,
      },
    });

    return NextResponse.json({ ok: true, dealId, contactId, dealName });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
