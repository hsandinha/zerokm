"use client";

// "Conectar WhatsApp" da loja — pelo Chatrun Conexão. O botão pede o convite
// ao gateway e leva para a página dele (popup da Meta no app da Chatrun); a
// loja volta para cá com ?whatsapp=retorno e os números viram canais. O
// cadastro manual continua para quem já tem app próprio na Meta.
// O número conectado vira um canal da loja; a lista vem de /api/wa/channels.

import { useCallback, useEffect, useState } from "react";
import { Loader2, PhoneCall } from "lucide-react";

type Canal = { id: string; kind: string; status: string; label: string; lastError: string | null };

const PARAMS_DO_RETORNO = ["whatsapp", "status", "channel", "connection_id", "account_id", "mensagem"];

export function ConectarWhatsApp() {
  const [canais, setCanais] = useState<Canal[] | null>(null);
  const [chatrun, setChatrun] = useState<boolean | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [manual, setManual] = useState({ phoneNumberId: "", wabaId: "", token: "" });

  const load = useCallback(() => {
    fetch("/api/wa/channels")
      .then((r) => r.json())
      .then((d: { channels?: Canal[] }) => setCanais((d.channels ?? []).filter((c) => c.kind === "whatsapp")))
      .catch(() => setCanais([]));
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const retorno = url.searchParams.get("whatsapp") === "retorno";

    if (retorno) {
      // Volta da página do Chatrun: confirma no gateway e limpa o endereço.
      const ok = url.searchParams.get("status") === "ok";
      const accountId = url.searchParams.get("account_id");
      const mensagem = url.searchParams.get("mensagem");
      for (const p of PARAMS_DO_RETORNO) url.searchParams.delete(p);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);

      if (!ok) {
        setNotice(`❌ O WhatsApp não foi conectado: ${mensagem || "o retorno veio sem detalhe."}`);
      } else {
        setWorking("Confirmando a conexão…");
        fetch("/api/wa/whatsapp/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "retorno", accountId }),
        })
          .then(async (r) => {
            const d = (await r.json().catch(() => ({}))) as { error?: string; aviso?: string | null; conectados?: number };
            if (!r.ok) throw new Error(d.error || "Falha ao confirmar a conexão");
            setNotice(
              d.aviso
                ? `⚠️ ${d.aviso}`
                : d.conectados
                  ? "✅ WhatsApp conectado."
                  : "⏳ A Meta ainda está concluindo a conexão. Em instantes o número aparece aqui.",
            );
          })
          .catch((err) => setNotice(`❌ ${err instanceof Error ? err.message : "Falha ao confirmar a conexão"}`))
          .finally(() => {
            setWorking(null);
            load();
          });
      }
    }

    fetch("/api/wa/whatsapp/connect")
      .then((r) => r.json())
      .then((d: { chatrun?: boolean; aviso?: string | null }) => {
        setChatrun(Boolean(d.chatrun));
        if (d.aviso && !retorno) setNotice(`⚠️ ${d.aviso}`);
      })
      .catch(() => setChatrun(false))
      .finally(load);
  }, [load]);

  async function conectarPeloChatrun() {
    setWorking("Abrindo a conexão…");
    setNotice(null);
    try {
      const res = await fetch("/api/wa/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "convite" }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error || "Não foi possível gerar o link de conexão");
      window.location.href = body.url;
    } catch (err) {
      setNotice(`❌ ${err instanceof Error ? err.message : "Não foi possível conectar o WhatsApp"}`);
      setWorking(null);
    }
  }

  async function conectarManual() {
    setWorking("Conectando o número…");
    setNotice(null);
    try {
      const res = await fetch("/api/wa/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manual }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Falha ao conectar");
      setNotice(
        `✅ WhatsApp ${body.phoneNumber ?? ""} conectado.${body.warning ? ` Atenção: ${body.warning}` : ""}`,
      );
      setManual({ phoneNumberId: "", wabaId: "", token: "" });
      load();
    } catch (err) {
      setNotice(`❌ ${err instanceof Error ? err.message : "Falha ao conectar"}`);
    } finally {
      setWorking(null);
    }
  }

  async function desconectar(id: string) {
    if (!confirm("Desconectar este número? A IA e a central param de receber as mensagens dele.")) return;
    await fetch(`/api/wa/channels/${id}`, { method: "DELETE" });
    load();
  }

  const ativos = (canais ?? []).filter((c) => c.status !== "disconnected");

  return (
    <section className="card space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <PhoneCall size={18} className="text-brand-700" /> WhatsApp
      </h2>
      {canais === null ? (
        <p className="text-xs text-muted">Carregando…</p>
      ) : ativos.length ? (
        <ul className="space-y-2">
          {ativos.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-canvas p-3 text-sm">
              <span>
                <span className="font-semibold">{c.label}</span>{" "}
                {c.status === "connected" ? (
                  <span className="text-xs text-brand-800">● conectado</span>
                ) : (
                  <span className="text-xs text-red-500">● atenção{c.lastError ? `: ${c.lastError}` : ""}</span>
                )}
              </span>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => desconectar(c.id)}>
                Desconectar
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">Nenhum número conectado ainda.</p>
      )}

      {chatrun === null ? null : chatrun ? (
        <div className="space-y-1">
          <button className="btn-dark px-3 py-1.5 text-sm" disabled={!!working} onClick={conectarPeloChatrun}>
            {ativos.length ? "Conectar outro número" : "Conectar WhatsApp"}
          </button>
          <p className="text-xs text-muted">
            Abre a página do Chatrun com o login da Meta. Dá para conectar um número novo ou o número que a loja já usa
            no app WhatsApp Business do celular.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted">
          A conexão pelo Chatrun ainda não está configurada na plataforma (CHATRUN_API_KEY). Use o cadastro manual
          abaixo.
        </p>
      )}
      {working && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={14} className="animate-spin" /> {working}
        </p>
      )}
      {notice && <p className="text-sm text-ink-800">{notice}</p>}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Já tenho app próprio na Meta (cadastro manual)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            className="input"
            placeholder="Phone Number ID"
            value={manual.phoneNumberId}
            onChange={(e) => setManual({ ...manual, phoneNumberId: e.target.value })}
          />
          <input
            className="input"
            placeholder="WABA ID"
            value={manual.wabaId}
            onChange={(e) => setManual({ ...manual, wabaId: e.target.value })}
          />
          <input
            className="input sm:col-span-2"
            type="password"
            placeholder="Token permanente"
            value={manual.token}
            onChange={(e) => setManual({ ...manual, token: e.target.value })}
          />
          <button className="btn-dark px-3 py-1.5 text-sm sm:col-span-2" disabled={!!working} onClick={conectarManual}>
            Validar e conectar
          </button>
        </div>
      </details>
    </section>
  );
}
