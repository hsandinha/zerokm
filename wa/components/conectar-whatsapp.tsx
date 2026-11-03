"use client";

// "Conectar WhatsApp" da loja — o Embedded Signup da Meta (popup), portado do
// Chatrun, com o cadastro manual de reserva para quem já tem app próprio.
// O número conectado vira um canal da loja; a lista vem de /api/wa/channels.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, PhoneCall } from "lucide-react";

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void;
      login: (cb: (r: { authResponse?: { code?: string } | null }) => void, opts: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

type Canal = { id: string; kind: string; status: string; label: string; lastError: string | null };
const GRAPH_VERSION = "v26.0";

export function ConectarWhatsApp() {
  const [canais, setCanais] = useState<Canal[] | null>(null);
  const [es, setEs] = useState<{ appId: string; configId: string } | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [manual, setManual] = useState({ phoneNumberId: "", wabaId: "", token: "" });
  const session = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  const load = useCallback(() => {
    fetch("/api/wa/channels")
      .then((r) => r.json())
      .then((d: { channels?: Canal[] }) => setCanais((d.channels ?? []).filter((c) => c.kind === "whatsapp")))
      .catch(() => setCanais([]));
  }, []);

  useEffect(() => {
    load();
    fetch("/api/wa/whatsapp/connect")
      .then((r) => r.json())
      .then((d) => setEs(d.embeddedSignup ?? null))
      .catch(() => {});
  }, [load]);

  // SDK do Facebook + o postMessage do popup (waba_id / phone_number_id).
  useEffect(() => {
    if (!es) return;
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
          session.current = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id };
        }
      } catch {
        // mensagem de outro script do Facebook
      }
    };
    window.addEventListener("message", onMessage);
    if (window.FB) {
      setSdkReady(true);
    } else {
      window.fbAsyncInit = () => {
        window.FB?.init({ appId: es.appId, autoLogAppEvents: true, xfbml: true, version: GRAPH_VERSION });
        setSdkReady(true);
      };
      const script = document.createElement("script");
      script.src = "https://connect.facebook.net/pt_BR/sdk.js";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      document.body.appendChild(script);
    }
    return () => window.removeEventListener("message", onMessage);
  }, [es]);

  async function finalizar(payload: Record<string, unknown>) {
    setWorking("Conectando o número…");
    setNotice(null);
    try {
      const res = await fetch("/api/wa/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  function abrirPopup(coexistencia: boolean) {
    if (!window.FB || !es) return;
    session.current = {};
    setWorking("Aguardando o Facebook…");
    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setWorking(null);
          return;
        }
        void finalizar({ code, ...session.current });
      },
      {
        config_id: es.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: "3",
          // Coexistência: o mesmo número continua no app do celular.
          ...(coexistencia ? { featureType: "whatsapp_business_app_onboarding" } : {}),
        },
      },
    );
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
                  <span className="text-xs text-red-500">● atenção{c.lastError ? ` — ${c.lastError}` : ""}</span>
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

      {es ? (
        <div className="flex flex-wrap gap-2">
          <button className="btn-dark px-3 py-1.5 text-sm" disabled={!sdkReady || !!working} onClick={() => abrirPopup(false)}>
            Conectar número novo
          </button>
          <button className="btn-ghost px-3 py-1.5 text-sm" disabled={!sdkReady || !!working} onClick={() => abrirPopup(true)}>
            Usar o número do app WhatsApp Business
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted">
          A conexão pelo popup da Meta ainda não está configurada na plataforma (META_APP_ID e META_ES_CONFIG_ID).
          Use o cadastro manual abaixo.
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
          <button className="btn-dark px-3 py-1.5 text-sm sm:col-span-2" disabled={!!working} onClick={() => finalizar({ manual })}>
            Validar e conectar
          </button>
        </div>
      </details>
    </section>
  );
}
