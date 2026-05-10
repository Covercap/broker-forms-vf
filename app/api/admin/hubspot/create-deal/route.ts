// app/api/admin/hubspot/create-deal/route.ts
//
// Creates a HubSpot deal + contact for a "New Business" form instance,
// enriches the deal with form_link / deal_country properties, and
// attaches a note with key company/contact details.
//
// Env vars required:
//   HUBSPOT_PRIVATE_APP_TOKEN        — HS private app bearer token
//   HS_NEW_BUSINESS_PIPELINE_ID      — "New Business" pipeline ID
//   HS_STAGE_NB_DISCOVERY_ID         — "Discovery" stage ID (deal starts here)

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HS_TOKEN      = process.env.HUBSPOT_PRIVATE_APP_TOKEN    || "";
const NB_PIPELINE   = process.env.HS_NEW_BUSINESS_PIPELINE_ID  || "";
const NB_STAGE_DISC = process.env.HS_STAGE_NB_DISCOVERY_ID     || "";

/* ---------- reusable POST helper ---------- */

async function hsPost(path: string, body: unknown) {
  const res  = await fetch(`https://api.hubapi.com${path}`, {
    method  : "POST",
    headers : {
      Authorization  : `Bearer ${HS_TOKEN}`,
      "Content-Type" : "application/json",
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
      productCode,
      formUrl,   // full questionnaire URL to store in form_link deal property
      lang,      // 'pt-BR' | 'es' | 'en'  — used to set deal_country
      website,   // company website — included in the note
    } = body as {
      adminSecret  : string;
      formId       : string;
      company      : string;
      contactName? : string;
      contactEmail?: string;
      contactPhone?: string;
      productCode? : string;
      formUrl?     : string;
      lang?        : string;
      website?     : string;
    };

    /* ── auth ── */
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

    const supabase  = getSupabaseAdmin();
    const today     = new Date().toLocaleDateString("pt-BR");
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
      if (contactEmail) contactProps.email = contactEmail;
      if (contactPhone) contactProps.phone = contactPhone;

      const contactResult = await hsPost("/crm/v3/objects/contacts", {
        properties: contactProps,
      });

      if (contactResult.ok) {
        contactId = contactResult.json?.id ?? null;
      } else {
        await supabase.from("form_hubspot_sync_logs").insert({
          form_instance_id : formId,
          action           : "HS_CONTACT_CREATE_FAILED",
          details          : { status: contactResult.status, body: contactResult.json },
        });
      }
    }

    /* ── 2. Create HubSpot deal ── */

    // Build deal properties — include form_link and optionally deal_country
    const dealProperties: Record<string, string> = {
      dealname  : dealName,
      pipeline  : NB_PIPELINE,
      dealstage : NB_STAGE_DISC,
    };
    if (formUrl)          dealProperties.form_link    = formUrl;
    if (lang === "pt-BR") dealProperties.deal_country = "Brazil";

    const dealPayload: any = { properties: dealProperties };

    // Associate contact inline if created successfully
    if (contactId) {
      dealPayload.associations = [
        {
          to    : { id: contactId },
          types : [
            {
              associationCategory : "HUBSPOT_DEFINED",
              associationTypeId   : 3, // deal → contact
            },
          ],
        },
      ];
    }

    const dealResult = await hsPost("/crm/v3/objects/deals", dealPayload);

    if (!dealResult.ok) {
      await supabase.from("form_hubspot_sync_logs").insert({
        form_instance_id : formId,
        action           : "HS_DEAL_CREATE_FAILED",
        details          : { status: dealResult.status, body: dealResult.json },
      });
      return NextResponse.json(
        {
          error   : `HubSpot deal creation failed (HTTP ${dealResult.status})`,
          details : dealResult.json,
        },
        { status: 502 }
      );
    }

    const dealId = dealResult.json?.id as string;

    /* ── 3. Create a Note on the deal with company/contact details ── */
    const noteLines = [
      `Empresa: ${company}`,
      `Website: ${website || "-"}`,
      `Contato: ${contactName || "-"}`,
      `Email: ${contactEmail || "-"}`,
      `Telefone: ${contactPhone || "-"}`,
    ];
    const noteBody = noteLines.join("\n");

    const noteResult = await hsPost("/crm/v3/objects/notes", {
      properties: {
        hs_note_body : noteBody,
        hs_timestamp : new Date().toISOString(),
      },
      associations: [
        {
          to    : { id: dealId },
          types : [
            {
              associationCategory : "HUBSPOT_DEFINED",
              associationTypeId   : 214, // note → deal
            },
          ],
        },
      ],
    });

    if (!noteResult.ok) {
      // Non-fatal — log and continue
      await supabase.from("form_hubspot_sync_logs").insert({
        form_instance_id : formId,
        action           : "HS_NOTE_CREATE_FAILED",
        details          : { status: noteResult.status, body: noteResult.json },
      });
    }

    /* ── 4. Persist deal_id (and contact_id) to Supabase ── */
    const patch: Record<string, string> = { hubspot_deal_id: dealId };
    if (contactId) patch.hubspot_contact_id = contactId;

    const { error: patchErr } = await supabase
      .from("form_instances")
      .update(patch)
      .eq("id", formId);

    if (patchErr) console.error("[create-deal] Supabase patch failed:", patchErr.message);

    /* ── 5. Audit log ── */
    await supabase.from("form_hubspot_sync_logs").insert({
      form_instance_id : formId,
      action           : "NEW_BUSINESS_DEAL_CREATED",
      details          : {
        dealId,
        contactId,
        dealName,
        pipeline  : NB_PIPELINE,
        stage     : NB_STAGE_DISC,
        formUrl   : formUrl || null,
        country   : lang === "pt-BR" ? "Brazil" : null,
        noteCreated: noteResult.ok,
      },
    });

    return NextResponse.json({
      ok        : true,
      dealId,
      contactId,
      dealName,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
