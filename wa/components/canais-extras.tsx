"use client";

// Canais além do WhatsApp e do Instagram: o Messenger da Página do Facebook
// e o SMS/RCS da loja. Mesmo padrão de conexão do Chatrun e as mesmas
// classes do cartão do Instagram (config-screen.tsx), para encaixar na tela
// de Configuração do CNV e na da loja.
//
//   Messenger: "Conectar Messenger" → login do Facebook → uma Página só
//     conecta direto; várias voltam para cá com ?messenger=escolher e a
//     pessoa escolhe a Página aqui mesmo.
//   SMS/RCS: a conta é da loja (cada loja paga o próprio disparo). Zenvia
//     (SMS e RCS, webhook assinado sozinho) ou Comtele (só SMS, webhook
//     cadastrado à mão com o endereço que aparece no cartão).

import { useCallback, useEffect, useState } from "react";
import { Facebook, MessageSquareText, Save } from "lucide-react";
import clsx from "clsx";
import { usePodeUsar } from "@wa/components/wa-panel";

type ChannelStatus = "connected" | "error" | "disconnected";

type ChannelRow = {
  id: string;
  kind: "whatsapp" | "instagram" | "messenger" | "sms";
  status: ChannelStatus;
  label: string;
  lastError: string | null;
  pageName?: string | null;
  sms?: {
    provider: "zenvia" | "comtele" | null;
    sender: string | null;
    route: number | null;
    rcsAgentId: string | null;
    tokenEnd: string | null;
    webhookUrl: string | null;
  };
};

type ChannelsPayload = { channels?: ChannelRow[]; messengerReady?: boolean };

function useChannels() {
  const [rows, setRows] = useState<ChannelRow[] | null>(null);
  const [messengerReady, setMessengerReady] = useState(true);
  const load = useCallback(() => {
    fetch("/api/wa/channels")
      .then((r) => r.json())
      .then((d: ChannelsPayload) => {
        setRows(d.channels ?? []);
        setMessengerReady(d.messengerReady !== false);
      })
      .catch(() => setRows([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { rows, messengerReady, load };
}

async function disconnectChannel(id: string): Promise<string | null> {
  const res = await fetch(`/api/wa/channels/${id}`, { method: "DELETE" });
  if (res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return body.error ?? "Falha ao desconectar";
}

function StatusTag({ status, lastError }: { status: ChannelStatus; lastError: string | null }) {
  if (status === "connected") {
    return (
      <>
        <span className="text-xs text-brand-800">● conectado</span>
        {lastError && <span className="block text-[11px] text-red-500">{lastError}</span>}
      </>
    );
  }
  return (
    <span className="text-xs text-red-500">
      ● precisa reconectar{lastError ? ` — ${lastError}` : ""}
    </span>
  );
}

// ── Messenger ────────────────────────────────────────────────
const FB_NOTICE: Record<string, string> = {
  ok: "✅ Messenger conectado. As mensagens da Página já chegam na Central.",
  erro: "❌ Não foi possível conectar o Messenger.",
  config: "❌ Faltam META_APP_ID / META_APP_SECRET no deploy.",
  forbidden: "❌ Só gestores conectam canais.",
};

type ChoicePage = { id: string; name: string; pictureUrl: string | null; canMessage: boolean };

function MessengerCard({
  rows,
  ready,
  reload,
}: {
  rows: ChannelRow[] | null;
  ready: boolean;
  reload: () => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ id: string; pages: ChoicePage[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    // Volta do login do Facebook: o resultado (ou a escolha) vem na URL.
    const sp = new URLSearchParams(window.location.search);
    const result = sp.get("messenger");
    if (!result) return;
    const choiceId = sp.get("escolha");
    window.history.replaceState(null, "", window.location.pathname);
    if (result === "escolher" && choiceId) {
      fetch(`/api/wa/messenger/choice?id=${encodeURIComponent(choiceId)}`)
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(body.error ?? "O login venceu. Clique em Conectar de novo.");
          setChoice({ id: choiceId, pages: body.pages ?? [] });
          setNotice("Você administra mais de uma Página. Escolha qual conectar:");
        })
        .catch((err: Error) => setNotice(`❌ ${err.message}`));
      return;
    }
    const why = sp.get("why");
    const page = sp.get("pagina");
    setNotice(`${FB_NOTICE[result] ?? result}${page ? ` (${page})` : ""}${why ? ` Motivo: ${why}` : ""}`);
  }, []);

  async function choose(pageId: string) {
    if (!choice) return;
    setBusy(pageId);
    const res = await fetch("/api/wa/messenger/choice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: choice.id, pageId }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setNotice(`❌ ${body.error ?? "Não foi possível conectar a Página."}`);
      return;
    }
    setChoice(null);
    setNotice(`${FB_NOTICE.ok} (${body.page})`);
    reload();
  }

  async function disconnect(id: string) {
    if (!confirm("Desconectar esta Página? As mensagens do Messenger param de chegar.")) return;
    const error = await disconnectChannel(id);
    if (error) setNotice(`❌ ${error}`);
    reload();
  }

  const active = (rows ?? []).filter((c) => c.kind === "messenger" && c.status !== "disconnected");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Facebook size={18} className="text-brand-700" /> Messenger (Página do Facebook)
        </h2>
        <a
          className={clsx("btn-dark px-3 py-1.5 text-xs", !ready && "pointer-events-none opacity-50")}
          href="/api/wa/messenger/connect"
        >
          {active.length ? "Conectar outra Página" : "Conectar Messenger"}
        </a>
      </div>
      {notice && <p className="text-sm text-ink-800">{notice}</p>}
      {choice && (
        <ul className="space-y-2">
          {choice.pages.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-canvas p-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                {p.pictureUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.pictureUrl} alt="" className="h-7 w-7 shrink-0 rounded-full" />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  {!p.canMessage && (
                    <span className="block text-[11px] text-red-500">
                      Sua função nesta Página não permite responder mensagens.
                    </span>
                  )}
                </span>
              </span>
              <button
                className="btn-dark shrink-0 px-2 py-1 text-xs"
                disabled={!p.canMessage || busy !== null}
                onClick={() => choose(p.id)}
              >
                {busy === p.id ? "Conectando…" : "Conectar"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows === null ? (
        <p className="text-xs text-muted">Carregando…</p>
      ) : active.length === 0 ? (
        !choice && (
          <p className="text-xs text-muted">
            Nenhuma Página conectada. Conecte a Página do Facebook para atender o Messenger na
            mesma Central, com a mesma IA.
          </p>
        )
      ) : (
        <ul className="space-y-2">
          {active.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-canvas p-3 text-sm">
              <span className="min-w-0">
                <span className="font-semibold">{c.label}</span>{" "}
                <StatusTag status={c.status} lastError={c.lastError} />
              </span>
              <span className="flex shrink-0 gap-2">
                {c.status !== "connected" && (
                  <a className="btn-ghost px-2 py-1 text-xs" href="/api/wa/messenger/connect">
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
          Para conectar, o deploy precisa de <code>META_APP_ID</code> e <code>META_APP_SECRET</code>{" "}
          (e, com o Login do Facebook para Empresas, <code>MESSENGER_LOGIN_CONFIG_ID</code>).
        </p>
      )}
      <p className="rounded-xl bg-canvas p-3 text-xs text-muted">
        No app da Meta (produto Messenger), cadastre o redirect{" "}
        <code className="text-brand-800">{origin}/api/wa/messenger/callback</code> e o webhook{" "}
        <code className="text-brand-800">{origin}/api/webhooks/messenger</code> com{" "}
        <code>MESSENGER_WEBHOOK_VERIFY_TOKEN</code> (ou o verify token do WhatsApp). Fora das 24h
        só a equipe responde, até 7 dias.
      </p>
    </section>
  );
}

// ── SMS / RCS ────────────────────────────────────────────────
type SmsForm = {
  provider: "zenvia" | "comtele";
  token: string;
  sender: string;
  route: string;
  rcsAgentId: string;
};

const EMPTY_FORM: SmsForm = { provider: "zenvia", token: "", sender: "", route: "", rcsAgentId: "" };

function SmsCard({ rows, reload }: { rows: ChannelRow[] | null; reload: () => void }) {
  const channel = (rows ?? []).find((c) => c.kind === "sms") ?? null;
  const connected = channel && channel.status !== "disconnected" ? channel : null;
  const [form, setForm] = useState<SmsForm>(EMPTY_FORM);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // O formulário começa com o que já está salvo (menos o token, que não sai).
  useEffect(() => {
    if (!connected?.sms?.provider) return;
    setForm({
      provider: connected.sms.provider,
      token: "",
      sender: connected.sms.sender ?? "",
      route: connected.sms.route ? String(connected.sms.route) : "",
      rcsAgentId: connected.sms.rcsAgentId ?? "",
    });
  }, [connected?.id, connected?.sms?.provider, connected?.sms?.sender, connected?.sms?.route, connected?.sms?.rcsAgentId]);

  const set = <K extends keyof SmsForm>(key: K, value: SmsForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setSaving(true);
    setNotice(null);
    const res = await fetch("/api/wa/sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: form.provider,
        token: form.token,
        sender: form.provider === "zenvia" ? form.sender : "",
        route: form.provider === "comtele" ? form.route : "",
        rcsAgentId: form.provider === "zenvia" ? form.rcsAgentId : "",
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setNotice(`❌ ${body.error ?? "Falha ao salvar"}`);
      return;
    }
    const hook = body.webhook as { registered: string[]; error: string | null; manual: boolean } | undefined;
    setNotice(
      hook?.manual
        ? "✅ Conta da Comtele conferida e salva. Cadastre o endereço do webhook abaixo no painel da Comtele."
        : hook?.error
          ? `✅ Conta da Zenvia salva, mas o webhook não foi assinado: ${hook.error}`
          : "✅ Conta da Zenvia conferida e salva; o webhook do canal está assinado.",
    );
    setForm((f) => ({ ...f, token: "" }));
    reload();
  }

  async function disconnect() {
    if (!connected) return;
    if (!confirm("Desligar o SMS? Nada mais sai nem entra por SMS; o histórico fica na Central.")) return;
    const error = await disconnectChannel(connected.id);
    setNotice(error ? `❌ ${error}` : "SMS desligado. O histórico continua na Central.");
    setForm(EMPTY_FORM);
    reload();
  }

  const sameProvider = connected?.sms?.provider === form.provider;
  const tokenHint =
    sameProvider && connected?.sms?.tokenEnd
      ? `•••• ${connected.sms.tokenEnd} (em branco mantém)`
      : form.provider === "zenvia"
        ? "Token da API (X-API-TOKEN)"
        : "Chave de API (x-api-key)";

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <MessageSquareText size={18} className="text-brand-700" /> SMS e RCS
        </h2>
        {connected && (
          <button className="btn-ghost px-2 py-1 text-xs" onClick={disconnect}>
            Desligar
          </button>
        )}
      </div>
      {notice && <p className="text-sm text-ink-800">{notice}</p>}
      {rows === null ? (
        <p className="text-xs text-muted">Carregando…</p>
      ) : connected ? (
        <p className="rounded-xl bg-canvas p-3 text-sm">
          <span className="font-semibold">{connected.label}</span>{" "}
          <StatusTag status={connected.status} lastError={connected.lastError} />
        </p>
      ) : (
        <p className="text-xs text-muted">
          Use a conta da própria loja na Zenvia (SMS e RCS) ou na Comtele (SMS pré-pago): cada loja
          paga o próprio disparo. A resposta do cliente por SMS cai na fila da equipe — a IA não
          responde por SMS.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Provedor</span>
          <select
            className="input"
            value={form.provider}
            onChange={(e) => set("provider", e.target.value as SmsForm["provider"])}
          >
            <option value="zenvia">Zenvia (SMS e RCS)</option>
            <option value="comtele">Comtele (SMS)</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">
            {form.provider === "zenvia" ? "Token da API" : "Chave de API"}
          </span>
          <input
            className="input"
            type="password"
            autoComplete="off"
            placeholder={tokenHint}
            value={form.token}
            onChange={(e) => set("token", e.target.value)}
          />
        </label>
        {form.provider === "zenvia" ? (
          <>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Remetente do SMS</span>
              <input
                className="input"
                placeholder="nome da conta SMS na Zenvia"
                value={form.sender}
                onChange={(e) => set("sender", e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Agente RCS (opcional)</span>
              <input
                className="input"
                placeholder="id do agente da marca"
                value={form.rcsAgentId}
                onChange={(e) => set("rcsAgentId", e.target.value)}
              />
            </label>
          </>
        ) : (
          <label className="text-sm">
            <span className="mb-1 block text-muted">Rota (opcional)</span>
            <input
              className="input"
              inputMode="numeric"
              placeholder="padrão da conta"
              value={form.route}
              onChange={(e) => set("route", e.target.value.replace(/\D/g, ""))}
            />
          </label>
        )}
      </div>
      <div className="flex justify-end">
        <button className="btn-dark flex items-center gap-1.5 px-3 py-1.5 text-xs" disabled={saving} onClick={save}>
          <Save size={14} /> {saving ? "Conferindo…" : connected ? "Salvar conta" : "Ligar SMS"}
        </button>
      </div>

      {form.provider === "zenvia" && (
        <p className="rounded-xl bg-canvas p-3 text-xs text-muted">
          Com o agente RCS a mensagem sai por RCS (com a marca da loja) e a própria Zenvia manda SMS
          quando o aparelho não tem RCS — a Central registra por onde foi. O agente é criado pela
          Zenvia e aprovado pelo Google e pelas operadoras. O webhook do canal é assinado na Zenvia
          ao salvar.
        </p>
      )}
      {connected?.sms?.webhookUrl && connected.sms.provider === "comtele" && (
        <p className="rounded-xl bg-canvas p-3 text-xs text-muted">
          No painel da Comtele, cadastre este endereço para <b>status</b> e <b>respostas</b> (ele
          carrega o segredo do canal — não compartilhe):{" "}
          <code className="break-all text-brand-800">{connected.sms.webhookUrl}</code>
        </p>
      )}
    </section>
  );
}

export function CanaisExtras() {
  const { rows, messengerReady, load } = useChannels();
  const podeUsar = usePodeUsar();
  return (
    <div className="space-y-6">
      {podeUsar("messenger") && <MessengerCard rows={rows} ready={messengerReady} reload={load} />}
      {podeUsar("sms") && <SmsCard rows={rows} reload={load} />}
    </div>
  );
}
