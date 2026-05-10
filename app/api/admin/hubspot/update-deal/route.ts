// app/api/admin/hubspot/update-deal/route.ts
//
// Called for "Renewal" form creation: patches an EXISTING HubSpot deal
// to add the form_link property and creates a Note with company/contact details.
//
// Does NOT change pipeline or stage — this is purely informational enrichment
// on an already-existing deal.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HS_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN || "";

/* ---------- helpers ---------- */

async function hsPatch(path: string, body: unknown) {
  const res  = await fetch(`https://api.hubapi.com${path}`, {
    method  : "PATCH",
    headers : {
      Authorization  : `Bearer ${HS_TOKEN}`,
      "Content-Type" : "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

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
      dealId,
      formUrl,
      company,
      contactName,
      contactEmail,
      contactPhone,
      website,
    } = body as {
      adminSecret  : string;
      formId       : string;
      dealId       : string;
      formUrl?     : string;
      company?     : string;
      contactName? : string;
      contactEmail?: string;
      contactPhone?: string;
      website?     : string;
    };

    /* ── auth ── */
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!formId || !dealId) {
      return NextResponse.json(
        { error: "formId and dealId are required" },
        { status: 400 }
      );
    }
    if (!HS_TOKEN) {
      return NextResponse.json(
        { error: "HUBSPOT_PRIVATE_APP_TOKEN not configured" },
        { status: 500 }
      );
    }

    const supabase = getSupabaseAdmin();

    /* ── 1. Patch existing deal — set form_link property ── */
    if (formUrl) {
      const patchResult = await hsPatch(
        `/crm/v3/objects/deals/${dealId}`,
        { properties: { form_link: formUrl } }
      );

      if (!patchResult.ok) {
        await supabase.from("form_hubspot_sync_logs").insert({
          form_instance_id : formId,
          action           : "HS_DEAL_FORM_LINK_FAILED",
          details          : { status: patchResult.status, body: patchResult.json, dealId },
        });
        // Non-fatal — continue to note creation
      } else {
        await supabase.from("form_hubspot_sync_logs").insert({
          form_instance_id : formId,
          action           : "HS_DEAL_FORM_LINK_SET",
          details          : { dealId, formUrl },
        });
      }
    }

    /* ── 2. Create a Note on the deal ── */
    const noteLines = [
      `Empresa: ${company || "-"}`,
      `Website: ${website || "-"}`,
      `Contato: ${contactName || "-"}`,
      `Email: ${contactEmail || "-"}`,
      `Telefone: ${contactPhone || "-"}`,
    ];

    const noteResult = await hsPost("/crm/v3/objects/notes", {
      properties: {
        hs_note_body : noteLines.join("\n"),
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
      await supabase.from("form_hubspot_sync_logs").insert({
        form_instance_id : formId,
        action           : "HS_NOTE_CREATE_FAILED",
        details          : { status: noteResult.status, body: noteResult.json, dealId },
      });
    }

    return NextResponse.json({
      ok          : true,
      formLinkSet : !!formUrl,
      noteCreated : noteResult.ok,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
