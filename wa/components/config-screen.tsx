"use client";

// Tela 1 — Configuração da IA + canais (WhatsApp e Instagram) + Simulador.

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Instagram, PhoneCall, RotateCcw, Save, SendHorizonal, Sparkles } from "lucide-react";
import clsx from "clsx";
import { useWaPanel } from "@wa/components/wa-panel";
import { CanaisExtras } from "@wa/components/canais-extras";

type SettingsPayload = {
  assistantName: string;
  aiActive: boolean;
  maxTurns: number;
  systemPrompt: string;
  knowledgeBase: string;
  greeting: string;
  extraInstructions: string;
  wabaPhoneNumberId: string;
  wabaId: string;
  wabaVerifyToken: string;
  wabaDisplayPhone: string;
  connection: {
    displayPhone?: string;
    verifiedName?: string;
    quality?: string;
    error?: string;
  } | null;
  hasToken: boolean;
  hasAppSecret: boolean;
  defaults: {
    systemPrompt: string;
    knowledgeBase: string;
    promptVars: Record<string, string>;
  };
};

export function ConfigScreen() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean | number>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wa/settings")
      .then((r) => r.json())
      .then((d: SettingsPayload) => {
        setData(d);
        setForm({
          assistantName: d.assistantName,
          aiActive: d.aiActive,
          maxTurns: d.maxTurns,
          systemPrompt: d.systemPrompt,
          knowledgeBase: d.knowledgeBase,
          greeting: d.greeting,
          extraInstructions: d.extraInstructions,
          wabaPhoneNumberId: d.wabaPhoneNumberId,
          wabaId: d.wabaId,
          wabaVerifyToken: d.wabaVerifyToken,
          wabaToken: "",
          wabaAppSecret: "",
        });
      })
      .catch(() => setNotice("Falha ao carregar as configurações"));
  }, []);

  const set = (key: string, value: string | boolean | number) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/wa/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Falha ao salvar");
      if (body.warning) setNotice(`⚠️ ${body.warning}`);
      else if (body.phoneInfo?.display_phone_number)
        setNotice(
          `✅ Salvo. Canal validado na Meta: ${body.phoneInfo.display_phone_number} (${body.phoneInfo.verified_name ?? "sem nome"})`,
        );
      else setNotice("✅ Salvo.");
    } catch (err) {
      setNotice(`❌ ${err instanceof Error ? err.message : "Erro ao salvar"}`);
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return <p className="p-8 text-sm text-muted">Carregando…</p>;
  }

  const webhookUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/meta` : "/api/webhooks/meta";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(360px,420px)]">
      <div className="space-y-6">
        {/* IA */}
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Bot size={18} className="text-brand-700" /> IA de vendas
            </h2>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(form.aiActive)}
                onChange={(e) => set("aiActive", e.target.checked)}
              />
              IA ativa
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Nome da assistente</span>
              <input
                className="input"
                value={String(form.assistantName ?? "")}
                onChange={(e) => set("assistantName", e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Limite de mensagens da IA por conversa</span>
              <input
                className="input"
                type="number"
                min={1}
                value={Number(form.maxTurns ?? 30)}
                onChange={(e) => set("maxTurns", Number(e.target.value))}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Saudação inicial (opcional)</span>
            <input
              className="input"
              placeholder="Oi! Eu sou a Vera, consultora do CNV 🚗 …"
              value={String(form.greeting ?? "")}
              onChange={(e) => set("greeting", e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 flex items-center justify-between text-muted">
              <span>Base de conhecimento do CNV</span>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-brand-700 hover:text-brand-800"
                onClick={() => set("knowledgeBase", data.defaults.knowledgeBase)}
              >
                <RotateCcw size={12} /> Restaurar padrão
              </button>
            </span>
            <textarea
              className="input min-h-40 font-mono text-xs"
              placeholder={data.defaults.knowledgeBase.slice(0, 120) + "…"}
              value={String(form.knowledgeBase ?? "")}
              onChange={(e) => set("knowledgeBase", e.target.value)}
            />
            <span className="mt-1 block text-xs text-muted">
              Em branco = texto institucional padrão do CNV.
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 flex items-center justify-between text-muted">
              <span>Prompt do sistema (avançado)</span>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-brand-700 hover:text-brand-800"
                onClick={() => set("systemPrompt", "")}
              >
                <RotateCcw size={12} /> Usar prompt de fábrica
              </button>
            </span>
            <textarea
              className="input min-h-48 font-mono text-xs"
              placeholder={data.defaults.systemPrompt.slice(0, 160) + "…"}
              value={String(form.systemPrompt ?? "")}
              onChange={(e) => set("systemPrompt", e.target.value)}
            />
            <span className="mt-1 block text-xs text-muted">
              Marcadores disponíveis:{" "}
              {Object.keys(data.defaults.promptVars)
                .map((v) => `{{${v}}}`)
                .join(" ")}
              . Em branco = prompt de fábrica.
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Instruções extras (opcional)</span>
            <textarea
              className="input min-h-20"
              placeholder="Ex.: hoje temos condição especial no plano anual…"
              value={String(form.extraInstructions ?? "")}
              onChange={(e) => set("extraInstructions", e.target.value)}
            />
          </label>
        </section>

        {/* WABA */}
        <section className="card space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <PhoneCall size={18} className="text-brand-700" /> WhatsApp Business (Meta)
            {data.connection?.displayPhone ? (
              <span className="rounded-full bg-brand-600/15 px-2 py-0.5 text-xs font-medium text-brand-800">
                ● conectado · {data.connection.displayPhone}
                {data.connection.verifiedName ? ` — ${data.connection.verifiedName}` : ""}
              </span>
            ) : data.connection?.error ? (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-300">
                ● erro na Meta: {data.connection.error}
              </span>
            ) : (
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-muted">
                ● sem credenciais
              </span>
            )}
          </h2>
          {data.connection?.quality && (
            <p className="-mt-2 text-xs text-muted">
              Qualidade do número na Meta: {data.connection.quality}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Phone Number ID</span>
              <input
                className="input"
                value={String(form.wabaPhoneNumberId ?? "")}
                onChange={(e) => set("wabaPhoneNumberId", e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">WABA ID</span>
              <input
                className="input"
                value={String(form.wabaId ?? "")}
                onChange={(e) => set("wabaId", e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">
                Token permanente {data.hasToken && <em className="text-brand-700">(configurado)</em>}
              </span>
              <input
                className="input"
                type="password"
                placeholder={data.hasToken ? "•••••• (deixe em branco para manter)" : "EAAG…"}
                value={String(form.wabaToken ?? "")}
                onChange={(e) => set("wabaToken", e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">
                App Secret {data.hasAppSecret && <em className="text-brand-700">(configurado)</em>}
              </span>
              <input
                className="input"
                type="password"
                placeholder={data.hasAppSecret ? "•••••• (deixe em branco para manter)" : "opcional, valida assinatura"}
                value={String(form.wabaAppSecret ?? "")}
                onChange={(e) => set("wabaAppSecret", e.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-muted">Verify token do webhook</span>
              <input
                className="input"
                placeholder="um segredo qualquer — o mesmo que você digitar na Meta"
                value={String(form.wabaVerifyToken ?? "")}
                onChange={(e) => set("wabaVerifyToken", e.target.value)}
              />
            </label>
          </div>
          <p className="rounded-xl bg-canvas p-3 text-xs text-muted">
            Configure o webhook na Meta apontando para{" "}
            <code className="text-brand-800">{webhookUrl}</code> com o verify token acima, assinando o
            campo <code>messages</code>. Campos preenchidos podem vir das variáveis de ambiente do
            deploy — salvar aqui grava a sua versão no banco, que passa a ter prioridade.
          </p>
        </section>

        <InstagramChannels />
        <CanaisExtras />

        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={save} disabled={saving}>
            <Save size={16} /> {saving ? "Salvando…" : "Salvar configurações"}
          </button>
          {notice && <p className="text-sm text-ink-800">{notice}</p>}
        </div>
      </div>

      <Simulator />
    </div>
  );
}

// ── Instagram ────────────────────────────────────────────────
// Mesmo padrão de conexão do Chatrun: login do Instagram, o canal nasce
// sozinho e o Direct cai na mesma Central e na mesma Vera.
type ChannelRow = {
  id: string;
  kind: "whatsapp" | "instagram";
  status: "connected" | "error" | "disconnected";
  label: string;
  tokenExpiresAt: string | null;
  lastError: string | null;
};

const IG_NOTICE: Record<string, string> = {
  ok: "✅ Instagram conectado. As mensagens do Direct já chegam na Central.",
  erro: "❌ Não foi possível conectar o Instagram.",
  config: "❌ Faltam INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET no deploy.",
  forbidden: "❌ Só administradores conectam canais.",
};

export function InstagramChannels() {
  const { store } = useWaPanel();
  const [rows, setRows] = useState<ChannelRow[] | null>(null);
  const [ready, setReady] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/wa/channels")
      .then((r) => r.json())
      .then((d: { channels?: ChannelRow[]; instagramReady?: boolean }) => {
        setRows((d.channels ?? []).filter((c) => c.kind === "instagram"));
        setReady(d.instagramReady !== false);
      })
      .catch(() => setRows([]));
  }, []);

  useEffect(() => {
    load();
    // Volta do login do Instagram: o resultado vem na URL.
    const sp = new URLSearchParams(window.location.search);
    const result = sp.get("instagram");
    if (result) {
      const why = sp.get("why");
      const who = sp.get("ig");
      setNotice(
        `${IG_NOTICE[result] ?? result}${who ? ` (@${who})` : ""}${why ? ` Motivo: ${why}` : ""}`,
      );
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [load]);

  async function disconnect(id: string) {
    if (!confirm("Desconectar este Instagram? A IA para de responder o Direct.")) return;
    const res = await fetch(`/api/wa/channels/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setNotice(`❌ ${body.error ?? "Falha ao desconectar"}`);
    }
    load();
  }

  const active = (rows ?? []).filter((c) => c.status !== "disconnected");

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Instagram size={18} className="text-brand-700" /> Instagram (Direct)
        </h2>
        <a
          className={clsx("btn-dark px-3 py-1.5 text-xs", !ready && "pointer-events-none opacity-50")}
          href="/api/wa/instagram/connect"
        >
          {active.length ? "Conectar outra conta" : "Conectar Instagram"}
        </a>
      </div>
      {notice && <p className="text-sm text-ink-800">{notice}</p>}
      {rows === null ? (
        <p className="text-xs text-muted">Carregando…</p>
      ) : active.length === 0 ? (
        <p className="text-xs text-muted">
          {store
            ? "Nenhuma conta conectada. Conecte a conta profissional do Instagram da loja para a IA atender o Direct."
            : "Nenhuma conta conectada. Conecte a conta profissional do Instagram do CNV para a Vera vender a assinatura também pelo Direct."}
        </p>
      ) : (
        <ul className="space-y-2">
          {active.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-canvas p-3 text-sm">
              <span className="min-w-0">
                <span className="font-semibold">{c.label}</span>{" "}
                {c.status === "connected" ? (
                  <span className="text-xs text-brand-800">● conectado</span>
                ) : (
                  <span className="text-xs text-red-500">
                    ● precisa reconectar{c.lastError ? ` — ${c.lastError}` : ""}
                  </span>
                )}
                {c.tokenExpiresAt && (
                  <span className="block text-[11px] text-muted">
                    Acesso renovado sozinho; vence em{" "}
                    {new Date(c.tokenExpiresAt).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 gap-2">
                {c.status !== "connected" && (
                  <a className="btn-ghost px-2 py-1 text-xs" href="/api/wa/instagram/connect">
                    Reconectar
                  </a>
                )}
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => disconnect(c.id)}>
                  Desconectar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!ready && (
        <p className="rounded-xl bg-canvas p-3 text-xs text-muted">
          Para conectar, o deploy precisa de <code>INSTAGRAM_APP_ID</code> e{" "}
          <code>INSTAGRAM_APP_SECRET</code> (produto Instagram do app da Meta).
        </p>
      )}
      <p className="rounded-xl bg-canvas p-3 text-xs text-muted">
        No app da Meta (produto Instagram), cadastre o redirect{" "}
        <code className="text-brand-800">
          {typeof window !== "undefined" ? window.location.origin : ""}/api/wa/instagram/callback
        </code>{" "}
        e o webhook{" "}
        <code className="text-brand-800">
          {typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/instagram
        </code>{" "}
        com o mesmo verify token do WhatsApp (ou <code>INSTAGRAM_WEBHOOK_VERIFY_TOKEN</code>).
      </p>
    </section>
  );
}

// ── Simulador ────────────────────────────────────────────────
type SimMsg = { role: "user" | "assistant" | "event"; content: string };

function Simulator() {
  const [messages, setMessages] = useState<SimMsg[]>([]);
  const [input, setInput] = useState("");
  const [funnel, setFunnel] = useState<"novo" | "cadastrado" | "assinante">("novo");
  const [canal, setCanal] = useState<"whatsapp" | "instagram">("whatsapp");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const nextMessages: SimMsg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setBusy(true);
    try {
      const res = await fetch("/api/wa/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          funnel,
          canal,
          messages: nextMessages
            .filter((m) => m.role !== "event")
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Erro no simulador");
      setMessages((prev) => [
        ...prev,
        ...(body.replies ?? []).map((r: string) => ({ role: "assistant" as const, content: r })),
        ...(body.events ?? []).map((e: string) => ({ role: "event" as const, content: e })),
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "event", content: `Erro: ${err instanceof Error ? err.message : err}` },
      ]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages, funnel, canal]);

  return (
    <section className="card flex h-[calc(100vh-8rem)] flex-col lg:sticky lg:top-20">
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
          <select
            className="input w-auto py-1 text-xs"
            value={funnel}
            onChange={(e) => setFunnel(e.target.value as typeof funnel)}
          >
            <option value="novo">Cliente novo</option>
            <option value="cadastrado">Já cadastrado (trial)</option>
            <option value="assinante">Assinante ativo</option>
          </select>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setMessages([])}>
            Limpar
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto rounded-xl bg-canvas/60 p-3">
        {messages.length === 0 && (
          <p className="p-4 text-center text-xs text-muted">
            Converse como se fosse um lojista interessado. Cadastro e pagamento são simulados —
            nada é criado de verdade.
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "event" ? (
            <p key={i} className="text-center text-[11px] italic text-amber-300/80">
              ⚙️ {m.content}
            </p>
          ) : (
            <div
              key={i}
              className={clsx(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                m.role === "user"
                  ? "ml-auto bg-brand-700/40 text-ink-900"
                  : "bg-ink-700 text-ink-900",
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
    </section>
  );
}
