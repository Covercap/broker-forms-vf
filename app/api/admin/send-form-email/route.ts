// app/api/admin/send-form-email/route.ts
//
// Sends the form URL to the client's contact email via SendGrid Dynamic Templates.
// The sender (From + Reply-To) is the account manager's own @covercap.co address.
//
// Template selection: 4 combinations of dealType × lang
//   new_business + pt-BR → SENDGRID_TEMPLATE_ID_NB_PTBR
//   new_business + es|en → SENDGRID_TEMPLATE_ID_NB_ES
//   renewal      + pt-BR → SENDGRID_TEMPLATE_ID_PTBR
//   renewal      + es|en → SENDGRID_TEMPLATE_ID_ES
//
// After a successful send, creates a Note on the HubSpot deal (awaited, result returned).

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SG_KEY        = process.env.SENDGRID_API_KEY             || "";
const TPL_NB_PTBR   = process.env.SENDGRID_TEMPLATE_ID_NB_PTBR || "";
const TPL_NB_ES     = process.env.SENDGRID_TEMPLATE_ID_NB_ES   || "";
const TPL_R_PTBR    = process.env.SENDGRID_TEMPLATE_ID_PTBR    || "";
const TPL_R_ES      = process.env.SENDGRID_TEMPLATE_ID_ES      || "";
const HS_TOKEN      = process.env.HUBSPOT_PRIVATE_APP_TOKEN     || "";

const ALLOWED_DOMAIN = "covercap.co";

/* ---------- HubSpot note ---------- */

async function postHubSpotNote(
  dealId     : string,
  noteBody   : string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/notes", {
      method  : "POST",
      headers : {
        Authorization  : `Bearer ${HS_TOKEN}`,
        "Content-Type" : "application/json",
      },
      body: JSON.stringify({
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
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HS ${res.status}: ${text.slice(0, 300)}` };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "unknown" };
  }
}

/* ---------- POST handler ---------- */

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const {
      adminSecret,
      fromEmail,
      toEmail,
      dealId,
      dealType,
      lang,
      productName,
      dynamicData,
    } = body as {
      adminSecret  : string;
      fromEmail    : string;
      toEmail      : string;
      dealId?      : string;
      dealType?    : string;   // 'new_business' | 'renewal'
      lang         : string;   // 'pt-BR' | 'es' | 'en'
      productName? : string;   // simplified product label for the note header
      dynamicData  : {
        contact_name  : string;
        company_name  : string;
        product_name  : string;
        form_url      : string;
        expiring_date : string;
      };
    };

    /* ── auth ── */
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    /* ── validate fromEmail domain ── */
    if (!fromEmail) {
      return NextResponse.json({ error: "fromEmail is required" }, { status: 400 });
    }
    const fromDomain = fromEmail.split("@")[1]?.toLowerCase();
    if (fromDomain !== ALLOWED_DOMAIN) {
      return NextResponse.json(
        { error: `fromEmail must be a @${ALLOWED_DOMAIN} address` },
        { status: 400 }
      );
    }
    if (!toEmail) {
      return NextResponse.json({ error: "toEmail is required" }, { status: 400 });
    }
    if (!dynamicData?.form_url) {
      return NextResponse.json({ error: "dynamicData.form_url is required" }, { status: 400 });
    }
    if (!SG_KEY) {
      return NextResponse.json({ error: "SENDGRID_API_KEY not configured" }, { status: 500 });
    }

    /* ── pick template: dealType × lang ── */
    const isNewBiz = dealType === "new_business";
    let templateId: string;
    let templateEnvName: string;

    if (isNewBiz && lang === "pt-BR") {
      templateId = TPL_NB_PTBR; templateEnvName = "SENDGRID_TEMPLATE_ID_NB_PTBR";
    } else if (isNewBiz) {
      templateId = TPL_NB_ES;   templateEnvName = "SENDGRID_TEMPLATE_ID_NB_ES";
    } else if (lang === "pt-BR") {
      templateId = TPL_R_PTBR;  templateEnvName = "SENDGRID_TEMPLATE_ID_PTBR";
    } else {
      templateId = TPL_R_ES;    templateEnvName = "SENDGRID_TEMPLATE_ID_ES";
    }

    if (!templateId) {
      return NextResponse.json(
        { error: `${templateEnvName} not configured` },
        { status: 500 }
      );
    }

    /* ── call SendGrid ── */
    const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method  : "POST",
      headers : {
        Authorization  : `Bearer ${SG_KEY}`,
        "Content-Type" : "application/json",
      },
      body: JSON.stringify({
        from             : { email: fromEmail },
        reply_to         : { email: fromEmail },
        template_id      : templateId,
        personalizations : [
          {
            to                    : [{ email: toEmail }],
            dynamic_template_data : {
              contact_name  : dynamicData.contact_name  || "",
              company_name  : dynamicData.company_name  || "",
              product_name  : dynamicData.product_name  || "",
              form_url      : dynamicData.form_url,
              expiring_date : dynamicData.expiring_date || "",
            },
          },
        ],
      }),
    });

    if (sgRes.status !== 202) {
      let errorBody: any = null;
      try   { errorBody = await sgRes.json(); }
      catch { errorBody = await sgRes.text().catch(() => null); }
      return NextResponse.json(
        { error: `SendGrid responded with HTTP ${sgRes.status}`, details: errorBody },
        { status: 502 }
      );
    }

    /* ── email sent — post note to HubSpot deal ── */
    let noteResult: { ok: boolean; error?: string } = { ok: false, error: "no dealId provided" };

    if (dealId && HS_TOKEN) {
      const sentAt = new Date().toLocaleString("pt-BR", {
        day    : "2-digit",
        month  : "2-digit",
        year   : "numeric",
        hour   : "2-digit",
        minute : "2-digit",
      });
      const label   = productName || dynamicData.product_name || "Form";
      const noteBody = [
        `${label} form was sent to client.`,
        ``,
        `Para: ${toEmail}`,
        `Por: ${fromEmail}`,
        `Link: ${dynamicData.form_url}`,
        `Enviado em: ${sentAt}`,
      ].join("\n");

      noteResult = await postHubSpotNote(dealId, noteBody);
      if (!noteResult.ok) {
        console.error("[send-form-email] HubSpot note failed:", noteResult.error);
      }
    }

    return NextResponse.json({
      ok          : true,
      noteCreated : noteResult.ok,
      noteError   : noteResult.error ?? null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
