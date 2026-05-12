// app/success/page.tsx

import Image from "next/image";
import FooterForters from "@/components/FooterForters";

export const metadata = {
  title: "Success — Forters",
  description: "Success page after sending the questionnaire."
};

// Normalize language (pt-BR, es, en)
function normalizeLang(raw?: string): "pt" | "es" | "en" {
  if (!raw) return "pt";
  const v = raw.toLowerCase();

  if (v.startsWith("en")) return "en";
  if (v.startsWith("es")) return "es";

  return "pt"; // default Portuguese
}

// Full translations
const TEXT = {
  pt: {
    title: "Obrigado por enviar o questionário!",
    desc: "Sua cotação está a caminho. Esse processo pode tardar até 15 dias. Entraremos em contato com você assim que tivermos as propostas de seguro.",
    stepsTitle: "Próximos Passos",
    s1Title: "Preenchimento de dados",
    s1Desc: "Preencha o formulário e envie os documentos.",
    s2Title: "Cotação",
    s2Sub: "(você está aqui)",
    s2Desc:
      "Buscaremos, junto às seguradoras parceiras, a melhor opção de cobertura para sua empresa.",
    s3Title: "Aprovação de cobertura e condições",
    s3Desc:
      "Você escolherá a proposta que melhor atende às suas necessidades de limite e coberturas.",
    s4Title: "Renovação da apólice",
    s4Desc:
      "Formalizaremos a contratação e sua cobertura será renovada, garantindo proteção contínua.",
    visit: "Visite-nos para mais informações"
  },

  es: {
    title: "¡Gracias por enviar el cuestionario!",
    desc: "Tu cotización está en proceso. Este proceso puede tardar hasta 15 días. Nos pondremos en contacto contigo cuando tengamos las propuestas de seguro.",
    stepsTitle: "Próximos pasos",
    s1Title: "Completar los datos",
    s1Desc: "Completa el formulario y envía los documentos.",
    s2Title: "Cotización",
    s2Sub: "(estás aquí)",
    s2Desc:
      "Buscaremos junto a las aseguradoras asociadas la mejor opción de cobertura para tu empresa.",
    s3Title: "Aprobación de coberturas y condiciones",
    s3Desc: "Elegirás la propuesta que mejor se adapte a tus necesidades.",
    s4Title: "Renovación de la póliza",
    s4Desc:
      "Formalizaremos la contratación y tu cobertura será renovada para mantener tu empresa protegida.",
    visit: "Visítanos para más información"
  },

  en: {
    title: "Thank you for submitting the form!",
    desc: "Your insurance quote is being processed. This may take up to 15 days. We will contact you as soon as we receive the proposals.",
    stepsTitle: "Next Steps",
    s1Title: "Data submission",
    s1Desc: "Fill out the form and upload the required documents.",
    s2Title: "Underwriting",
    s2Sub: "(you are here)",
    s2Desc:
      "We will work with our partner insurers to find the best coverage options for your business.",
    s3Title: "Coverage review & approval",
    s3Desc:
      "You will choose the proposal that best fits your limits and coverage needs.",
    s4Title: "Policy renewal",
    s4Desc:
      "We will finalize the contract and ensure your coverage is renewed and active.",
    visit: "Visit us for more information"
  }
};

export default function SuccessPage({
  searchParams
}: {
  searchParams: { lang?: string };
}) {
  const lang = normalizeLang(searchParams?.lang);
  const t = TEXT[lang];

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      {/* Header */}
      <header className="bg-white w-full">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-center">
          <Image
            src="/covercap-logo.png"
            alt="CoverCap"
            width={240}
            height={80}
            className="h-16"
          />
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-6 py-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold mb-4">{t.title}</h1>

        <p className="text-slate-300 max-w-3xl mx-auto text-lg leading-relaxed mb-8">
          {t.desc}
        </p>

        {/* Steps card */}
        <section className="bg-[#263644] rounded-xl p-8 text-left shadow-md">
          <h2 className="text-center text-xl font-semibold text-white mb-6">
            {t.stepsTitle}
          </h2>

          <ol className="space-y-6">
            {/* Step 1 */}
            <li className="flex items-start gap-6">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-700 text-slate-200 font-bold">
                  1
                </div>
              </div>
              <div>
                <div className="font-semibold text-white">{t.s1Title}</div>
                <div className="text-slate-300 mt-1">{t.s1Desc}</div>
              </div>
            </li>

            {/* Step 2 */}
            <li className="flex items-start gap-6">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-orange-500 font-bold">
                  2
                </div>
              </div>
              <div>
                <div className="font-semibold text-white">
                  {t.s2Title}{" "}
                  <span className="font-normal text-slate-300">{t.s2Sub}</span>
                </div>
                <div className="text-slate-300 mt-1">{t.s2Desc}</div>
              </div>
            </li>

            {/* Step 3 */}
            <li className="flex items-start gap-6">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-700 text-slate-200 font-bold">
                  3
                </div>
              </div>
              <div>
                <div className="font-semibold text-white">{t.s3Title}</div>
                <div className="text-slate-300 mt-1">{t.s3Desc}</div>
              </div>
            </li>

            {/* Step 4 */}
            <li className="flex items-start gap-6">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-700 text-slate-200 font-bold">
                  4
                </div>
              </div>
              <div>
                <div className="font-semibold text-white">{t.s4Title}</div>
                <div className="text-slate-300 mt-1">{t.s4Desc}</div>
              </div>
            </li>
          </ol>
        </section>

        <footer className="mt-8 text-center">
          <a
            href="https://www.forters.com.br"
            target="_blank"
            rel="noreferrer"
            className="text-slate-300 underline"
          >
            {t.visit}
          </a>
        </footer>
      </main>

      <FooterForters lang={lang} />
    </div>
  );
}
