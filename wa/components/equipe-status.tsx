"use client";

// Na moldura do painel (loja e CNV): o status de quem atende (Online, Pausa,
// Ausente), o sinal de vida que diz ao servidor que o painel está aberto e o
// sino dos avisos no navegador (push).
//
// O sinal sai a cada minuto, na volta para a aba e ao ganhar ou perder o
// foco: é ele que tira da distribuição quem fechou o navegador e que segura o
// push de quem já está com o painel na frente.
//
// Push sem app instalável (decisão do dono): só o service worker de
// public/sw-push.js. No iPhone o Safari só entrega push para site adicionado
// à Tela de Início, e a tela explica isso em vez de oferecer o sino.

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Bell, BellOff, ChevronDown, Coffee, LogOut, Moon, Radio } from "lucide-react";
import {
  PING_MS,
  STATUS_COR,
  STATUS_ROTULO,
  formatarDuracao,
  type ModoDistribuicao,
  type StatusAtendente,
} from "@wa/lib/equipe";
import { SW_ESCOPO, SW_URL, inscricaoAtual } from "@wa/lib/push-aparelho";

type EstadoServidor = {
  status: StatusAtendente;
  pausaMotivo: string | null;
  statusDesde: string | null;
  distribuicao: ModoDistribuicao;
  horario: { ativo: boolean; aberto: boolean; quandoVolta: string };
  motivosDePausa: string[];
};

function focado(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus();
}

export function useStatusAtendente() {
  const [estado, setEstado] = useState<EstadoServidor | null>(null);
  const ultimoPing = useRef(0);

  const enviar = useCallback(async (extra: { status?: StatusAtendente; motivo?: string | null } = {}) => {
    ultimoPing.current = Date.now();
    try {
      const res = await fetch("/api/wa/equipe/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...extra, foco: focado() }),
        keepalive: true,
      });
      if (!res.ok) return false;
      setEstado((await res.json()) as EstadoServidor);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    void enviar();
    const t = window.setInterval(() => void enviar(), PING_MS);
    // Foco e aba: sinal na hora, mas sem metralhar o servidor.
    const mudou = () => {
      if (Date.now() - ultimoPing.current > 5_000) void enviar();
    };
    document.addEventListener("visibilitychange", mudou);
    window.addEventListener("focus", mudou);
    window.addEventListener("blur", mudou);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", mudou);
      window.removeEventListener("focus", mudou);
      window.removeEventListener("blur", mudou);
    };
  }, [enviar]);

  const mudar = useCallback(
    (status: StatusAtendente, motivo: string | null = null) => enviar({ status, motivo }),
    [enviar],
  );
  return { estado, mudar };
}

const ICONE: Record<StatusAtendente, typeof Radio> = { online: Radio, pausa: Coffee, ausente: LogOut };

function StatusMenu({
  estado,
  mudar,
}: {
  estado: EstadoServidor;
  mudar: (s: StatusAtendente, motivo?: string | null) => Promise<boolean>;
}) {
  const [aberto, setAberto] = useState(false);
  const [pausa, setPausa] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const rodizio = estado.distribuicao === "rodizio";

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) {
        setAberto(false);
        setPausa(false);
      }
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  async function escolher(s: StatusAtendente, motivo: string | null = null) {
    setAberto(false);
    setPausa(false);
    setErro(null);
    if (!(await mudar(s, motivo))) setErro("Não deu para mudar o status. Tente de novo.");
  }

  const cor = STATUS_COR[estado.status];
  const desde = estado.statusDesde ? Date.now() - new Date(estado.statusDesde).getTime() : 0;
  const opcoes: Array<{ s: StatusAtendente; dica: string }> = [
    { s: "online", dica: rodizio ? "Recebe as conversas que chegam na fila" : "Disponível para atender" },
    { s: "pausa", dica: "Almoço, café, reunião. Não recebe conversa nova" },
    { s: "ausente", dica: "Fora do expediente. Não recebe conversa" },
  ];

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Seu status: ${STATUS_ROTULO[estado.status]}. Trocar status`}
        className={clsx(
          "flex items-center gap-2 rounded-2xl border border-line px-3 py-1.5 text-sm font-semibold transition hover:bg-canvas",
          cor.texto,
        )}
      >
        <span className={clsx("h-2 w-2 shrink-0 rounded-full", cor.dot)} />
        {STATUS_ROTULO[estado.status]}
        {estado.status === "pausa" && estado.pausaMotivo ? (
          <span className="hidden font-normal text-muted sm:inline">· {estado.pausaMotivo}</span>
        ) : null}
        <ChevronDown size={14} className="text-muted" />
      </button>
      {erro && <p className="absolute right-0 top-full mt-1 w-56 text-right text-xs text-red-600">{erro}</p>}
      {aberto && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-72 rounded-2xl border border-line bg-paper p-2 shadow-lg"
        >
          {!pausa ? (
            <>
              <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Seu status</p>
              {opcoes.map(({ s, dica }) => {
                const Icone = ICONE[s];
                return (
                  <button
                    key={s}
                    type="button"
                    role="menuitemradio"
                    aria-checked={estado.status === s}
                    onClick={() => (s === "pausa" ? setPausa(true) : escolher(s))}
                    className={clsx(
                      "flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-canvas",
                      estado.status === s && "bg-canvas",
                    )}
                  >
                    <Icone size={16} className={clsx("mt-0.5", STATUS_COR[s].texto)} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink-900">{STATUS_ROTULO[s]}</span>
                      <span className="block text-xs text-muted">
                        {s === estado.status && s !== "online" && desde > 60_000
                          ? `Há ${formatarDuracao(desde)}`
                          : dica}
                      </span>
                    </span>
                  </button>
                );
              })}
              <p className="mt-1 border-t border-line px-2 pt-2 text-xs leading-relaxed text-muted">
                {rodizio
                  ? "Esta loja distribui as conversas em rodízio entre quem está Online."
                  : "A distribuição é manual: o status aparece para a equipe e nos Resultados."}{" "}
                Sem o painel aberto por alguns minutos, você aparece como Ausente.
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPausa(false)}
                className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-ink-900"
              >
                ‹ Motivo da pausa
              </button>
              {[...estado.motivosDePausa, null].map((m) => (
                <button
                  key={m ?? "sem"}
                  type="button"
                  role="menuitem"
                  onClick={() => escolher("pausa", m)}
                  className="block w-full rounded-xl px-2 py-2 text-left text-sm hover:bg-canvas"
                >
                  {m ?? "Sem motivo"}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Avisos no navegador ──────────────────────────────────────

type EstadoAvisos = "carregando" | "sem-chave" | "sem-suporte" | "iphone" | "bloqueado" | "ativo" | "inativo";


function ehIphone(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function naTelaDeInicio(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function bytesDaChave(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function AvisosPush() {
  const [estado, setEstado] = useState<EstadoAvisos>("carregando");
  const [chave, setChave] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const conferir = useCallback(async () => {
    try {
      const sub = "serviceWorker" in navigator ? await inscricaoAtual().catch(() => null) : null;
      const q = sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : "";
      const res = await fetch(`/api/wa/push${q}`);
      const d = (await res.json()) as { ativo: boolean; publicKey: string | null; inscrito: boolean };
      if (!d.ativo || !d.publicKey) return setEstado("sem-chave");
      setChave(d.publicKey);
      if (ehIphone() && !naTelaDeInicio()) return setEstado("iphone");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setEstado("sem-suporte");
      }
      if (Notification.permission === "denied") return setEstado("bloqueado");
      setEstado(sub && d.inscrito && Notification.permission === "granted" ? "ativo" : "inativo");
    } catch {
      setEstado("sem-chave");
    }
  }, []);
  useEffect(() => {
    void conferir();
  }, [conferir]);

  async function ligar() {
    if (!chave) return;
    setOcupado(true);
    setAviso(null);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "inativo");
        setAviso("Sem permissão. Libere as notificações deste site nas configurações do navegador.");
        return;
      }
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_ESCOPO });
      await reg.update().catch(() => {});
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDaChave(chave) }));
      const res = await fetch("/api/wa/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error);
      setEstado("ativo");
      setAviso("Avisos ligados neste aparelho.");
    } catch (err) {
      setAviso(err instanceof Error && err.message ? err.message : "Não deu para ligar os avisos agora.");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    setAviso(null);
    try {
      const sub = await inscricaoAtual();
      if (sub) {
        await fetch("/api/wa/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setEstado("inativo");
      setAviso("Avisos desligados neste aparelho.");
    } finally {
      setOcupado(false);
    }
  }

  async function testar() {
    setAviso(null);
    const res = await fetch("/api/wa/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teste: true }),
    }).catch(() => null);
    const d = res?.ok ? ((await res.json()) as { entregues: number }) : null;
    setAviso(
      d?.entregues
        ? "Aviso de teste enviado. Com o painel na frente, ele não aparece: troque de aba para ver."
        : "Nenhum aparelho recebeu. Desligue e ligue os avisos de novo.",
    );
  }

  const [menu, setMenu] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [menu]);

  // Sem chaves VAPID no servidor, o sino nem aparece.
  if (estado === "carregando" || estado === "sem-chave") return null;
  const ligado = estado === "ativo";

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setMenu((v) => !v)}
        aria-label={ligado ? "Avisos no navegador: ligados" : "Avisos no navegador: desligados"}
        title="Avisos no navegador"
        className={clsx(
          "flex h-9 w-9 items-center justify-center rounded-2xl border border-line transition hover:bg-canvas",
          ligado ? "text-brand-700" : "text-muted",
        )}
      >
        {ligado ? <Bell size={16} /> : <BellOff size={16} />}
      </button>
      {menu && (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 space-y-2 rounded-2xl border border-line bg-paper p-3 text-sm shadow-lg">
          <p className="font-semibold text-ink-900">Avisos no navegador</p>
          <p className="text-xs leading-relaxed text-muted">
            Conversa nova na fila, conversa transferida para você e mensagem nova numa conversa sua, mesmo com o
            painel em outra aba.
          </p>
          {estado === "iphone" ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              No iPhone, os avisos só funcionam com o site adicionado à Tela de Início: toque em Compartilhar e
              depois em “Adicionar à Tela de Início”, abra pelo ícone e ligue aqui.
            </p>
          ) : estado === "sem-suporte" ? (
            <p className="text-xs text-muted">Este navegador não recebe avisos.</p>
          ) : estado === "bloqueado" ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              As notificações deste site estão bloqueadas. Libere nas configurações do navegador (cadeado ao lado do
              endereço) e volte aqui.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ligado ? (
                <>
                  <button className="btn-ghost px-3 py-1.5 text-xs" disabled={ocupado} onClick={desligar}>
                    Desligar neste aparelho
                  </button>
                  <button className="btn-ghost px-3 py-1.5 text-xs" disabled={ocupado} onClick={testar}>
                    Mandar um teste
                  </button>
                </>
              ) : (
                <button className="btn-primary px-3 py-1.5 text-xs" disabled={ocupado} onClick={ligar}>
                  {ocupado ? "Ligando…" : "Ligar neste aparelho"}
                </button>
              )}
            </div>
          )}
          {aviso && <p className="text-xs text-ink-800">{aviso}</p>}
        </div>
      )}
    </div>
  );
}

/** Status, fora do horário e sino, lado a lado na moldura. */
export function EquipeNaMoldura() {
  const { estado, mudar } = useStatusAtendente();
  if (!estado) return null;
  const fechado = estado.horario.ativo && !estado.horario.aberto;
  return (
    <div className="flex items-center gap-2">
      {fechado && (
        <span
          className="hidden items-center gap-1 rounded-2xl bg-canvas px-2.5 py-1 text-xs font-semibold text-muted md:flex"
          title={estado.horario.quandoVolta ? `A equipe volta ${estado.horario.quandoVolta}` : undefined}
        >
          <Moon size={13} /> Fora do horário
        </span>
      )}
      <StatusMenu estado={estado} mudar={mudar} />
      <AvisosPush />
    </div>
  );
}
