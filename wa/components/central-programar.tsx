"use client";

// Mensagem programada na Central: o botão do relógio no compositor abre o
// texto (vem o que já estava escrito), o dia e a hora. Se nessa hora a janela
// de 24h do WhatsApp já tiver fechado, pede o template aprovado que sai no
// lugar. A faixa acima do campo mostra o que está programado (com cancelar) e
// o que não saiu (com o motivo).

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { AlarmClock, Loader2, X } from "lucide-react";
import { FUSO, erroAoProgramar, livreEm, quandoTexto } from "@wa/lib/programadas";

type Modelo = {
  name: string;
  language: string;
  body: string;
  variables: number;
  headerFormat?: string | null;
  headerVariables?: number;
  buttonVariables?: unknown[];
};

export type Programada = {
  id: string;
  texto: string;
  enviarEm: string;
  situacao: "programada" | "enviando" | "enviada" | "falhou" | "cancelada";
  erro: string | null;
  modelo: { nome: string; texto: string } | null;
  criadoPorNome: string | null;
  criadoPor: string;
};

/** Data e hora de agora em Brasília, para os campos e os atalhos. */
function agoraEmBrasilia() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { dia: `${v("year")}-${v("month")}-${v("day")}`, hora: Number(v("hour")) % 24 };
}

function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function render(body: string, values: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (m, n: string) => values[Number(n) - 1]?.trim() || m);
}

/** Só corpo: o resto (arquivo, {{1}} no cabeçalho, link no botão) só na hora. */
function programavel(m: Modelo): boolean {
  if (m.headerFormat && m.headerFormat !== "TEXT") return false;
  if ((m.headerVariables ?? 0) > 0) return false;
  return !(m.buttonVariables ?? []).length;
}

export function BotaoProgramar({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="rounded-full p-1.5 text-muted hover:bg-canvas hover:text-ink-900 disabled:opacity-40"
      onClick={onClick}
      disabled={disabled}
      title="Programar para enviar depois"
      aria-label="Programar mensagem"
    >
      <AlarmClock size={17} />
    </button>
  );
}

export function ProgramarMensagem({
  conversationId,
  channelKind,
  lastInboundAt,
  rascunho,
  contactName,
  onClose,
  onProgramada,
}: {
  conversationId: string;
  channelKind: string;
  lastInboundAt: string | null;
  rascunho: string;
  contactName: string | null;
  onClose: () => void;
  /** Programou: o compositor limpa o campo e a faixa recarrega. */
  onProgramada: (quando: string) => void;
}) {
  const inicio = useMemo(() => agoraEmBrasilia(), []);
  const [texto, setTexto] = useState(rascunho);
  // Depois da meia-noite e antes das 7: hoje às 7. Senão, amanhã às 7.
  const [dia, setDia] = useState(inicio.hora < 7 ? inicio.dia : somarDias(inicio.dia, 1));
  const [hora, setHora] = useState("07:00");
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [modeloNome, setModeloNome] = useState("");
  const [vars, setVars] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const enviarEm = dia && hora ? new Date(`${dia}T${hora}:00${FUSO}`) : null;
  const momento = enviarEm?.getTime() ?? Date.now();
  const precisaModelo = channelKind === "whatsapp" && !livreEm(channelKind, lastInboundAt, momento);
  const foraDoPrazo =
    channelKind !== "whatsapp" && channelKind !== "sms" && !livreEm(channelKind, lastInboundAt, momento);

  // Templates aprovados, só quando a hora escolhida pede.
  useEffect(() => {
    if (!precisaModelo || modelos) return;
    fetch("/api/wa/conversations/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((b) => setModelos(((b.templates ?? []) as Modelo[]).filter(programavel)))
      .catch(() => setModelos([]));
  }, [precisaModelo, modelos]);

  const modelo = (modelos ?? []).find((m) => m.name === modeloNome) ?? null;

  // Trocou de template: {{1}} começa com o primeiro nome (o uso mais comum).
  useEffect(() => {
    if (!modelo) return setVars([]);
    const primeiro = contactName?.trim().split(/\s+/)[0] ?? "";
    setVars(Array.from({ length: modelo.variables }, (_, i) => (i === 0 ? primeiro : "")));
  }, [modelo, contactName]);

  async function salvar() {
    if (!enviarEm) return setErro("Escolha o dia e a hora.");
    const problema = erroAoProgramar({
      kind: channelKind,
      lastInboundAt,
      enviarEm,
      agora: Date.now(),
      texto,
      temModelo: Boolean(modelo),
    });
    if (problema) return setErro(problema);
    if (modelo && vars.slice(0, modelo.variables).some((v) => !v?.trim())) {
      return setErro("Preencha as variáveis do template.");
    }
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/wa/conversations/${conversationId}/programadas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto,
          enviarEm: enviarEm.toISOString(),
          modelo: precisaModelo && modelo ? { nome: modelo.name, idioma: modelo.language, params: vars } : null,
        }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) return setErro(b.error ?? "Não deu para programar.");
      onProgramada(b.quando ?? quandoTexto(enviarEm));
    } finally {
      setSalvando(false);
    }
  }

  const atalhos = (() => {
    const lista: Array<{ rotulo: string; dia: string; hora: string }> = [];
    if (inicio.hora < 7) lista.push({ rotulo: "Hoje às 7h", dia: inicio.dia, hora: "07:00" });
    if (inicio.hora < 13) lista.push({ rotulo: "Hoje às 14h", dia: inicio.dia, hora: "14:00" });
    lista.push({ rotulo: "Amanhã às 7h", dia: somarDias(inicio.dia, 1), hora: "07:00" });
    lista.push({ rotulo: "Amanhã às 9h", dia: somarDias(inicio.dia, 1), hora: "09:00" });
    lista.push({ rotulo: "Em 7 dias", dia: somarDias(inicio.dia, 7), hora: "09:00" });
    return lista;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <AlarmClock size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Programar mensagem</p>
            <p className="truncate text-xs text-muted">Sai sozinha no dia e na hora escolhidos, em seu nome.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted hover:bg-canvas" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <label className="label">Mensagem</label>
            <textarea
              className="input min-h-[6rem] resize-y text-sm"
              value={texto}
              maxLength={4096}
              autoFocus
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {atalhos.map((a) => (
              <button
                key={a.rotulo}
                type="button"
                onClick={() => {
                  setDia(a.dia);
                  setHora(a.hora);
                }}
                className={clsx(
                  "rounded-full px-3 py-1 text-[11px] font-semibold",
                  dia === a.dia && hora === a.hora ? "pill-active" : "border border-line bg-paper text-ink-700 hover:bg-canvas",
                )}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Dia</label>
              <input type="date" className="input py-2 text-sm" value={dia} min={inicio.dia} onChange={(e) => setDia(e.target.value)} />
            </div>
            <div>
              <label className="label">Hora (Brasília)</label>
              <input type="time" className="input py-2 text-sm" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>

          {foraDoPrazo && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Nessa hora a janela da conversa já terá fechado e a mensagem não sairia. Escolha um horário antes, ou
              espere o cliente escrever de novo.
            </p>
          )}
          {precisaModelo && (
            <div className="space-y-3 rounded-2xl border border-line bg-canvas p-3">
              <p className="text-xs leading-relaxed text-ink-700">
                Nessa hora já terão passado 24 horas da última mensagem do cliente, e o WhatsApp só deixa sair template
                aprovado. Escolha o template que vai no lugar. Se o cliente escrever antes, sai o seu texto.
              </p>
              {modelos === null ? (
                <p className="flex items-center gap-2 text-xs text-muted">
                  <Loader2 size={13} className="animate-spin" /> Carregando os templates…
                </p>
              ) : modelos.length === 0 ? (
                <p className="text-xs text-muted">
                  Nenhum template aprovado sem arquivo no cabeçalho e sem link no botão. Sem ele, a mensagem não sairia.
                </p>
              ) : (
                <>
                  <div>
                    <label className="label">Template</label>
                    <select className="input py-2 text-sm" value={modeloNome} onChange={(e) => setModeloNome(e.target.value)}>
                      <option value="">Escolha…</option>
                      {modelos.map((m) => (
                        <option key={`${m.name}-${m.language}`} value={m.name}>
                          {m.name} ({m.language})
                        </option>
                      ))}
                    </select>
                  </div>
                  {modelo &&
                    Array.from({ length: modelo.variables }, (_, i) => (
                      <div key={i}>
                        <label className="label">Variável {`{{${i + 1}}}`}</label>
                        <input
                          className="input py-2 text-sm"
                          value={vars[i] ?? ""}
                          onChange={(e) =>
                            setVars((v) => {
                              const nova = [...v];
                              nova[i] = e.target.value;
                              return nova;
                            })
                          }
                        />
                      </div>
                    ))}
                  {modelo && (
                    <p className="whitespace-pre-wrap rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink-700">
                      {render(modelo.body, vars)}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {erro && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button className="btn-primary px-4 py-1.5 text-xs" onClick={salvar} disabled={salvando || foraDoPrazo}>
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <AlarmClock size={14} />} Programar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Faixa acima do campo: o que vai sair e o que não saiu. */
export function FaixaProgramadas({
  conversationId,
  versao,
  onError,
}: {
  conversationId: string;
  /** Muda quando alguém programa: a faixa recarrega. */
  versao: number;
  onError: (msg: string | null) => void;
}) {
  const [itens, setItens] = useState<Programada[]>([]);
  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/wa/conversations/${conversationId}/programadas`);
      const b = r.ok ? await r.json() : { programadas: [] };
      setItens(b.programadas ?? []);
    } catch {
      /* o próximo ciclo resolve */
    }
  }, [conversationId]);

  useEffect(() => {
    setItens([]);
    void carregar();
    // Programada vira enviada sozinha: a faixa confere de vez em quando.
    const t = setInterval(carregar, 30_000);
    return () => clearInterval(t);
  }, [carregar, versao]);

  if (itens.length === 0) return null;
  return (
    <div className="mb-2 space-y-1">
      {itens.map((p) => {
        const falhou = p.situacao === "falhou";
        return (
          <div
            key={p.id}
            className={clsx(
              "flex items-start gap-2 rounded-xl px-3 py-1.5 text-[11px] leading-snug",
              falhou ? "bg-red-50 text-red-700" : "bg-canvas text-ink-700",
            )}
          >
            <AlarmClock size={13} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {falhou ? "Não saiu" : p.situacao === "enviando" ? "Saindo agora" : "Programada"} · {quandoTexto(p.enviarEm)}
                {p.modelo && !falhou ? ` · se a janela fechar, vai o template ${p.modelo.nome}` : ""}
              </p>
              <p className="truncate">{p.texto}</p>
              {falhou && p.erro && <p className="mt-0.5">{p.erro}</p>}
            </div>
            {p.situacao !== "enviando" && (
              <button
                type="button"
                onClick={async () => {
                  if (!falhou && !confirm("Cancelar esta mensagem programada?")) return;
                  const r = await fetch(`/api/wa/conversations/${conversationId}/programadas?p=${encodeURIComponent(p.id)}`, {
                    method: "DELETE",
                  });
                  if (!r.ok) {
                    const b = await r.json().catch(() => ({}));
                    onError(b.error ?? "Não deu para cancelar.");
                  }
                  void carregar();
                }}
                className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-0.5 font-semibold hover:bg-black/5"
                aria-label={falhou ? "Dispensar aviso" : "Cancelar mensagem programada"}
              >
                <X size={12} /> {falhou ? "Ok" : "Cancelar"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
