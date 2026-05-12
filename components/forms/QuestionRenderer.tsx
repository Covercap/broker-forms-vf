"use client"

import type React from "react"
import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import type { FormLanguage } from "@/lib/languages"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Badge } from "@/components/ui/badge"
import { Plus, Upload, FileText, Trash2 } from "lucide-react"

/* =========================
   Types
   ========================= */

type I18n = Record<string, string>

type Option = { value: string; label: string; order?: number }

type FieldConfig = {
  min?: number
  max?: number
  step?: number
}

type TableSchemaField = {
  key: string
  type: "text" | "boolean" | "number" | "date" | "currency" | "single_select"
  label?: I18n | string
  required?: boolean
  readonly?: boolean
  options?: Option[]
  config?: FieldConfig
}

type TableRow = { row_index: number; row: Record<string, any> }

type TableConfig = {
  currency?: string
  decimals?: number

  // legacy (tech E&O) format:
  table_schema?: TableSchemaField[]

  // new format (cyber) format:
  columns?: any[]

  // attachments config (unused here but kept)
  max_mb?: number
  allowed?: string[]

  // table behavior flags
  mode?: "dynamic" | "fixed"
  allow_add_rows?: boolean
  allow_delete_rows?: boolean

  // row limits (IMPORTANT)
  maxRows?: number
  minRows?: number

  // legacy fixed-rows layout for other templates
  table_rows?: Array<{ code: string; title?: I18n; subtitle?: I18n }>
}

type Question = {
  code: string
  type:
    | "boolean"
    | "single_select"
    | "multi_select"
    | "date"
    | "currency"
    | "text"
    | "number"
    | "attachment"
    | "table"
  label: I18n | string
  help?: I18n | string
  config?: TableConfig
  options?: Option[]
  answer: any
  table_rows?: TableRow[]
}

type QuestionRendererProps = {
  question: Question
  questionNumber: number
  sectionTitle?: string
  locked: boolean
  onAnswerChange: (code: string, value: any) => void
  onTableRowChange?: (code: string, rowIndex: number, row: Record<string, any>) => void
  onAddTableRow?: (code: string) => void
  token?: string
}

/* =========================
   Helpers
   ========================= */

function i18nPick(obj: I18n | string | undefined, locale: string = "pt-BR", fallback = "") {
  if (!obj) return fallback
  if (typeof obj === "string") return obj
  return obj[locale] ?? obj["pt-BR"] ?? obj["en"] ?? Object.values(obj)[0] ?? fallback
}

/** Normalize table schema so we support BOTH formats:
 *  - legacy: config.table_schema
 *  - new:    config.columns
 */
function useNormalizedTableSchema(config: TableConfig | undefined, locale: string) {
  return useMemo<TableSchemaField[]>(() => {
    const cfg = config || {}

    // 1) Legacy path
    if (Array.isArray(cfg.table_schema) && cfg.table_schema.length > 0) {
      return cfg.table_schema
    }

    // 2) New path (columns)
    if (Array.isArray(cfg.columns) && cfg.columns.length > 0) {
      return cfg.columns.map((c: any) => {
        const opts: Option[] | undefined = Array.isArray(c.options)
          ? c.options.map((o: any) => ({
              value: String(o.value),
              label: i18nPick(o.label, locale, String(o.value)),
            }))
          : undefined

        const field: TableSchemaField = {
          key: String(c.key),
          type: (String(c.type) as TableSchemaField["type"]) || "text",
          label: c.label,
          required: !!c.required,
          readonly: !!c.readonly,
          options: opts,
          config: c.config || undefined, // IMPORTANT: pass min/max/etc through
        }
        return field
      })
    }

    return []
  }, [config, locale])
}

function clampNumber(n: number, min?: number, max?: number) {
  let v = n
  if (typeof min === "number" && Number.isFinite(min)) v = Math.max(min, v)
  if (typeof max === "number" && Number.isFinite(max)) v = Math.min(max, v)
  return v
}

/* =========================
   Component
   ========================= */

export function QuestionRenderer({
  question,
  questionNumber,
  sectionTitle,
  locked,
  onAnswerChange,
  onTableRowChange,
  onAddTableRow,
  token,
}: QuestionRendererProps) {
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // language from ?lang= in the URL (pt-BR / en / es)
  const searchParams = useSearchParams()
  const langParam = (searchParams?.get("lang") as FormLanguage | null) || null
  const locale: FormLanguage | "pt-BR" = langParam || "pt-BR"

  const renderSectionTitle = () => {
    if (!sectionTitle) return null
    return (
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-px bg-slate-300 flex-1" />
          <h2 className="text-lg font-semibold text-slate-700 px-4 py-2 bg-slate-100 rounded-full">
            {sectionTitle}
          </h2>
          <div className="h-px bg-slate-300 flex-1" />
        </div>
      </div>
    )
  }

  const renderQuestionHeader = () => (
    <CardHeader className="pb-4">
      <div className="flex items-start gap-3">
        <Badge
          variant="secondary"
          className="bg-blue-100 text-blue-700 font-semibold min-w-8 h-8 flex items-center justify-center rounded-full"
        >
          {questionNumber}
        </Badge>
        <div className="flex-1">
          <CardTitle className="text-lg font-semibold text-slate-800 leading-relaxed">
            {i18nPick(question.label, locale)}
          </CardTitle>
          {question.help && (
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              {i18nPick(question.help, locale)}
            </p>
          )}
        </div>
      </div>
    </CardHeader>
  )

  /* ========= Scalars ========= */

  const renderBooleanQuestion = () => {
    const raw = question.answer
    const boolValue: boolean | null =
      raw && typeof raw === "object" ? (raw.value ?? null) : raw === true ? true : raw === false ? false : null
    const details: string = raw && typeof raw === "object" ? (raw.details ?? "") : ""

    return (
      <CardContent className="space-y-4">
        <RadioGroup
          value={boolValue === true ? "true" : boolValue === false ? "false" : ""}
          onValueChange={(value) => {
            const newBool = value === "true"
            const rawCurrent = question.answer
            const currentDetails = rawCurrent && typeof rawCurrent === "object" ? (rawCurrent.details ?? "") : ""
            onAnswerChange(question.code, { value: newBool, details: currentDetails })
          }}
          disabled={locked}
          className="flex gap-6"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="true" id={`${question.code}-true`} />
            <Label htmlFor={`${question.code}-true`} className="font-medium text-slate-700">
              True
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="false" id={`${question.code}-false`} />
            <Label htmlFor={`${question.code}-false`} className="font-medium text-slate-700">
              False
            </Label>
          </div>
        </RadioGroup>

        <div>
          <Label htmlFor={`${question.code}-details`} className="text-sm text-slate-700">
            Comments (opcional)
          </Label>
          <Textarea
            id={`${question.code}-details`}
            value={details}
            onChange={(e) => {
              const rawCurrent = question.answer
              const currentBool: boolean | null =
                rawCurrent && typeof rawCurrent === "object"
                  ? rawCurrent.value ?? null
                  : rawCurrent === true
                  ? true
                  : rawCurrent === false
                  ? false
                  : null
              onAnswerChange(question.code, { value: currentBool, details: e.target.value })
            }}
            placeholder="Details"
            disabled={locked}
            className="mt-2 min-h-20 resize-none"
          />
        </div>
      </CardContent>
    )
  }

  const renderSingleSelect = () => (
    <CardContent>
      <Select value={question.answer || ""} onValueChange={(value) => onAnswerChange(question.code, value)} disabled={locked}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {(question.options || []).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </CardContent>
  )

  const renderMultiSelect = () => (
    <CardContent>
      <div className="space-y-3">
        {(question.options || []).map((option) => {
          const checked = Array.isArray(question.answer) && question.answer.includes(option.value)
          return (
            <div key={option.value} className="flex items-center space-x-3">
              <Checkbox
                id={`${question.code}-${option.value}`}
                checked={checked}
                onCheckedChange={(isChecked) => {
                  const currentValues = Array.isArray(question.answer) ? question.answer : []
                  const newValues = isChecked ? [...currentValues, option.value] : currentValues.filter((v) => v !== option.value)
                  onAnswerChange(question.code, newValues)
                }}
                disabled={locked}
              />
              <Label htmlFor={`${question.code}-${option.value}`} className="font-medium text-slate-700">
                {option.label}
              </Label>
            </div>
          )
        })}
      </div>
    </CardContent>
  )

  const renderTextQuestion = () => (
    <CardContent>
      <Textarea
        value={(question.answer as string) || ""}
        onChange={(e) => onAnswerChange(question.code, e.target.value)}
        placeholder="Type"
        disabled={locked}
        className="min-h-24 resize-none"
      />
    </CardContent>
  )

  const renderNumberQuestion = () => (
    <CardContent>
      <Input
        type="number"
        value={question.answer || ""}
        onChange={(e) => {
          const value = e.target.value === "" ? null : Number(e.target.value)
          onAnswerChange(question.code, value)
        }}
        placeholder="Número"
        disabled={locked}
      />
    </CardContent>
  )

  const renderDateQuestion = () => (
    <CardContent>
      <Input type="date" value={(question.answer as string) || ""} onChange={(e) => onAnswerChange(question.code, e.target.value)} disabled={locked} />
    </CardContent>
  )

  const renderCurrencyQuestion = () => {
    const decimals = question.config?.decimals ?? 2
    const hasSelector = !!(question.config as any)?.currencySelector
    const availableCurrencies: string[] = (question.config as any)?.currencies ?? ["BRL"]
    const CURRENCY_SYMBOLS: Record<string, string> = {
      BRL: "R$", USD: "US$", COP: "COP$", MXN: "MX$", ARS: "AR$",
    }

    // Currency comes from the answer (dynamic) or config (static)
    const activeCurrency: string = question.answer?.currency ?? (question.config as any)?.currency ?? "BRL"
    const cents: number | null = question.answer?.amount_cents ?? null

    // Format for display using pt-BR locale: 1.000.000,00
    const formatDisplay = (c: number | null) => {
      if (c == null) return ""
      return (c / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    }

    const handleAmountChange = (raw: string) => {
      // Strip thousand separators (.) and replace decimal separator (,) with (.)
      const clean = raw.replace(/\./g, "").replace(",", ".")
      const num = Number.isFinite(Number(clean)) ? Number(clean) : 0
      onAnswerChange(question.code, {
        amount_cents : Math.round(num * 10 ** decimals),
        currency     : activeCurrency,
      })
    }

    const handleCurrencyChange = (newCurrency: string) => {
      onAnswerChange(question.code, {
        amount_cents : cents ?? 0,
        currency     : newCurrency,
      })
    }

    return (
      <CardContent>
        <div className="flex items-center gap-2">
          {hasSelector ? (
            <Select value={activeCurrency} onValueChange={handleCurrencyChange} disabled={locked}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableCurrencies.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CURRENCY_SYMBOLS[c] ?? c} {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-slate-600 font-medium">
              {CURRENCY_SYMBOLS[activeCurrency] ?? activeCurrency}
            </span>
          )}
          <Input
            value={formatDisplay(cents)}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder={formatDisplay(0)}
            disabled={locked}
            className="flex-1"
          />
        </div>
      </CardContent>
    )
  }

  /* ========= Attachments (multi-file) ========= */

  type FileMetadata = {
    bucket      : string
    objectKey   : string
    filename    : string
    size        : number
    contentType : string
  }

  // Normalise answer to array — backwards-compatible with legacy single-object answers
  const existingFiles: FileMetadata[] = Array.isArray(question.answer)
    ? question.answer
    : question.answer?.filename
    ? [question.answer as FileMetadata]
    : []

  const renderAttachmentQuestion = () => {
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !token) return

      setUploadBusy(true)
      setUploadError(null)

      try {
        // Step 1 — get signed upload URL
        const response = await fetch("/api/upload", {
          method : "POST",
          headers: { "content-type": "application/json" },
          body   : JSON.stringify({
            token,
            questionCode: question.code,
            fileName    : file.name,
            contentType : file.type || "application/octet-stream",
          }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || "Falha ao criar URL de upload")

        // Step 2 — PUT directly to Supabase Storage
        const uploadResponse = await fetch(result.uploadUrl, {
          method : "PUT",
          headers: { "content-type": result.contentType },
          body   : file,
        })
        if (!uploadResponse.ok) throw new Error("Falha no upload")

        // Step 3 — record in form_files table
        const recordResponse = await fetch("/api/upload/record", {
          method : "POST",
          headers: { "content-type": "application/json" },
          body   : JSON.stringify({
            token,
            questionCode: question.code,
            objectKey   : result.objectKey,
            fileName    : file.name,
            size        : file.size,
          }),
        })
        const recordResult = await recordResponse.json().catch(() => ({}))
        if (!recordResponse.ok) {
          throw new Error(recordResult.error || "Falha ao registrar anexo no banco")
        }

        // Step 4 — append to answer array
        const newFile: FileMetadata = {
          bucket     : result.bucket,
          objectKey  : result.objectKey,
          filename   : file.name,
          size       : file.size,
          contentType: file.type || "application/octet-stream",
        }
        onAnswerChange(question.code, [...existingFiles, newFile])
      } catch (error: any) {
        setUploadError(error.message)
      } finally {
        setUploadBusy(false)
        e.target.value = ""
      }
    }

    const handleRemove = async (objectKey: string) => {
      if (!token) return
      // Optimistic UI — remove immediately
      const updated = existingFiles.filter((f) => f.objectKey !== objectKey)
      onAnswerChange(question.code, updated)

      // Best-effort server delete (non-fatal)
      await fetch("/api/upload/remove", {
        method : "POST",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({ token, objectKey }),
      }).catch(() => {})
    }

    const formatSize = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    return (
      <CardContent>
        <div className="space-y-3">
          {/* Uploaded files list */}
          {existingFiles.map((f) => (
            <div
              key={f.objectKey}
              className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg"
            >
              <FileText className="h-4 w-4 text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-800 truncate">{f.filename}</p>
                <p className="text-xs text-green-600">{formatSize(f.size)}</p>
              </div>
              {!locked && (
                <button
                  onClick={() => handleRemove(f.objectKey)}
                  className="text-red-400 hover:text-red-600 transition-colors shrink-0"
                  title="Remover arquivo"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          {/* Upload button — always visible */}
          {!locked && (
            <div>
              <Button
                variant="outline"
                disabled={uploadBusy}
                className="flex items-center gap-2 bg-transparent"
                onClick={() => document.getElementById(`file-${question.code}`)?.click()}
              >
                <Upload className="h-4 w-4" />
                {uploadBusy ? "Enviando..." : existingFiles.length > 0 ? "Adicionar arquivo" : "File"}
              </Button>
              <input
                id={`file-${question.code}`}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                disabled={uploadBusy}
              />
            </div>
          )}

          {uploadError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <span className="text-sm text-red-700">Erro: {uploadError}</span>
            </div>
          )}
        </div>
      </CardContent>
    )
  }

  /* ========= Tables ========= */

  const renderTableQuestion = () => {
    const cfg = (question.config || {}) as TableConfig
    const schema = useNormalizedTableSchema(cfg, locale)

    const mode: "dynamic" | "fixed" = cfg.mode ?? "dynamic"
    const maxRows = typeof cfg.maxRows === "number" ? cfg.maxRows : undefined

    const fixedDefs = (cfg.table_rows || []).map((r) => ({ code: r.code, title: r.title, subtitle: r.subtitle }))

    const dynamicRows = question.table_rows || []
    const byIndex = new Map<number, { row_index: number; row: Record<string, any> }>()
    for (const r of dynamicRows) byIndex.set(r.row_index, r)

    const rows =
      mode === "fixed"
        ? fixedDefs.map((r, idx) => {
            const row_index = idx + 1
            const match = byIndex.get(row_index)
            return { row_index, row: match?.row || {}, __meta: r as any }
          })
        : dynamicRows.map((r) => ({ ...r, __meta: undefined }))

    // IMPORTANT: allowAdd must respect BOTH allow_add_rows and maxRows
    const allowAddFlag = cfg.allow_add_rows ?? true
    const belowMax = typeof maxRows === "number" ? rows.length < maxRows : true
    const allowAdd = mode !== "fixed" && allowAddFlag && belowMax

    const fieldLabel = (field: TableSchemaField) => {
      if (!field.label) return field.key
      return i18nPick(field.label as any, locale, field.key)
    }

    return (
      <CardContent>
        <div className="space-y-4">
          {schema.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Configuração de tabela sem colunas para <strong>{question.code}</strong>. Verifique se o backend envia
              <code> config.columns </code> ou <code> config.table_schema</code>.
            </div>
          )}

          {rows.map((row) => (
            <div key={row.row_index} className="rounded-lg border p-3 bg-slate-50/50 space-y-3">
              {row.__meta && (
                <div className="mb-1">
                  <div className="text-sm font-medium">{i18nPick(row.__meta.title as any, locale)}</div>
                  {row.__meta.subtitle && <div className="text-xs text-slate-500">{i18nPick(row.__meta.subtitle as any, locale)}</div>}
                </div>
              )}

              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${schema.length || 1}, 1fr)` }}>
                {schema.map((field) => {
                  const value = row.row?.[field.key]
                  const ro = !!field.readonly
                  const required = !!field.required

                  if (field.type === "boolean") {
                    return (
                      <div key={`${row.row_index}-${field.key}`} className="flex items-center space-x-2">
                        <Checkbox
                          checked={!!value}
                          onCheckedChange={(checked) => {
                            if (onTableRowChange) {
                              const newRow = { ...row.row, [field.key]: checked }
                              onTableRowChange(question.code, row.row_index, newRow)
                            }
                          }}
                          disabled={locked || ro}
                        />
                        <Label className="text-sm">{fieldLabel(field)}</Label>
                      </div>
                    )
                  }

                  if (field.type === "single_select") {
                    const opts = field.options || []
                    return (
                      <div key={`${row.row_index}-${field.key}`} className="flex flex-col">
                        <label className="text-xs font-medium mb-1">
                          {fieldLabel(field)} {required ? <span className="text-red-500">*</span> : null}
                        </label>
                        <Select
                          value={value ?? ""}
                          onValueChange={(val) => {
                            if (onTableRowChange) {
                              const newRow = { ...row.row, [field.key]: val }
                              onTableRowChange(question.code, row.row_index, newRow)
                            }
                          }}
                          disabled={locked || ro}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {opts.map((op) => (
                              <SelectItem key={op.value} value={op.value}>
                                {op.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  }

                  // Number/date/text
                  const min = field.config?.min
                  const max = field.config?.max
                  const step = field.config?.step ?? (field.type === "number" ? 1 : undefined)

                  return (
                    <div key={`${row.row_index}-${field.key}`} className="flex flex-col">
                      <label className="text-xs font-medium mb-1">
                        {fieldLabel(field)} {required ? <span className="text-red-500">*</span> : null}
                      </label>
                      <Input
                        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                        value={value ?? ""}
                        min={field.type === "number" && typeof min === "number" ? min : undefined}
                        max={field.type === "number" && typeof max === "number" ? max : undefined}
                        step={field.type === "number" ? step : undefined}
                        onChange={(e) => {
                          if (!onTableRowChange) return

                          let newValue: any = e.target.value

                          if (field.type === "number") {
                            if (e.target.value === "") {
                              newValue = null
                            } else {
                              const num = Number(e.target.value)
                              newValue = Number.isFinite(num) ? clampNumber(num, min, max) : null
                            }
                          }

                          const newRow = { ...row.row, [field.key]: newValue }
                          onTableRowChange(question.code, row.row_index, newRow)
                        }}
                        disabled={locked || ro}
                        className="text-sm"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {!locked && allowAdd && onAddTableRow && (
            <Button variant="outline" onClick={() => onAddTableRow(question.code)} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Adicionar Linha
            </Button>
          )}
        </div>
      </CardContent>
    )
  }

  const renderQuestionContent = () => {
    switch (question.type) {
      case "boolean":
        return renderBooleanQuestion()
      case "single_select":
        return renderSingleSelect()
      case "multi_select":
        return renderMultiSelect()
      case "text":
        return renderTextQuestion()
      case "number":
        return renderNumberQuestion()
      case "date":
        return renderDateQuestion()
      case "currency":
        return renderCurrencyQuestion()
      case "attachment":
        return renderAttachmentQuestion()
      case "table":
        return renderTableQuestion()
      default:
        return (
          <CardContent>
            <div className="text-slate-500">Tipo de pergunta não suportado: {question.type}</div>
          </CardContent>
        )
    }
  }

  return (
    <div>
      {renderSectionTitle()}
      <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-sm">
        {renderQuestionHeader()}
        {renderQuestionContent()}
      </Card>
    </div>
  )
}
