"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Shield,
  Settings,
  LinkIcon,
  CheckCircle2,
  AlertCircle,
  Mail,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { FormLanguage } from "@/lib/languages";

type Template = {
  id: number;
  slug: string;
  product_code: string | null;
  industry_code: string | null;
  version: string | null;
  status: string | null;
};

type DealType = "new_business" | "renewal";
type Mode = "hub" | "templates" | "forms";

export default function AdminPage() {
  const [adminSecret, setAdminSecret] = useState("");
  const [isAuthed, setIsAuthed] = useState(false);
  const [mode, setMode] = useState<Mode>("hub");

  useEffect(() => {
    const saved = localStorage.getItem("adminSecret");
    if (saved) {
      setAdminSecret(saved);
      setIsAuthed(true);
      setMode("hub");
    }
  }, []);

  function handleLogin() {
    if (!adminSecret) { alert("Ingresa la contraseña"); return; }
    localStorage.setItem("adminSecret", adminSecret);
    setIsAuthed(true);
    setMode("hub");
  }

  function handleLogout() {
    localStorage.removeItem("adminSecret");
    setAdminSecret("");
    setIsAuthed(false);
    setMode("hub");
  }

  /* ── Login screen ── */
  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="w-full bg-white shadow-sm border-b border-slate-200">
          <div className="container mx-auto px-4 py-6 max-w-4xl">
            <div className="flex justify-center">
              <Image src="/covercap-logo.png" alt="CoverCap" width={200} height={80} className="h-16 w-auto" />
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 py-8 max-w-xl">
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200">
            <CardHeader className="bg-slate-50/50">
              <CardTitle className="flex items-center gap-2 text-slate-800">
                <Shield className="h-5 w-5 text-teal-600" />
                Autenticação
              </CardTitle>
              <CardDescription>Digite sua chave para entrar no painel administrativo</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <Label htmlFor="admin-secret" className="text-slate-700 font-medium">
                    Chave do Administrador
                  </Label>
                  <Input
                    id="admin-secret"
                    type="password"
                    value={adminSecret}
                    onChange={(e) => setAdminSecret(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    placeholder="Digite seu ADMIN_SECRET"
                    className="mt-2"
                  />
                </div>
                <Button onClick={handleLogin} disabled={!adminSecret} className="bg-[#FF5722] hover:bg-[#ff6e42] text-white">
                  Entrar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  /* ── Hub ── */
  if (mode === "hub") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="w-full bg-white shadow-sm border-b border-slate-200">
          <div className="container mx-auto px-4 py-6 max-w-4xl">
            <div className="flex justify-between items-center">
              <Image src="/covercap-logo.png" alt="CoverCap" width={160} height={64} className="h-12 w-auto" />
              <Button variant="outline" onClick={handleLogout}>Sair</Button>
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
          <div className="text-center mb-2">
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Painel Administrativo</h1>
            <p className="text-slate-600">Selecione um módulo para continuar</p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-white/80 backdrop-blur-sm border-slate-200">
              <CardHeader className="bg-slate-50/50">
                <CardTitle className="flex items-center gap-2 text-slate-800">
                  <Settings className="h-5 w-5 text-blue-600" />
                  Templates
                </CardTitle>
                <CardDescription>Gerar links de formulários e gerenciar negócios no HubSpot.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <Button onClick={() => setMode("templates")}>Ir a Templates</Button>
              </CardContent>
            </Card>
            <Card className="bg-white/80 backdrop-blur-sm border-slate-200">
              <CardHeader className="bg-slate-50/50">
                <CardTitle className="flex items-center gap-2 text-slate-800">
                  <LinkIcon className="h-5 w-5 text-orange-600" />
                  Forms (seguimento)
                </CardTitle>
                <CardDescription>Ver estado dos formulários e baixar PDF/ZIP.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <Button onClick={() => setMode("forms")}>Ir a Forms</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "templates") {
    return <TemplatesModule adminSecretFromHub={adminSecret} onBack={() => setMode("hub")} onLogout={handleLogout} />;
  }

  if (mode === "forms") {
    return <FormsModule adminSecret={adminSecret} onBack={() => setMode("hub")} onLogout={handleLogout} />;
  }

  return null;
}

/* ================================================================
   TEMPLATES MODULE
   ================================================================ */
function TemplatesModule({
  adminSecretFromHub,
  onBack,
  onLogout,
}: {
  adminSecretFromHub: string;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [adminSecret, setAdminSecret] = useState(adminSecretFromHub || "");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [dealType, setDealType] = useState<DealType>("new_business");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [lang, setLang] = useState<FormLanguage>("pt-BR");
  const [ttl, setTtl] = useState(60 * 24 * 30);
  // Renewal: deal ID entered up front
  const [renewalDealId, setRenewalDealId] = useState("");
  // Post-generation state
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ form_id?: string; token?: string } | null>(null);
  const [generatedToken, setGeneratedToken] = useState("");
  // New Business: HubSpot deal creation result
  const [hsDealId, setHsDealId] = useState<string | null>(null);
  const [hsDealName, setHsDealName] = useState<string | null>(null);
  const [hsContactId, setHsContactId] = useState<string | null>(null);
  const [hsCreating, setHsCreating] = useState(false);
  const [hsError, setHsError] = useState<string | null>(null);
  // Email sending state
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);
  const [sendingEmail, setSendingEmail]          = useState(false);
  const [emailSent, setEmailSent]                = useState(false);

  const [senderEmail, setSenderEmail] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  const origin  = typeof window !== "undefined" ? window.location.origin : "";
  const formUrl = result?.form_id && result?.token
    ? `${origin}/f/${result.form_id}?lang=${lang}&t=${result.token}`
    : "";

  /* Derive product_code from selected template */
  const selectedTemplate = templates.find((t) => t.slug === selectedSlug);
  const productCode = selectedTemplate?.product_code || selectedSlug;

  /* ── load templates ── */
  async function loadTemplates() {
    setError(null);
    setTemplates([]);
    setSelectedSlug("");
    const res  = await fetch("/api/admin/templates", {
      method  : "POST",
      headers : { "content-type": "application/json" },
      body    : JSON.stringify({ adminSecret }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Erro ao listar templates");
      toast({ title: "Erro", description: json.error || "Erro ao listar templates", variant: "destructive" });
      return;
    }
    setTemplates(json.templates || []);
    if (json.templates?.length) setSelectedSlug(json.templates[0].slug);
    toast({ title: "Sucesso", description: `${json.templates?.length || 0} templates carregados` });
  }

  /* ── copy URL ── */
  async function copyUrl() {
    if (!formUrl) return;
    try {
      await navigator.clipboard.writeText(formUrl);
      toast({ title: "URL copiada", description: "A URL foi copiada para a área de transferência" });
    } catch {
      toast({ title: "Erro ao copiar", description: "Copie manualmente a URL", variant: "destructive" });
    }
  }

  /* ── create link (+ conditional HubSpot for new_business) ── */
  async function createLink() {
    setCreating(true);
    setError(null);
    setResult(null);
    setGeneratedToken("");
    setHsDealId(null);
    setHsDealName(null);
    setHsContactId(null);
    setHsError(null);
    setEmailSent(false);

    /* Validate renewal deal ID */
    if (dealType === "renewal" && !renewalDealId.trim()) {
      setError("Para Renovação, informe o HubSpot Deal ID antes de gerar o link.");
      setCreating(false);
      return;
    }

    /* 1. Create form instance in Supabase */
    const createBody: Record<string, any> = {
      adminSecret,
      templateSlug : selectedSlug,
      company,
      contact      : { name: contactName, email: contactEmail, phone: contactPhone },
      ttlMinutes   : ttl,
      dealType,
      website      : website.trim() || undefined,
    };
    if (dealType === "renewal" && renewalDealId) {
      createBody.hubspotDealId = renewalDealId.replace(/\D/g, "");
    }

    const res  = await fetch("/api/admin/create", {
      method  : "POST",
      headers : { "content-type": "application/json" },
      body    : JSON.stringify(createBody),
    });
    const json = await res.json();
    setCreating(false);

    if (!res.ok) {
      setError(json.error || "Erro ao criar link");
      toast({ title: "Erro", description: json.error || "Erro ao criar link", variant: "destructive" });
      return;
    }

    setResult(json);
    const token = json?.token || "";
    setGeneratedToken(token);

    toast({ title: "Link criado com sucesso", description: "O link seguro foi gerado e está pronto para uso" });

    /* 2. New Business: auto-create HubSpot deal + contact */
    if (dealType === "new_business" && json?.form_id) {
      setHsCreating(true);
      try {
        // Construct the form URL so it can be stored as form_link in HubSpot
        const generatedFormUrl = `${origin}/f/${json.form_id}?lang=${lang}&t=${json.token}`;

        const hsRes  = await fetch("/api/admin/hubspot/create-deal", {
          method  : "POST",
          headers : { "content-type": "application/json" },
          body    : JSON.stringify({
            adminSecret,
            formId       : json.form_id,
            company,
            contactName,
            contactEmail,
            contactPhone,
            productCode,
            formUrl      : generatedFormUrl, // stored in form_link deal property
            lang,                             // 'pt-BR' → deal_country = Brazil
            website,                          // included in the note
          }),
        });
        const hsJson = await hsRes.json();

        if (!hsRes.ok || !hsJson.ok) {
          throw new Error(hsJson.error || "Falha ao criar negócio no HubSpot");
        }

        setHsDealId(hsJson.dealId);
        setHsDealName(hsJson.dealName);
        setHsContactId(hsJson.contactId);
        toast({
          title       : "Negócio criado no HubSpot",
          description : `Deal ID: ${hsJson.dealId} — "${hsJson.dealName}"`,
        });
      } catch (e: any) {
        const msg = e?.message || String(e);
        setHsError(msg);
        toast({
          title       : "HubSpot: erro ao criar negócio",
          description : msg + " — O link ainda é válido. Adicione o Deal ID manualmente se necessário.",
          variant     : "destructive",
        });
      } finally {
        setHsCreating(false);
      }
    }

    /* 3. Renewal: update existing HubSpot deal with form_link + note */
    if (dealType === "renewal" && json?.form_id && renewalDealId) {
      setHsCreating(true);
      try {
        const generatedFormUrl = `${origin}/f/${json.form_id}?lang=${lang}&t=${json.token}`;

        const hsRes  = await fetch("/api/admin/hubspot/update-deal", {
          method  : "POST",
          headers : { "content-type": "application/json" },
          body    : JSON.stringify({
            adminSecret,
            formId       : json.form_id,
            dealId       : renewalDealId,
            formUrl      : generatedFormUrl,
            company,
            contactName,
            contactEmail,
            contactPhone,
            website,
          }),
        });
        const hsJson = await hsRes.json();

        if (!hsRes.ok || !hsJson.ok) {
          throw new Error(hsJson.error || "Falha ao atualizar negócio no HubSpot");
        }

        toast({
          title       : "HubSpot atualizado",
          description : `Link e nota adicionados ao Deal ${renewalDealId}.`,
        });
      } catch (e: any) {
        const msg = e?.message || String(e);
        setHsError(msg);
        toast({
          title       : "HubSpot: erro ao atualizar negócio",
          description : msg + " — O link ainda é válido.",
          variant     : "destructive",
        });
      } finally {
        setHsCreating(false);
      }
    }
  }

  /* ── send form URL by email via SendGrid ── */
  async function sendEmail() {
    if (!formUrl || !contactEmail) return;
    setSendingEmail(true);

    const productLabel =
      ((selectedTemplate?.product_code || "") +
        " / " +
        (selectedTemplate?.industry_code || "") +
        " v" +
        (selectedTemplate?.version || "")).trim();

    try {
      const res  = await fetch("/api/admin/send-form-email", {
        method  : "POST",
        headers : { "content-type": "application/json" },
        body    : JSON.stringify({
          adminSecret,
          fromEmail   : senderEmail,
          toEmail     : contactEmail,
          dealId      : hsDealId || renewalDealId || undefined,
          lang,
          dynamicData : {
            contact_name : contactName || "",
            company_name : company     || "",
            product_name : productLabel,
            form_url     : formUrl,
          },
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Falha ao enviar email");
      }

      setEmailSent(true);
      setShowEmailConfirm(false);
      toast({ title: "Email enviado com sucesso", description: `Email enviado para ${contactEmail}` });
    } catch (e: any) {
      toast({
        title       : "Erro ao enviar email",
        description : e?.message || String(e),
        variant     : "destructive",
      });
    } finally {
      setSendingEmail(false);
    }
  }

  /* ── UI ── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="w-full bg-white shadow-sm border-b border-slate-200">
        <div className="container mx-auto px-4 py-6 max-w-4xl">
          <div className="flex justify-between items-center">
            <Image src="/covercap-logo.png" alt="CoverCap" width={160} height={64} className="h-12 w-auto" />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onBack}>← Voltar</Button>
              <Button variant="outline" onClick={onLogout}>Sair</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Painel Administrativo</h1>
          <p className="text-slate-600">Geração de links seguros para questionários de seguros</p>
        </div>

        <div className="space-y-6">
          {/* ── Auth card ── */}
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200">
            <CardHeader className="bg-slate-50/50">
              <CardTitle className="flex items-center gap-2 text-slate-800">
                <Shield className="h-5 w-5 text-teal-600" />
                Autenticação
              </CardTitle>
              <CardDescription>Digite sua chave secreta para acessar os templates</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <Label htmlFor="admin-secret" className="text-slate-700 font-medium">
                    Chave Secreta do Administrador
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="admin-secret"
                      type={showPassword ? "text" : "password"}
                      value={adminSecret}
                      onChange={(e) => setAdminSecret(e.target.value)}
                      placeholder="Digite seu ADMIN_SECRET"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword
                        ? <EyeOff className="h-4 w-4 text-slate-500" />
                        : <Eye  className="h-4 w-4 text-slate-500" />}
                    </Button>
                  </div>
                </div>
                <Button
                  onClick={loadTemplates}
                  disabled={!adminSecret}
                  className="bg-[#FF5722] hover:bg-[#ff6e42] text-white"
                >
                  Carregar Templates
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Config card (shown after templates load) ── */}
          {templates.length > 0 && (
            <>
              <Card className="bg-blue-50/50 backdrop-blur-sm border-blue-200">
                <CardHeader className="bg-blue-100/50">
                  <CardTitle className="flex items-center gap-2 text-slate-800">
                    <Settings className="h-5 w-5 text-blue-600" />
                    Configuração do Questionário
                  </CardTitle>
                  <CardDescription>
                    Selecione o template e configure as informações da empresa
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">

                  {/* Template select */}
                  <div>
                    <Label htmlFor="template-select" className="text-slate-700 font-medium">
                      Produto / Template
                    </Label>
                    <Select value={selectedSlug} onValueChange={setSelectedSlug}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Selecione um template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.slug} value={t.slug}>
                            {(t.product_code || "produto") +
                              " / " +
                              (t.industry_code || "indústria") +
                              " v" +
                              (t.version || "-") +
                              " — " +
                              t.slug}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Deal type */}
                  <div>
                    <Label htmlFor="deal-type" className="text-slate-700 font-medium">
                      Tipo de Negócio
                    </Label>
                    <Select
                      value={dealType}
                      onValueChange={(v) => {
                        setDealType(v as DealType);
                        setRenewalDealId("");
                      }}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new_business">Novo Negócio (New Business)</SelectItem>
                        <SelectItem value="renewal">Renovação (Renewal)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-1">
                      {dealType === "new_business"
                        ? "Um novo negócio e contato serão criados automaticamente no HubSpot."
                        : "Informe o Deal ID existente no HubSpot para vincular esta renovação."}
                    </p>
                  </div>

                  {/* Renewal: HubSpot Deal ID (required before generation) */}
                  {dealType === "renewal" && (
                    <div>
                      <Label htmlFor="renewal-deal-id" className="text-slate-700 font-medium">
                        HubSpot Deal ID{" "}
                        <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="renewal-deal-id"
                        type="text"
                        inputMode="numeric"
                        pattern="\d*"
                        placeholder="Ex.: 41368145976"
                        value={renewalDealId}
                        onChange={(e) => setRenewalDealId(e.target.value.replace(/\D/g, ""))}
                        className="mt-2"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Cole o ID numérico do negócio existente no HubSpot. O formulário será vinculado a este negócio ao ser submetido.
                      </p>
                    </div>
                  )}

                  {/* Company name */}
                  <div>
                    <Label htmlFor="company" className="text-slate-700 font-medium">
                      Nome da Empresa
                    </Label>
                    <Input
                      id="company"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Ex: Empresa Exemplo SA"
                      className="mt-2"
                    />
                  </div>

                  {/* Website */}
                  <div>
                    <Label htmlFor="website" className="text-slate-700 font-medium">
                      Website da Empresa
                    </Label>
                    <Input
                      id="website"
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://empresa.com.br"
                      className="mt-2"
                    />
                  </div>

                  {/* Sender email (account manager) */}
                  <div>
                    <Label htmlFor="sender-email" className="text-slate-700 font-medium">
                      Seu email (remetente)
                    </Label>
                    <Input
                      id="sender-email"
                      type="email"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value.trim())}
                      placeholder="seunome@covercap.co"
                      className={`mt-2 ${
                        senderEmail && !senderEmail.toLowerCase().endsWith("@covercap.co")
                          ? "border-red-400 focus-visible:ring-red-400"
                          : ""
                      }`}
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      O cliente receberá o email enviado por você. Deve ser um endereço <strong>@covercap.co</strong>.
                    </p>
                    {senderEmail && !senderEmail.toLowerCase().endsWith("@covercap.co") && (
                      <p className="text-xs text-red-500 mt-1">
                        Use um endereço @covercap.co (ex: seunome@covercap.co)
                      </p>
                    )}
                  </div>

                  {/* Contact info */}
                  <div>
                    <Label className="text-slate-700 font-medium mb-3 block">
                      Informações de Contato
                    </Label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="contact-name" className="text-sm text-slate-600">Nome do Contato</Label>
                        <Input
                          id="contact-name"
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                          placeholder="Nome completo"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contact-email" className="text-sm text-slate-600">Email</Label>
                        <Input
                          id="contact-email"
                          type="email"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          placeholder="email@empresa.com"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contact-phone" className="text-sm text-slate-600">Telefone</Label>
                        <Input
                          id="contact-phone"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          placeholder="+55 11 99999-9999"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Language + TTL */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="language" className="text-slate-700 font-medium">
                        Idioma do Questionário
                      </Label>
                      <Select value={lang} onValueChange={(v) => setLang(v as FormLanguage)}>
                        <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                          <SelectItem value="es">Español</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="ttl" className="text-slate-700 font-medium">
                        Validade (minutos)
                      </Label>
                      <Input
                        id="ttl"
                        type="number"
                        value={ttl}
                        onChange={(e) => setTtl(Number(e.target.value || 0))}
                        className="mt-2"
                        min="1"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Generate button card */}
              <Card className="bg-white/80 backdrop-blur-sm border-slate-200">
                <CardHeader className="bg-slate-50/50">
                  <CardTitle className="flex items-center gap-2 text-slate-800">
                    <LinkIcon className="h-5 w-5 text-orange-600" />
                    Geração do Link Seguro
                  </CardTitle>
                  <CardDescription>
                    {dealType === "new_business"
                      ? "Cria o link e abre automaticamente um novo negócio no HubSpot."
                      : "Cria o link e vincula ao negócio de renovação informado."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <Button
                    onClick={createLink}
                    disabled={
                      !selectedSlug ||
                      !company ||
                      !adminSecret ||
                      creating ||
                      hsCreating ||
                      (dealType === "renewal" && !renewalDealId)
                    }
                    className="bg-orange-600 hover:bg-orange-700 text-white w-full md:w-auto"
                    size="lg"
                  >
                    {creating
                      ? "Gerando Link..."
                      : hsCreating
                      ? "Criando Negócio no HubSpot..."
                      : "Gerar Link Seguro"}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {/* ── Result card ── */}
          {formUrl && (
            <Card className="bg-green-50/50 backdrop-blur-sm border-green-200">
              <CardHeader className="bg-green-100/50">
                <CardTitle className="flex items-center gap-2 text-slate-800">
                  <LinkIcon className="h-5 w-5 text-green-600" />
                  Link Gerado com Sucesso
                </CardTitle>
                <CardDescription>Compartilhe este link seguro com o cliente</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">

                {/* URL display */}
                <div className="p-4 bg-white rounded-lg border border-green-200">
                  <Label className="text-sm font-medium text-slate-700 mb-2 block">
                    URL do Questionário
                  </Label>
                  <div className="font-mono text-sm text-slate-600 break-all bg-slate-50 p-3 rounded border">
                    {formUrl}
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-3">
                  <Button onClick={copyUrl} variant="outline" className="flex items-center gap-2 bg-transparent">
                    <Copy className="h-4 w-4" />
                    Copiar URL
                  </Button>
                  <Button onClick={() => window.open(formUrl, "_blank")} variant="outline" className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Abrir Link
                  </Button>
                  <Button
                    onClick={() => {
                      if (!senderEmail || !senderEmail.toLowerCase().endsWith("@covercap.co")) {
                        toast({
                          title       : "Seu email é obrigatório",
                          description : "Preencha seu email @covercap.co no campo 'Seu email (remetente)'.",
                          variant     : "destructive",
                        });
                        return;
                      }
                      if (!contactEmail) {
                        toast({
                          title       : "Email do contato ausente",
                          description : "Preencha o email do contato antes de enviar.",
                          variant     : "destructive",
                        });
                        return;
                      }
                      setShowEmailConfirm(true);
                    }}
                    disabled={sendingEmail || emailSent}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <Mail className="h-4 w-4" />
                    {emailSent ? "Email Enviado ✓" : "Enviar por Email"}
                  </Button>
                </div>

                {/* New Business: HubSpot status panel */}
                {dealType === "new_business" && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 space-y-2">
                    <p className="text-sm font-semibold text-blue-800">HubSpot — Novo Negócio</p>

                    {hsCreating && (
                      <p className="text-sm text-blue-700 animate-pulse">
                        Criando negócio e contato no HubSpot…
                      </p>
                    )}

                    {hsDealId && !hsCreating && (
                      <div className="space-y-1 text-sm text-blue-900">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          <span>
                            <strong>Deal criado:</strong>{" "}
                            <a
                              href={`https://app.hubspot.com/contacts/deals/${hsDealId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              {hsDealId}
                            </a>{" "}
                            — {hsDealName}
                          </span>
                        </div>
                        {hsContactId && (
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                            <span>
                              <strong>Contato criado:</strong>{" "}
                              <a
                                href={`https://app.hubspot.com/contacts/${hsContactId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline"
                              >
                                {hsContactId}
                              </a>
                            </span>
                          </div>
                        )}
                        <p className="text-xs text-blue-700 mt-1">
                          Ao submeter o formulário, o negócio será movido automaticamente para a etapa <strong>Qualificação</strong>.
                        </p>
                      </div>
                    )}

                    {hsError && !hsCreating && (
                      <div className="flex items-start gap-2 text-sm text-red-700">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>
                          Erro HubSpot: {hsError}. O link é válido, mas você precisará adicionar o Deal ID manualmente abaixo se necessário.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Renewal: confirmation of linked deal */}
                {dealType === "renewal" && renewalDealId && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      <span>
                        Formulário vinculado ao Deal ID{" "}
                        <strong>
                          <a
                            href={`https://app.hubspot.com/contacts/deals/${renewalDealId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            {renewalDealId}
                          </a>
                        </strong>{" "}
                        no HubSpot. Ao submeter, o negócio avançará para <strong>Waiting for Proposal</strong>.
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Email confirmation overlay ── */}
          {showEmailConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-100">
                  <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <Mail className="h-5 w-5 text-blue-600" />
                    Confirmar envio de email
                  </h2>
                  <button
                    onClick={() => setShowEmailConfirm(false)}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                    disabled={sendingEmail}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-3 text-sm text-slate-700">
                  <div className="rounded-lg bg-slate-50 border border-slate-200 divide-y divide-slate-200">
                    <div className="flex gap-3 px-4 py-3">
                      <span className="w-20 shrink-0 font-medium text-slate-500">De:</span>
                      <span className="break-all">{senderEmail}</span>
                    </div>
                    <div className="flex gap-3 px-4 py-3">
                      <span className="w-20 shrink-0 font-medium text-slate-500">Para:</span>
                      <span className="break-all">{contactEmail}</span>
                    </div>
                    <div className="flex gap-3 px-4 py-3">
                      <span className="w-20 shrink-0 font-medium text-slate-500">Empresa:</span>
                      <span>{company || "-"}</span>
                    </div>
                    <div className="flex gap-3 px-4 py-3">
                      <span className="w-20 shrink-0 font-medium text-slate-500">Contato:</span>
                      <span>{contactName || "-"}</span>
                    </div>
                    <div className="flex gap-3 px-4 py-3">
                      <span className="w-20 shrink-0 font-medium text-slate-500">Produto:</span>
                      <span>
                        {((selectedTemplate?.product_code || "") +
                          " / " +
                          (selectedTemplate?.industry_code || "") +
                          " v" +
                          (selectedTemplate?.version || "")).trim() || "-"}
                      </span>
                    </div>
                    <div className="flex gap-3 px-4 py-3">
                      <span className="w-20 shrink-0 font-medium text-slate-500">Link:</span>
                      <span className="break-all text-xs text-slate-500">{formUrl}</span>
                    </div>
                  </div>

                  {!contactEmail && (
                    <p className="text-red-600 text-xs">
                      Preencha o email do contato para enviar.
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 p-5 border-t border-slate-100">
                  <Button
                    variant="outline"
                    onClick={() => setShowEmailConfirm(false)}
                    disabled={sendingEmail}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={sendEmail}
                    disabled={sendingEmail || !contactEmail}
                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                  >
                    <Mail className="h-4 w-4" />
                    {sendingEmail ? "Enviando…" : "Enviar Email"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Error card */}
          {error && (
            <Card className="bg-red-50/50 backdrop-blur-sm border-red-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-red-700">
                  <div className="h-2 w-2 bg-red-500 rounded-full" />
                  <span className="font-medium">Erro:</span>
                  <span>{error}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   FORMS MODULE
   ================================================================ */
function FormsModule({
  adminSecret,
  onBack,
  onLogout,
}: {
  adminSecret: string;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [rows, setRows]     = useState<any[]>([]);
  const [status, setStatus] = useState<string>("");
  const [q, setQ]           = useState<string>("");

  async function load(page = 1) {
    const res = await fetch("/api/formsadmin/list", {
      method  : "POST",
      headers : { "Content-Type": "application/json" },
      body    : JSON.stringify({ adminSecret, status, q, page, pageSize: 20 }),
    });
    if (!res.ok) { alert("Não autorizado ou erro ao carregar os formulários"); return; }
    const json = await res.json();
    setRows(json.data || []);
  }

  useEffect(() => { load(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  async function downloadPdf(formId: string) {
    const res = await fetch(`/api/formsadmin/pdf/${formId}`, {
      method  : "POST",
      headers : { "Content-Type": "application/json" },
      body    : JSON.stringify({ adminSecret }),
    });
    if (!res.ok) { alert("Erro ao gerar PDF"); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `form_${formId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadZip(formId: string) {
    const res = await fetch(`/api/formsadmin/zip/${formId}`, {
      method  : "POST",
      headers : { "Content-Type": "application/json" },
      body    : JSON.stringify({ adminSecret }),
    });
    if (!res.ok) { alert("Erro ao gerar ZIP"); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `form_${formId}_attachments.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="w-full bg-white shadow-sm border-b border-slate-200">
        <div className="container mx-auto px-4 py-6 max-w-4xl">
          <div className="flex justify-between items-center">
            <Image src="/covercap-logo.png" alt="CoverCap" width={160} height={64} className="h-12 w-auto" />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onBack}>← Voltar</Button>
              <Button variant="outline" onClick={onLogout}>Sair</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl space-y-4">
        <div className="flex gap-2">
          <Input placeholder="Buscar empresa..." value={q} onChange={(e) => setQ(e.target.value)} />
          <Button onClick={() => load(1)}>Buscar</Button>
        </div>

        <table className="w-full text-sm border">
          <thead className="bg-muted">
            <tr>
              <th className="p-2 text-left">Empresa</th>
              <th className="p-2">Tipo</th>
              <th className="p-2">Status</th>
              <th className="p-2">Respondidas</th>
              <th className="p-2">Anexos</th>
              <th className="p-2">Criado</th>
              <th className="p-2">Vence</th>
              <th className="p-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.form_id} className="border-t">
                <td className="p-2">{r.respondent_company ?? "-"}</td>
                <td className="p-2 text-xs text-slate-500">
                  {r.deal_type === "new_business" ? "Novo" : "Renovação"}
                </td>
                <td className="p-2">{r.computed_status}</td>
                <td className="p-2">{r.answered_questions}/{r.required_questions}</td>
                <td className="p-2">{r.attachments_count}</td>
                <td className="p-2">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="p-2">{r.due_at ? new Date(r.due_at).toLocaleDateString() : "-"}</td>
                <td className="p-2 space-x-2">
                  <button className="underline" onClick={() => downloadPdf(r.form_id)}>PDF</button>
                  <button className="underline" onClick={() => downloadZip(r.form_id)}>ZIP</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

