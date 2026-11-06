"use client";

// Configuração do atendimento da LOJA: canais (WhatsApp e Instagram), a IA de
// vendas (provedor, chave da própria loja, prompt), o financiamento que a IA
// simula, o endereço, a equipe e o simulador para testar antes de ligar.

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Bot, Calculator, MessageCircle, Save, SendHorizonal, Sparkles, Users } from "lucide-react";
import { InstagramChannels } from "@wa/components/config-screen";
import { ConectarWhatsApp } from "@wa/components/conectar-whatsapp";
import { CanaisExtras } from "@wa/components/canais-extras";
import { usePodeUsar } from "@wa/components/wa-panel";
import { OperacaoDaLoja } from "@wa/components/operacao-config";
import { EventosParaMeta } from "@wa/components/conversoes-meta";

type Member = { email: string; name: string | null; role: "gestor" | "atendente" };
type Loja = {
  kind: "concessionaria" | "lojista";
  name: string;
  ai: {
    active: boolean;
    assistantName: string;
    provider: "gemini" | "openai" | "claude";
    model: string;
    hasToken: boolean;
    systemPrompt: string;
    knowledgeBase: string;
    greeting: string;
    extraInstructions: string;
    maxTurns: number;
    vendeEstoqueCnv: boolean;
  };
  financiamento: {
    ativo: boolean;
    taxaMensal: number;
    entradaMinimaPct: number;
    prazos: number[];
    observacao: string;
  };
  mapsUrl: string;
  members: Member[];
  defaults: {
    systemPrompt: string;
    promptVars: Record<string, string>;
    models: Record<string, string>;
  };
};

const PROVIDER_LABEL = { gemini: "Google Gemini", openai: "OpenAI (GPT)", claude: "Anthropic (Claude)" };

export function StoreConfig() {
  const podeUsar = usePodeUsar();
  const [loja, setLoja] = useState<Loja | null>(null);
  const [token, setToken] = useState("");
  const [prazosTxt, setPrazosTxt] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/wa/loja")
      .then((r) => r.json())
      .then((d: Loja) => {
        setLoja(d);
        setPrazosTxt((d.financiamento?.prazos ?? []).join(", "));
      })
      .catch(() => setNotice("Falha ao carregar a configuração"));
  }, []);
  useEffect(load, [load]);

  if (!loja) return <p className="p-8 text-sm text-muted">Carregando…</p>;

  const setAi = <K extends keyof Loja["ai"]>(k: K, v: Loja["ai"][K]) =>
    setLoja((l) => (l ? { ...l, ai: { ...l.ai, [k]: v } } : l));
  const setFin = <K extends keyof Loja["financiamento"]>(k: K, v: Loja["financiamento"][K]) =>
    setLoja((l) => (l ? { ...l, financiamento: { ...l.financiamento, [k]: v } } : l));

  async function save() {
    if (!loja) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/wa/loja", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai: { ...loja.ai, token },
          financiamento: {
            ...loja.financiamento,
            prazos: prazosTxt.split(/[^\d]+/).map(Number).filter(Boolean),
          },
          mapsUrl: loja.mapsUrl,
          members: loja.members,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Falha ao salvar");
      setToken("");
      setNotice("✅ Salvo.");
      load();
    } catch (err) {
      setNotice(`❌ ${err instanceof Error ? err.message : "Erro ao salvar"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(360px,420px)]">
      <div className="space-y-6">
        <ConectarWhatsApp />
        {podeUsar("instagram") && <InstagramChannels />}
        <CanaisExtras />

        {/* IA */}
        {podeUsar("ia") && <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Bot size={18} className="text-brand-700" /> IA de vendas
            </h2>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={loja.ai.active} onChange={(e) => setAi("active", e.target.checked)} />
              IA ativa
            </label>
          </div>
          <p className="text-xs text-muted">
            A IA usa a chave da sua conta no provedor escolhido — o consumo é cobrado direto pelo provedor. Sem
            chave, as conversas vão direto para a equipe.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Provedor</span>
              <select
                className="input"
                value={loja.ai.provider}
                onChange={(e) => setAi("provider", e.target.value as Loja["ai"]["provider"])}
              >
                {Object.entries(PROVIDER_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Modelo (opcional)</span>
              <input
                className="input"
                placeholder={loja.defaults.models[loja.ai.provider]}
                value={loja.ai.model}
                onChange={(e) => setAi("model", e.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-muted">
                Chave da API {loja.ai.hasToken && <em className="text-brand-700">(configurada)</em>}
              </span>
              <input
                className="input"
                type="password"
                placeholder={loja.ai.hasToken ? "•••••• (deixe em branco para manter)" : "cole a chave do provedor"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Nome da assistente</span>
              <input
                className="input"
                value={loja.ai.assistantName}
                onChange={(e) => setAi("assistantName", e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Limite de mensagens da IA por conversa</span>
              <input
                className="input"
                type="number"
                min={1}
                value={loja.ai.maxTurns}
                onChange={(e) => setAi("maxTurns", Number(e.target.value))}
              />
            </label>
          </div>
          {loja.kind === "lojista" && podeUsar("vende_rede") && (
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={loja.ai.vendeEstoqueCnv}
                onChange={(e) => setAi("vendeEstoqueCnv", e.target.checked)}
              />
              <span>
                Vender também o estoque da rede CNV (0km e repasse das concessionárias), com a sua margem já
                aplicada. O cliente nunca vê de qual concessionária é o carro.
              </span>
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Saudação inicial (opcional)</span>
            <input className="input" value={loja.ai.greeting} onChange={(e) => setAi("greeting", e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">
              Sobre a loja — endereço, horário, diferenciais, formas de pagamento (a IA só afirma o que está aqui)
            </span>
            <textarea
              className="input min-h-[140px]"
              value={loja.ai.knowledgeBase}
              onChange={(e) => setAi("knowledgeBase", e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Instruções extras (opcional)</span>
            <textarea
              className="input min-h-[80px]"
              value={loja.ai.extraInstructions}
              onChange={(e) => setAi("extraInstructions", e.target.value)}
            />
          </label>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Prompt completo (avançado)</summary>
            <p className="mt-2 text-xs text-muted">
              Em branco = prompt de fábrica. Marcadores:{" "}
              {Object.keys(loja.defaults.promptVars).map((k) => `{{${k}}}`).join(" ")}
            </p>
            <textarea
              className="input mt-2 min-h-[220px] font-mono text-xs"
              placeholder={loja.defaults.systemPrompt}
              value={loja.ai.systemPrompt}
              onChange={(e) => setAi("systemPrompt", e.target.value)}
            />
          </details>
        </section>}

        {/* Financiamento */}
        {podeUsar("simulador") && <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Calculator size={18} className="text-brand-700" /> Simulação de financiamento
            </h2>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={loja.financiamento.ativo}
                onChange={(e) => setFin("ativo", e.target.checked)}
              />
              IA simula parcela
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Taxa ao mês (%)</span>
              <input
                className="input"
                type="number"
                step="0.01"
                value={loja.financiamento.taxaMensal}
                onChange={(e) => setFin("taxaMensal", Number(e.target.value))}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Entrada mínima (%)</span>
              <input
                className="input"
                type="number"
                value={loja.financiamento.entradaMinimaPct}
                onChange={(e) => setFin("entradaMinimaPct", Number(e.target.value))}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Prazos (meses)</span>
              <input className="input" value={prazosTxt} onChange={(e) => setPrazosTxt(e.target.value)} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Observação que vai junto (ex.: sujeito à aprovação de crédito)</span>
            <input
              className="input"
              value={loja.financiamento.observacao}
              onChange={(e) => setFin("observacao", e.target.value)}
            />
          </label>
        </section>}

        {/* Endereço que a IA envia */}
        {podeUsar("ia") && <section className="card">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Link do endereço no Google Maps (a IA envia quando pedirem)</span>
            <input
              className="input"
              placeholder="https://maps.app.goo.gl/…"
              value={loja.mapsUrl}
              onChange={(e) => setLoja({ ...loja, mapsUrl: e.target.value })}
            />
          </label>
        </section>}

        {/* Equipe */}
        <Equipe members={loja.members} onChange={(members) => setLoja({ ...loja, members })} />

        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={save} disabled={saving}>
            <Save size={16} /> {saving ? "Salvando…" : "Salvar configurações"}
          </button>
          {notice && <p className="text-sm text-ink-800">{notice}</p>}
        </div>

        {/* Horário de atendimento, distribuição e SLA: salvam à parte
            (wa/components/operacao-config.tsx). */}
        <OperacaoDaLoja />

        {/* API de Conversões da Meta: salva à parte, em modal
            (wa/components/conversoes-meta.tsx). */}
        <EventosParaMeta />
      </div>

      {podeUsar("ia") && <SimuladorDaLoja />}
    </div>
  );
}

function Equipe({ members, onChange }: { members: Member[]; onChange: (m: Member[]) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>("atendente");
  return (
    <section className="card space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Users size={18} className="text-brand-700" /> Equipe
      </h2>
      <p className="text-xs text-muted">
        Quem atende pela central. A pessoa entra com o login da zerokm (o e-mail precisa ter conta). O titular da
        loja já é gestor.
      </p>
      <ul className="space-y-1">
        {members.map((m) => (
          <li key={m.email} className="flex items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-2 text-sm">
            <span className="truncate">
              {m.email} <span className="text-xs text-muted">· {m.role}</span>
            </span>
            <button
              className="btn-ghost px-2 py-1 text-xs"
              onClick={() => onChange(members.filter((x) => x.email !== m.email))}
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input
          className="input flex-1"
          placeholder="email@da-pessoa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value as Member["role"])}>
          <option value="atendente">Atendente</option>
          <option value="gestor">Gestor</option>
        </select>
        <button
          className="btn-dark px-3 text-sm"
          onClick={() => {
            const e = email.trim().toLowerCase();
            if (!e || members.some((m) => m.email === e)) return;
            onChange([...members, { email: e, name: null, role }]);
            setEmail("");
          }}
        >
          Adicionar
        </button>
      </div>
      <p className="text-[11px] text-muted">Lembre de salvar as configurações depois de mudar a equipe.</p>
    </section>
  );
}

type SimMsg = { role: "user" | "assistant" | "event"; content: string };

function SimuladorDaLoja() {
  const [messages, setMessages] = useState<SimMsg[]>([]);
  const [input, setInput] = useState("");
  const [canal, setCanal] = useState<"whatsapp" | "instagram">("whatsapp");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next: SimMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await fetch("/api/wa/loja/simulador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canal,
          messages: next.filter((m) => m.role !== "event").map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Erro no simulador");
      setMessages((prev) => [
        ...prev,
        ...(body.events ?? []).map((e: string) => ({ role: "event" as const, content: e })),
        ...(body.replies ?? []).map((r: string) => ({ role: "assistant" as const, content: r })),
      ]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "event", content: `Erro: ${err instanceof Error ? err.message : err}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card flex h-[calc(100vh-10rem)] flex-col lg:sticky lg:top-24">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Sparkles size={18} className="text-brand-700" /> Simulador
        </h2>
        <div className="flex items-center gap-2">
          <select
            className="input w-auto py-1 text-xs"
            value={canal}
            onChange={(e) => setCanal(e.target.value as typeof canal)}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
          </select>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setMessages([])}>
            Limpar
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto rounded-xl bg-canvas/60 p-3">
        {messages.length === 0 && (
          <p className="p-4 text-center text-xs text-muted">
            Converse como um cliente. A consulta ao estoque e a simulação de parcela são reais; visita, troca e
            CRM são simulados — nada é gravado. Salve a chave da IA antes.
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "event" ? (
            <p key={i} className="text-center text-[11px] italic text-amber-600">
              ⚙️ {m.content}
            </p>
          ) : (
            <div
              key={i}
              className={clsx(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                m.role === "user" ? "ml-auto bg-brand-100" : "border border-line bg-paper",
              )}
            >
              {m.content}
            </div>
          ),
        )}
        {busy && <p className="text-xs text-muted">digitando…</p>}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="input flex-1"
          placeholder="Mensagem do cliente…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn-primary px-3" onClick={send} disabled={busy}>
          <SendHorizonal size={16} />
        </button>
      </div>
      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted">
        <MessageCircle size={11} /> Mesmo cérebro que responde os clientes.
      </p>
    </section>
  );
}
