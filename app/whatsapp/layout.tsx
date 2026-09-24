import { Plus_Jakarta_Sans } from "next/font/google";
import "@wa/styles/whatsapp.css";

// Área PÚBLICA do canal de WhatsApp. Hoje tem uma página só: a política de
// privacidade, que a Meta exige acessível sem login para aprovar o app, e que
// a LGPD exige que o titular consiga ler sem cadastro. Por isso ela mora aqui
// fora e não sob /dashboard — o proxy só protege /dashboard/:path*.
//
// Usa a mesma casca visual do módulo (`.wa-scope`), então herda o estilo sem
// duplicar nada.

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-wa",
});

export default function WhatsAppPublicoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${plusJakarta.variable} wa-scope wa-dark panel-ambient min-h-screen`}
    >
      {children}
    </div>
  );
}
