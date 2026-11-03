"use client";

// Assinatura do atendimento, vista pela loja: situação, planos e o PIX.
// A IA e os disparos não entram aqui — a loja paga direto aos provedores.

import { useEffect, useState } from "react";
import { CreditCard, Copy } from "lucide-react";

type Plano = { id: string; name: string; description: string; price: number; annualPrice: number | null; features: string[] };
type Access = { active: boolean; trial: boolean; trialEndsAt: string | null; expiresAt: string | null; planName: string | null };

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

export function AssinaturaAtendimento() {
  const [planos, setPlanos] = useState<Plano[] | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [pix, setPix] = useState<{ qrCode: string | null; qrCodeBase64: string | null; amount: number } | null>(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wa/loja/assinatura")
      .then((r) => r.json())
      .then((d) => {
        setPlanos(d.planos ?? []);
        setAccess(d.access ?? null);
      })
      .catch(() => setPlanos([]));
  }, []);

  async function pagar(planId: string, billingType: "monthly" | "annual") {
    setWorking(true);
    setNotice(null);
    try {
      const res = await fetch("/api/wa/loja/assinatura/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, billingType }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Falha ao gerar o PIX");
      setPix(body);
    } catch (err) {
      setNotice(`❌ ${err instanceof Error ? err.message : "Erro"}`);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-2">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <CreditCard size={20} className="text-brand-700" /> Assinatura do atendimento
        </h1>
        {access && (
          <p className="text-sm">
            {access.active
              ? access.trial
                ? `Período de teste até ${data(access.trialEndsAt)}.`
                : `Assinatura ${access.planName ?? ""} ativa até ${data(access.expiresAt)}.`
              : "Sem assinatura ativa: a IA está parada e as conversas vão direto para a equipe."}
          </p>
        )}
        <p className="text-xs text-muted">
          A assinatura cobre a plataforma (central, IA, canais, funil). O consumo da IA e o envio de mensagens são
          pagos pela loja direto ao provedor de cada um.
        </p>
      </section>

      {pix && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">PIX de {BRL.format(pix.amount)}</h2>
          {pix.qrCodeBase64 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR code do PIX" className="h-48 w-48" />
          )}
          {pix.qrCode && (
            <div className="flex gap-2">
              <input className="input flex-1 font-mono text-xs" readOnly value={pix.qrCode} />
              <button className="btn-dark px-3 text-sm" onClick={() => navigator.clipboard.writeText(pix.qrCode!)}>
                <Copy size={14} /> Copiar
              </button>
            </div>
          )}
          <p className="text-xs text-muted">Assim que o pagamento cair, a assinatura é ativada sozinha.</p>
        </section>
      )}
      {notice && <p className="text-sm">{notice}</p>}

      {planos === null ? (
        <p className="text-sm text-muted">Carregando planos…</p>
      ) : planos.length === 0 ? (
        <p className="card text-sm text-muted">Nenhum plano à venda no momento. Fale com o CNV.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {planos.map((p) => (
            <section key={p.id} className="card flex flex-col gap-3">
              <div>
                <h2 className="text-lg font-bold">{p.name}</h2>
                {p.description && <p className="text-sm text-muted">{p.description}</p>}
              </div>
              <p className="text-2xl font-bold">
                {BRL.format(p.price)}
                <span className="text-sm font-normal text-muted">/mês</span>
              </p>
              {p.features.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {p.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
              <div className="mt-auto flex flex-wrap gap-2">
                <button className="btn-primary px-3 py-1.5 text-sm" disabled={working} onClick={() => pagar(p.id, "monthly")}>
                  Pagar mensal no PIX
                </button>
                {p.annualPrice ? (
                  <button className="btn-ghost px-3 py-1.5 text-sm" disabled={working} onClick={() => pagar(p.id, "annual")}>
                    Anual {BRL.format(p.annualPrice)}
                  </button>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
