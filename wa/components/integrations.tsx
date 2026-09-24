"use client";

// API e integrações: as chaves que deixam outro sistema falar com a CNV, e os
// webhooks que avisam esse sistema quando algo acontece aqui.
//
// A chave inteira aparece UMA vez, na criação — depois só o prefixo. O segredo
// do webhook, idem: é com ele que o outro lado confere a assinatura de cada
// entrega.

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Power,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";
import { EVENT_TYPES, type EventType } from "@wa/lib/events";
import { dateTime, formatNumber, timeAgo } from "@wa/lib/stages";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  createdBy: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  calls: number;
  revokedAt: string | null;
};

type Delivery = {
  id: string;
  event: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

type Endpoint = {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdBy: string | null;
  createdAt: string;
  lastDeliveryAt: string | null;
  lastStatus: number | null;
  failures: number;
  recent: Delivery[];
};

export function Integrations() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [nomeChave, setNomeChave] = useState("");
  const [chaveNova, setChaveNova] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [eventos, setEventos] = useState<EventType[]>([
    "conversa.criada",
    "cadastro.criado",
    "pagamento.gerado",
  ]);
  const [segredoNovo, setSegredoNovo] = useState<string | null>(null);
  const [testando, setTestando] = useState<string | null>(null);
  const [resultadoTeste, setResultadoTeste] = useState<string | null>(null);

  const load = useCallback(async () => {
    setCarregando(true);
    try {
      const [k, w] = await Promise.all([
        fetch("/api/wa/integrations/keys").then((r) => r.json()),
        fetch("/api/wa/integrations/webhooks").then((r) => r.json()),
      ]);
      setKeys(k.keys ?? []);
      setEndpoints(w.endpoints ?? []);
      setErro(k.error ?? w.error ?? null);
    } catch {
      setErro("Falha ao carregar as integrações.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function copiar(valor: string, id: string) {
    navigator.clipboard?.writeText(valor).then(() => {
      setCopiado(id);
      setTimeout(() => setCopiado(null), 1500);
    });
  }

  async function criarChave() {
    setErro(null);
    const res = await fetch("/api/wa/integrations/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nomeChave }),
    });
    const body = await res.json();
    if (!res.ok) {
      setErro(body.error ?? "Falha ao gerar a chave");
      return;
    }
    setChaveNova(body.key);
    setNomeChave("");
    await load();
  }

  async function revogar(k: ApiKey) {
    if (!confirm(`Revogar a chave "${k.name}"? Ela para de funcionar na hora.`)) return;
    await fetch(`/api/wa/integrations/keys/${k.id}`, { method: "DELETE" });
    await load();
  }

  async function criarEndpoint() {
    setErro(null);
    const res = await fetch("/api/wa/integrations/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, events: eventos }),
    });
    const body = await res.json();
    if (!res.ok) {
      setErro(body.error ?? "Falha ao cadastrar o webhook");
      return;
    }
    setSegredoNovo(body.secret);
    setUrl("");
    await load();
  }

  async function alternar(e: Endpoint) {
    await fetch(`/api/wa/integrations/webhooks/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !e.enabled }),
    });
    await load();
  }

  async function apagar(e: Endpoint) {
    if (!confirm(`Remover o webhook ${e.url}?`)) return;
    await fetch(`/api/wa/integrations/webhooks/${e.id}`, { method: "DELETE" });
    await load();
  }

  async function testar(e: Endpoint) {
    setTestando(e.id);
    setResultadoTeste(null);
    try {
      const res = await fetch(`/api/wa/integrations/webhooks/${e.id}/test`, { method: "POST" });
      const body = await res.json();
      setResultadoTeste(
        body.ok
          ? `Entregue (HTTP ${body.status}).`
          : `Falhou: ${body.error ?? `HTTP ${body.status ?? "?"}`}`,
      );
      await load();
    } finally {
      setTestando(null);
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">API e integrações</h2>
        <p className="text-sm text-muted">
          Para o site, o ERP ou uma automação falarem com o WhatsApp da CNV — e serem avisados do
          que acontece aqui.
        </p>
      </div>

      {erro && (
        <p className="flex items-start gap-2 rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {erro}
        </p>
      )}

      {/* ── Chaves ─────────────────────────────────────────── */}
      <div className="card space-y-3">
        <p className="flex items-center gap-2 text-sm font-bold">
          <KeyRound size={16} className="text-brand-700" /> Chaves de API
        </p>
        <p className="text-xs text-muted">
          Autenticam a API pública em <code>/api/v1</code> com o header{" "}
          <code>Authorization: Bearer cnv_live_…</code>. Guardamos só o hash — a chave inteira
          aparece uma vez.
        </p>

        {chaveNova && (
          <div className="rounded-2xl border border-brand-300 bg-brand-50 p-3">
            <p className="text-xs font-semibold text-brand-700">
              Copie agora — esta chave não aparece de novo:
            </p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-paper px-2 py-1 text-xs">
                {chaveNova}
              </code>
              <button
                className="btn-ghost px-2.5 py-1 text-xs"
                onClick={() => copiar(chaveNova, "chave")}
              >
                {copiado === "chave" ? <Check size={13} /> : <Copy size={13} />}
              </button>
              <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setChaveNova(null)}>
                ok
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Nome da chave (ex.: site, ERP, n8n)"
            value={nomeChave}
            onChange={(e) => setNomeChave(e.target.value)}
          />
          <button className="btn-dark shrink-0 px-3 py-2 text-xs" disabled={!nomeChave} onClick={criarChave}>
            <Plus size={14} /> Gerar
          </button>
        </div>

        {carregando ? (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Loader2 size={13} className="animate-spin" /> Carregando…
          </p>
        ) : keys.length === 0 ? (
          <p className="text-xs text-muted">Nenhuma chave criada.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold">{k.name}</span>
                    {k.revokedAt && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                        revogada
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    <code>{k.prefix}</code> · {formatNumber(k.calls)} chamada(s)
                    {k.lastUsedAt ? ` · usada ${timeAgo(k.lastUsedAt)}` : " · nunca usada"}
                  </span>
                </span>
                {!k.revokedAt && (
                  <button
                    className="shrink-0 rounded-full p-2 text-muted hover:bg-red-50 hover:text-red-600"
                    onClick={() => revogar(k)}
                    title="Revogar"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Webhooks ───────────────────────────────────────── */}
      <div className="card space-y-3">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Webhook size={16} className="text-brand-700" /> Webhooks
        </p>
        <p className="text-xs text-muted">
          Cada entrega vai assinada em <code>X-CNV-Signature: sha256=HMAC(segredo, corpo)</code>. O
          que falhar é tentado de novo em 1 min, 5 min, 30 min e 2 h.
        </p>

        {segredoNovo && (
          <div className="rounded-2xl border border-brand-300 bg-brand-50 p-3">
            <p className="text-xs font-semibold text-brand-700">
              Segredo do endpoint — copie agora, não aparece de novo:
            </p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-paper px-2 py-1 text-xs">
                {segredoNovo}
              </code>
              <button
                className="btn-ghost px-2.5 py-1 text-xs"
                onClick={() => copiar(segredoNovo, "segredo")}
              >
                {copiado === "segredo" ? <Check size={13} /> : <Copy size={13} />}
              </button>
              <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setSegredoNovo(null)}>
                ok
              </button>
            </div>
          </div>
        )}

        <input
          className="input"
          placeholder="https://seu-sistema.com/webhooks/cnv"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          {EVENT_TYPES.map((e) => (
            <button
              key={e.id}
              title={e.hint}
              onClick={() =>
                setEventos((atual) =>
                  atual.includes(e.id) ? atual.filter((x) => x !== e.id) : [...atual, e.id],
                )
              }
              className={clsx(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                eventos.includes(e.id) ? "pill-active" : "border border-line text-muted",
              )}
            >
              {e.label}
            </button>
          ))}
        </div>
        <button
          className="btn-dark px-3 py-2 text-xs"
          disabled={!url || eventos.length === 0}
          onClick={criarEndpoint}
        >
          <Plus size={14} /> Cadastrar endpoint
        </button>

        {resultadoTeste && <p className="text-xs text-muted">{resultadoTeste}</p>}

        {endpoints.length === 0 ? (
          <p className="text-xs text-muted">Nenhum webhook cadastrado.</p>
        ) : (
          <ul className="space-y-3">
            {endpoints.map((e) => (
              <li key={e.id} className="rounded-2xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{e.url}</span>
                    <span className="block truncate text-xs text-muted">
                      {e.events.length} evento(s)
                      {e.lastDeliveryAt
                        ? ` · última entrega ${timeAgo(e.lastDeliveryAt)} (HTTP ${e.lastStatus ?? "?"})`
                        : " · nunca entregou"}
                      {e.failures > 0 ? ` · ${e.failures} falha(s) seguidas` : ""}
                    </span>
                  </span>
                  <button
                    className="btn-ghost px-2.5 py-1 text-xs"
                    onClick={() => testar(e)}
                    disabled={testando === e.id || !e.enabled}
                  >
                    {testando === e.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Send size={13} />
                    )}
                    Testar
                  </button>
                  <button
                    className={clsx(
                      "btn-ghost px-2.5 py-1 text-xs",
                      e.enabled ? "text-emerald-600" : "text-muted",
                    )}
                    onClick={() => alternar(e)}
                  >
                    <Power size={13} /> {e.enabled ? "Ligado" : "Desligado"}
                  </button>
                  <button
                    className="rounded-full p-2 text-muted hover:bg-red-50 hover:text-red-600"
                    onClick={() => apagar(e)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {e.recent.length > 0 && (
                  <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-[11px]">
                    {e.recent.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2">
                        <span className="truncate text-muted">
                          {d.event} · {dateTime(d.createdAt)}
                        </span>
                        <span
                          className={clsx(
                            "shrink-0 font-semibold",
                            d.status === "delivered"
                              ? "text-emerald-600"
                              : d.status === "failed"
                                ? "text-red-600"
                                : "text-amber-700",
                          )}
                        >
                          {d.status === "delivered"
                            ? `HTTP ${d.responseStatus}`
                            : `${d.status} · ${d.attempts}ª tentativa`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
