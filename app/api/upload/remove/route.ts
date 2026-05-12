// app/api/upload/remove/route.ts
//
// Removes a single file record from form_files by objectKey.
// Does NOT delete from Supabase Storage (files kept for audit).

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { token, objectKey } = await req.json();

    if (!token || !objectKey) {
      return NextResponse.json({ error: "missing parameters" }, { status: 400 });
    }

    // Validate token and get form_id
    const { data: tok, error: tokErr } = await supabase
      .from("form_access_tokens")
      .select("form_id, expires_at")
      .eq("token", token)
      .single();

    if (tokErr || !tok) {
      return NextResponse.json({ error: "invalid token" }, { status: 403 });
    }
    if (tok.expires_at && new Date(tok.expires_at) < new Date()) {
      return NextResponse.json({ error: "token expired" }, { status: 403 });
    }

    // Delete the file record — scoped to this form_id for safety
    const { error: delErr } = await supabase
      .from("form_files")
      .delete()
      .eq("form_id", tok.form_id)
      .eq("storage_path", objectKey);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
