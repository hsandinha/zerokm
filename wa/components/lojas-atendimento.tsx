"use client";

// Lojas do atendimento (CNV): quem tem o Chatrun, situação da assinatura,
// canais, IA e movimento. Daqui o CNV ativa à mão (pagamento fora do sistema
// ou cortesia) ou desativa.

import { useCallback, useEffect, useState } from "react";
import { Store } from "lucide-react";

type Loja = {
  id: string;
  name: string;
  kind: "concessionaria" | "lojista";
  access: { active: boolean; trial: boolean; trialEndsAt: string | null; expiresAt: string | null; planName: string | null };
  aiActive: boolean;
  canais: string[];
  conversas30d: number;
};
type Plano = { id: string; name: string; publico?: string; active: boolean };

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

export function LojasAtendimento() {
  const [lojas, setLojas] = useState<Loja[] | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/wa/lojas")
      .then((r) => r.json())
      .then((d) => setLojas(d.lojas ?? []))
      .catch(() => setLojas([]));
  }, []);
  useEffect(() => {
    load();
    fetch("/api/admin/plans")
      .then((r) => r.json())
      .then((d) => setPlanos((Array.isArray(d) ? d : []).filter((p: Plano) => p.active && p.publico === "atendimento")))
      .catch(() => {});
  }, [load]);

  async function acao(id: string, body: Record<string, unknown>) {
    setNotice(null);
    const res = await fetch(`/api/wa/lojas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const r = await res.json().catch(() => ({}));
    setNotice(res.ok ? "✅ Atualizado." : `❌ ${r.error ?? "Falha"}`);
    load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Store size={20} className="text-brand-700" /> Lojas do atendimento
        </h1>
        <p className="text-sm text-muted">
          Concessionárias e lojistas com o atendimento (Chatrun). A loja nasce no primeiro acesso, com 7 dias de
          teste. Planos de atendimento são criados em Configurações → Planos (público &quot;Atendimento&quot;).
        </p>
      </div>
      {notice && <p className="text-sm">{notice}</p>}
      {lojas === null ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : lojas.length === 0 ? (
        <p className="card text-sm text-muted">Nenhuma loja entrou no atendimento ainda.</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr>
                <th className="p-3">Loja</th>
                <th className="p-3">Assinatura</th>
                <th className="p-3">Canais / IA</th>
                <th className="p-3">Conversas 30d</th>
                <th className="p-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {lojas.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="p-3">
                    <span className="font-semibold">{l.name}</span>
                    <span className="block text-xs text-muted">{l.kind === "concessionaria" ? "Concessionária" : "Lojista"}</span>
                  </td>
                  <td className="p-3 text-xs">
                    {!l.access.active
                      ? "Inativa"
                      : l.access.trial
                        ? `Teste até ${data(l.access.trialEndsAt)}`
                        : `${l.access.planName ?? "Ativa"} até ${data(l.access.expiresAt)}`}
                  </td>
                  <td className="p-3 text-xs">
                    {l.canais.length ? l.canais.join(", ") : "sem canal"} · IA {l.aiActive ? "ligada" : "desligada"}
                  </td>
                  <td className="p-3 tabular-nums">{l.conversas30d}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {planos.length > 0 && (
                        <select
                          className="input w-auto py-1 text-xs"
                          defaultValue=""
                          onChange={(e) => {
                            const [planId, metodo] = e.target.value.split("|");
                            if (planId) void acao(l.id, { acao: "ativar", planId, metodo, billingType: "monthly" });
                            e.target.value = "";
                          }}
                        >
                          <option value="">Ativar 30 dias…</option>
                          {planos.map((p) => (
                            <optgroup key={p.id} label={p.name}>
                              <option value={`${p.id}|manual`}>{p.name} — pago fora</option>
                              <option value={`${p.id}|cortesia`}>{p.name} — cortesia</option>
                            </optgroup>
                          ))}
                        </select>
                      )}
                      {l.access.active && !l.access.trial && (
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => acao(l.id, { acao: "desativar" })}>
                          Desativar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
