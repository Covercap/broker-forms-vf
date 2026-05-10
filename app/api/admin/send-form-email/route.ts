// app/api/admin/send-form-email/route.ts
//
// Sends the form URL to the client's contact email via SendGrid Dynamic Templates.
// The sender (From + Reply-To) is the account manager's own @covercap.co address,
// supplied by the admin UI and validated server-side.
//
// Env vars required:
//   SENDGRID_API_KEY            — SendGrid private API key (domain covercap.co must be authenticated)
//   SENDGRID_TEMPLATE_ID_PTBR   — Template ID for PT-BR email
//   SENDGRID_TEMPLATE_ID_ES     — Template ID for ES/EN email
//
// Language → template mapping:
//   pt-BR → SENDGRID_TEMPLATE_ID_PTBR
//   es | en → SENDGRID_TEMPLATE_ID_ES

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SG_KEY   = process.env.SENDGRID_API_KEY          || "";
const TPL_PTBR = process.env.SENDGRID_TEMPLATE_ID_PTBR || "";
const TPL_ES   = process.env.SENDGRID_TEMPLATE_ID_ES   || "";

const ALLOWED_DOMAIN = "covercap.co";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const {
      adminSecret,
      fromEmail,
      toEmail,
      lang,
      dynamicData,
    } = body as {
      adminSecret  : string;
      fromEmail    : string;   // must end with @covercap.co
      toEmail      : string;
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
