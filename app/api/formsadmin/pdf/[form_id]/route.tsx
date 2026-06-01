// app/api/formsadmin/pdf/[form_id]/route.tsx
import React from "react";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";
import path from "path";
import fs from "fs/promises";
import { pdf } from "@react-pdf/renderer";
import FortersFormPdf, { QAItem } from "@/pdf-templates/FortersFormPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------- helpers: parsing / formatting ---------- */

// If a string looks like JSON, parse it.
// Returns original value if parsing fails.
function normalize(v: any) {
  if (typeof v === "string") {
    const s = v.trim();
    const looksJson =
      (s.startsWith("{") && s.endsWith("}")) ||
      (s.startsWith("[") && s.endsWith("]"));
    if (looksJson) {
      try {
        return JSON.parse(s);
      } catch {
        return v;
      }
    }
  }
  return v;
}

function arrayToStr(arr: any[]) {
  return arr
    .map((x) =>
      typeof x === "string"
        ? x
        : x?.label ?? x?.value ?? JSON.stringify(x ?? "")
    )
    .join(", ");
}

function fmtBoolean(v: any) {
  const vv = normalize(v);
  const b = typeof vv === "boolean" ? vv : vv?.value ?? vv?.val;
  return b === true ? "Sim" : b === false ? "Não" : "-";
}

function fmtArray(v: any) {
  const vv = normalize(v);
  const arr = Array.isArray(vv) ? vv : vv?.values || vv?.options || [];
  return arrayToStr(arr);
}

function fmtScalar(v: any) {
  const vv = normalize(v);
  const raw = vv?.value ?? vv?.val ?? vv;

  // If raw is an array, render as comma-separated
  if (Array.isArray(raw)) return arrayToStr(raw);

  if (raw == null) return "-";
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "string") return raw;
  return JSON.stringify(raw);
}

function fmtCurrency(v: any) {
  const vv = normalize(v);
  const amount = Number(vv?.amount ?? vv?.value ?? vv);
  if (Number.isFinite(amount))
    return amount.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  return fmtScalar(v);
}

function fmtDate(v: any) {
  const vv = normalize(v);
  const iso = vv?.date ?? vv?.value ?? vv;
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(+d) ? d.toLocaleDateString("pt-BR") : fmtScalar(v);
}

/** Build a pretty line for a table row using column labels from config_json. */
function rowToPrettyLine(
  rowObj: Record<string, any>,
  colLabelByKey: Record<string, string>
) {
  const pairs = Object.entries(rowObj || {}).map(([k, val]) => {
    const label = colLabelByKey[k] || k;
    const vv = normalize(val);

    let printable: string;
    if (Array.isArray(vv)) printable = arrayToStr(vv);
    else if (typeof vv === "object" && vv !== null) printable = fmtScalar(vv);
    else printable = String(vv ?? "-");

    return `${label}: ${printable}`;
  });
  return pairs.join(" | ");
}

/* ------------------- main handler ------------------- */

export async function POST(
  req: Request,
  { params }: { params: { form_id: string } }
) {
  try {
    const { adminSecret } = await req.json().catch(() => ({} as any));
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const formId = params.form_id;

    // 1) form
    const { data: form, error: formErr } = await supabaseAdmin
      .from("form_instances")
      .select("id, template_id, language, created_at, respondent_company")
      .eq("id", formId)
      .single();

    if (formErr || !form) {
      return NextResponse.json(
        { error: formErr?.message || "form_not_found" },
        { status: 404 }
      );
    }

    // 2) template (for human form name)
    const { data: tpl } = await supabaseAdmin
      .from("form_templates")
      .select("slug, product_code, industry_code, version")
      .eq("id", form.template_id)
      .single();

    const formName =
      (tpl?.product_code ? `${tpl.product_code}` : "") +
        (tpl?.industry_code ? ` • ${tpl.industry_code}` : "") +
        (tpl?.version ? ` • v${tpl.version}` : "") ||
      tpl?.slug ||
      "Formulário";

    // 3) questions (grab config_json to resolve table column labels)
    const { data: questions, error: qErr } = await supabaseAdmin
      .from("template_questions")
      .select("id, order, label_json, type, config_json")
      .eq("template_id", form.template_id)
      .order("order", { ascending: true });

    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

    // 4) answers (schema uses value_json)
    const { data: answers, error: aErr } = await supabaseAdmin
      .from("form_answers")
      .select("question_id, value_json")
      .eq("form_id", formId);

    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

    // 5) table rows
    const { data: tableRows } = await supabaseAdmin
      .from("form_table_rows")
      .select("question_id, row_index, row_json")
      .eq("form_id", formId);

    // 6) attachments — ONLY for this form (NO storage fallback)
const { data: filesDb, error: filesErr } = await supabaseAdmin
  .from("form_files")
  .select("id, form_id, filename, storage_path")
  .eq("form_id", formId)
  .order("id", { ascending: true });

if (filesErr) {
  return NextResponse.json({ error: filesErr.message }, { status: 500 });
}

const attachments: { filename: string }[] = (filesDb || []).map((f) => ({
  filename: f.filename || (f.storage_path?.split("/").pop() || ""),
}));

    // maps
    const answerMap = new Map<number, any>();
    for (const a of answers || []) answerMap.set(a.question_id as number, a.value_json);

    const tableMap = new Map<number, any[]>();
    for (const r of tableRows || []) {
      const list = tableMap.get(r.question_id) || [];
      list.push(r);
      tableMap.set(r.question_id, list);
    }

    // Build a map of table column labels by question_id -> { key: label }
    const tableColLabel: Record<number, Record<string, string>> = {};
    for (const q of questions || []) {
      if ((q as any).type !== "table") continue;

      const cfg = (q as any).config_json || {};
      let columns: any[] = [];
      if (Array.isArray((cfg as any).columns)) columns = (cfg as any).columns;
      if (Array.isArray((cfg as any).table?.columns)) columns = (cfg as any).table.columns;

      const byKey: Record<string, string> = {};
      for (const c of columns) {
        const key = c?.key || c?.field || c?.code;
        const labelJson = c?.label_json || c?.label || {};
        const label =
          typeof labelJson === "object"
            ? labelJson[form.language] ||
              labelJson["pt-BR"] ||
              labelJson["en"] ||
              labelJson["es-419"]
            : String(labelJson ?? key);

        if (key) byKey[key] = label;
      }

      tableColLabel[(q as any).id] = byKey;
    }

    // 7) Build Q&A rows — HIDE attachment questions
    const qaItems: QAItem[] = (questions || [])
      .filter((q: any) => q.type !== "attachment")
      .map((q: any) => {
        const label =
          typeof q.label_json === "object"
            ? q.label_json[form.language] ||
              q.label_json["pt-BR"] ||
              q.label_json["en"] ||
              q.label_json["es-419"]
            : q.label_json || "";

        let answerStr = "-";
        const val = answerMap.get(q.id);

        switch (q.type) {
          case "boolean": {
            const vv = normalize(val);
            const b = typeof vv === "boolean" ? vv : vv?.value ?? vv?.val;
            const boolStr = b === true ? "Sim" : b === false ? "Não" : "-";
            const details = typeof vv === "object" && vv !== null ? (vv?.details ?? "") : "";
            answerStr = details ? `${boolStr}\nComentários: ${details}` : boolStr;
            break;
          }

          case "one_choice":
          case "oneChoice":
          case "select":
          case "radio":
            answerStr = fmtScalar(val);
            break;

          case "multiple_choice":
          case "multipleChoice":
          case "checkbox":
            answerStr = fmtArray(val);
            break;

          case "date":
            answerStr = fmtDate(val);
            break;

          case "currency":
            answerStr = fmtCurrency(val);
            break;

          case "number":
            answerStr = fmtScalar(val);
            break;

          case "text":
          case "long_text":
          case "longText":
            answerStr = fmtScalar(val);
            break;

          case "table": {
            const rows = (tableMap.get(q.id) || []).sort(
              (a: any, b: any) => (a.row_index ?? 0) - (b.row_index ?? 0)
            );

            if (!rows.length) {
              answerStr = "-";
            } else {
              const colMap = tableColLabel[q.id] || {};
              const lines = rows.map((r) => {
                const obj =
                  typeof r.row_json === "string"
                    ? normalize(r.row_json)
                    : r.row_json || {};
                return `• ${rowToPrettyLine(obj as Record<string, any>, colMap)}`;
              });
              answerStr = lines.join("\n");
            }
            break;
          }

          default:
            answerStr = fmtScalar(val);
        }

        return {
          order: q.order ?? 0,
          question: String(label || `Pergunta #${q.id}`),
          answer: String(answerStr || "-"),
        };
      });

    // 8) Logo
    let logoDataUrl = "";
    try {
      const logoPath = path.join(process.cwd(), "public", "covercap-logo.png");
      const bytes = await fs.readFile(logoPath);
      logoDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
    } catch {}

    // 9) Broker info
    const brokerInfo = {
      name: "Forters Corretora de Seguros LTDA",
      cnpj: "50.236.609/0001-32",
      susep: "2321454513",
    };

    // 10) Render and send
    const instance = (
      <FortersFormPdf
        logoDataUrl={logoDataUrl}
        companyName={form.respondent_company || "-"}
        formName={formName}
        filledAt={form.created_at}
        brokerInfo={brokerInfo}
        qaItems={qaItems}
        attachments={attachments}
      />
    );

    const pdfBuffer = await pdf(instance).toBuffer();

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="form_${formId}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
