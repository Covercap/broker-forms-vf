// app/api/admin/create/route.ts
//
// Creates a new form_instance via the admin_create_form_instance RPC,
// then patches the row to store deal_type, website, and (for Renewal)
// the hubspot_deal_id provided up-front by the admin.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const {
    templateSlug,
    company,
    contact,
    ttlMinutes,
    adminSecret,
    dealType,       // 'new_business' | 'renewal'
    website,        // company website URL
    hubspotDealId,  // pre-supplied for Renewal deals
  } = body || {};

  if (adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!templateSlug || !company) {
    return NextResponse.json(
      { error: "templateSlug and company are required" },
      { status: 400 }
    );
  }

  const ttl         = Number.isFinite(Number(ttlMinutes)) ? Number(ttlMinutes) : 60 * 24 * 30;
  const contactJson = contact && typeof contact === "object" ? contact : null;
  const dtype       = dealType === "new_business" ? "new_business" : "renewal";

  const supabaseAdmin = getSupabaseAdmin();

  /* ── 1. Create the form instance via existing RPC ── */
  const { data, error } = await supabaseAdmin.rpc("admin_create_form_instance", {
    p_template_slug: templateSlug,
    p_company:       company,
    p_contact:       contactJson,
    p_ttl_minutes:   ttl,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const formId = data?.form_id as string | undefined;

  /* ── 2. Patch extra fields onto the new row ── */
  if (formId) {
    const patch: Record<string, any> = { deal_type: dtype };
    if (website)        patch.website         = website.trim();
    if (dtype === "renewal" && hubspotDealId) {
      // Pre-store the deal ID so submission can immediately use it
      patch.hubspot_deal_id = String(hubspotDealId).replace(/\D/g, "");
    }

    const { error: patchErr } = await supabaseAdmin
      .from("form_instances")
      .update(patch)
      .eq("id", formId);

    if (patchErr) console.error("[admin/create] patch failed:", patchErr.message);
  }

  return NextResponse.json({ ok: true, ...data });
}
