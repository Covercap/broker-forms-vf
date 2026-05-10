// app/api/admin/send-form-email/route.ts
//
// Sends the form URL to the client's contact email via SendGrid Dynamic Templates.
// The sender (From + Reply-To) is the account manager's own @covercap.co address,
// supplied by the admin UI and validated server-side.
//
// After a successful send, creates a Note on the HubSpot deal (non-fatal).
//
// Env vars required:
//   SENDGRID_API_KEY            — SendGrid private API key (domain covercap.co must be authenticated)
//   SENDGRID_TEMPLATE_ID_PTBR   — Template ID for PT-BR email
//   SENDGRID_TEMPLATE_ID_ES     — Template ID for ES/EN email
//   HUBSPOT_PRIVATE_APP_TOKEN   — For posting the note to the deal

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SG_KEY   = process.env.SENDGRID_API_KEY             || "";
const TPL_PTBR = process.env.SENDGRID_TEMPLATE_ID_PTBR    || "";
const TPL_ES   = process.env.SENDGRID_TEMPLATE_ID_ES       || "";
const HS_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN     || "";

const ALLOWED_DOMAIN = "covercap.co";

/* ---------- HubSpot note helper ---------- */

async function postHubSpotNote(dealId: string, noteBody: string) {
  await fetch("https://api.hubapi.com/crm/v3/objects/notes", {
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
  // fire-and-forget — errors are intentionally swallowed so email success is not affected
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
      lang,
      dynamicData,
    } = body as {
      adminSecret  : string;
      fromEmail    : string;   // must end with @covercap.co
      toEmail      : string;
      dealId?      : string;   // optional — if provided, a note is added to the deal
      lang         : string;   // 'pt-BR' | 'es' | 'en'
      dynamicData  : {
        contact_name : string;
        company_name : string;
        product_name : string;
        form_url     : string;
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

    /* ── env var check ── */
    if (!SG_KEY) {
      return NextResponse.json({ error: "SENDGRID_API_KEY not configured" }, { status: 500 });
    }

    /* ── pick template based on language ── */
    const templateId = lang === "pt-BR" ? TPL_PTBR : TPL_ES;
    if (!templateId) {
      const missing = lang === "pt-BR" ? "SENDGRID_TEMPLATE_ID_PTBR" : "SENDGRID_TEMPLATE_ID_ES";
      return NextResponse.json(
        { error: `${missing} not configured` },
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
              contact_name : dynamicData.contact_name || "",
              company_name : dynamicData.company_name || "",
              product_name : dynamicData.product_name || "",
              form_url     : dynamicData.form_url,
            },
          },
        ],
      }),
    });

    // SendGrid returns 202 with empty body on success
    if (sgRes.status === 202) {
      /* ── post note to HubSpot deal (non-fatal, fire-and-forget) ── */
      if (dealId && HS_TOKEN) {
        const sentAt = new Date().toLocaleString("pt-BR", {
          day   : "2-digit",
          month : "2-digit",
          year  : "numeric",
          hour  : "2-digit",
          minute: "2-digit",
        });
        const noteLines = [
          `📧 Email do questionário enviado ao cliente`,
          ``,
          `Para: ${toEmail}`,
          `Por: ${fromEmail}`,
          `Link: ${dynamicData.form_url}`,
          `Enviado em: ${sentAt}`,
        ];
        postHubSpotNote(dealId, noteLines.join("\n")).catch(() => {});
      }

      return NextResponse.json({ ok: true });
    }

    // Any other status → error
    let errorBody: any = null;
    try {
      errorBody = await sgRes.json();
    } catch {
      errorBody = await sgRes.text().catch(() => null);
    }

    return NextResponse.json(
      {
        error  : `SendGrid responded with HTTP ${sgRes.status}`,
        details: errorBody,
      },
      { status: 502 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
