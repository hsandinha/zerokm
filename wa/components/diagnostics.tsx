"use client";

// Diagnóstico das dependências. Existe porque o erro que derrubou o cadastro
// em agosto (credencial do Firebase) só aparecia no log da Vercel — daqui, a
// resposta é um clique, e diz qual peça está quebrada e o que ela derruba.

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Stethoscope } from "lucide-react";
import { timeAgo } from "@wa/lib/stages";

type Check = {
  id: string;
  label: string;
  impacto: string;
  ok: boolean;
  detail: string;
};

export function Diagnostics() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const rodar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/wa/diagnostico");
      const body = await res.json();
      if (!res.ok) {
        setErro(body.error ?? "Falha ao rodar o diagnóstico");
        return;
      }
      setChecks(body.checks ?? []);
      setCheckedAt(body.checkedAt ?? null);
    } catch {
      setErro("Falha ao rodar o diagnóstico");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    rodar();
  }, [rodar]);

  const quebrados = (checks ?? []).filter((c) => !c.ok);

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold">
            <Stethoscope size={16} className="text-brand-700" /> Diagnóstico
          </p>
          <p className="text-xs text-muted">
            Leitura pura: não cria conta, não envia mensagem e não gasta consulta paga.
            {checkedAt ? ` Rodado ${timeAgo(checkedAt)}.` : ""}
          </p>
        </div>
        <button className="btn-ghost px-3 py-1.5 text-xs" onClick={rodar} disabled={carregando}>
          {carregando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Verificar agora
        </button>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {quebrados.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {quebrados.length === 1
            ? `${quebrados[0].label} está fora — isso derruba: ${quebrados[0].impacto}.`
            : `${quebrados.length} dependências fora do ar.`}
        </p>
      )}

      {checks === null ? (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 size={13} className="animate-spin" /> Verificando…
        </p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {checks.map((c) => (
            <li key={c.id} className="flex items-start gap-3 py-2">
              {c.ok ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{c.label}</span>
                <span
                  className={clsx("block break-words text-xs", c.ok ? "text-muted" : "text-red-600")}
                >
                  {c.detail}
                </span>
                {!c.ok && (
                  <span className="mt-0.5 block text-[11px] text-muted">
                    sem isto, para de funcionar: {c.impacto}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
