import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Shell } from "@wa/components/shell";
import { requireWaPage } from "@wa/lib/guard";
import "@wa/styles/whatsapp.css";

// A fonte vem pelo `next/font`: servida junto com o app, sem requisição ao
// Google no carregamento e sem o texto piscar de fonte. A classe `.variable`
// define `--font-wa` na própria `.wa-scope`, então a fonte não escapa do
// módulo — o resto da zerokm continua na dela.
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-wa",
});

export const metadata: Metadata = {
  title: "CNV WhatsApp — Central de Vendas",
  description:
    "IA de vendas da CNV no WhatsApp: dúvidas, cadastro, assinatura e campanhas.",
};

// O tema do módulo é o escuro (padrão da CNV); quem escolher o claro tem a
// escolha guardada no navegador. O script roda logo depois da div ser
// analisada e antes de ela pintar, então não há o flash clássico de tema
// salvo no cliente. Mexe só na `.wa-scope` — o tema da zerokm, que é outro
// mecanismo (`data-theme` no <html>), continua intocado.
const TEMA_SEM_FLASH = `
try {
  if (localStorage.getItem("cnv-tema") === "light") {
    document.getElementById("wa-raiz").classList.remove("wa-dark");
  }
} catch (e) {}
`;

export default async function WhatsAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // O porteiro fica aqui, não em cada página: o `layout` embrulha todas as
  // rotas do módulo, inclusive as que ainda não existem.
  await requireWaPage();

  return (
    <div
      id="wa-raiz"
      className={`${plusJakarta.variable} wa-scope wa-dark panel-ambient min-h-screen`}
    >
      <script dangerouslySetInnerHTML={{ __html: TEMA_SEM_FLASH }} />
      <Shell>{children}</Shell>
    </div>
  );
}
