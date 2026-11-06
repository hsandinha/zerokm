"use client";

// Configuração da operação da equipe (gestor), dentro da tela de
// Configuração da loja: horário de atendimento com a mensagem automática fora
// dele, distribuição automática e meta de primeira resposta (SLA). Salva
// sozinha em /api/wa/loja/operacao, sem regravar a IA nem a equipe.

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Clock, Plus, Save, Shuffle, Trash2 } from "lucide-react";
import {
  DIAS_DA_SEMANA,
  MAX_FAIXAS_POR_DIA,
  estadoDoHorario,
  normalizarHorario,
  resumoDoHorario,
  textoForaDoHorario,
  validarHorario,
  type HorarioLoja,
} from "@wa/lib/horario";
import { DISTRIBUICAO_ROTULO, type ModoDistribuicao } from "@wa/lib/equipe";

type Operacao = {
  horario: HorarioLoja;
  distribuicao: ModoDistribuicao;
  slaMinutos: number;
  defaults: { mensagem: string; intervaloHoras: number; slaMinutos: number; slaMin: number; slaMax: number };
};

// Segunda primeiro: é como se lê a semana de uma loja.
const ORDEM = [1, 2, 3, 4, 5, 6, 0];

export function OperacaoDaLoja() {
  const [op, setOp] = useState<Operacao | null>(null);
  const [slaTxt, setSlaTxt] = useState("");
  const [novaData, setNovaData] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(() => {
    fetch("/api/wa/loja/operacao")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Operacao) => {
        setOp(d);
        setSlaTxt(String(d.slaMinutos));
      })
      .catch(() => setAviso("Falha ao carregar o horário e a distribuição."));
  }, []);
  useEffect(carregar, [carregar]);

  if (!op) {
    return aviso ? <p className="card text-sm text-red-600">{aviso}</p> : null;
  }

  const h = op.horario;
  const setH = (patch: Partial<HorarioLoja>) => setOp((o) => (o ? { ...o, horario: { ...o.horario, ...patch } } : o));
  const setFaixas = (dia: number, faixas: HorarioLoja["dias"][number]["faixas"]) =>
    setH({ dias: h.dias.map((d) => (d.dia === dia ? { ...d, faixas } : d)) });
  const erroHorario = validarHorario(h);
  // Prévia com o que está na tela (antes de salvar).
  const normal = normalizarHorario(h);
  const agora = estadoDoHorario({ ...normal, ativo: true });

  async function salvar() {
    if (!op) return;
    if (erroHorario) {
      setAviso(erroHorario);
      return;
    }
    setSalvando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/wa/loja/operacao", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horario: op.horario, distribuicao: op.distribuicao, slaMinutos: Number(slaTxt) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Falha ao salvar");
      setOp(body as Operacao);
      setSlaTxt(String(body.slaMinutos));
      setAviso("Horário e distribuição salvos.");
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  function adicionarData() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData) || h.feriados.some((f) => f.data === novaData)) return;
    const feriados = [...h.feriados, { data: novaData, ...(novoNome.trim() ? { nome: novoNome.trim() } : {}) }].sort(
      (a, b) => a.data.localeCompare(b.data),
    );
    setH({ feriados });
    setNovaData("");
    setNovoNome("");
  }

  return (
    <>
      {/* Horário de atendimento */}
      <section className="card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Clock size={18} className="text-brand-700" /> Horário de atendimento
          </h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={h.ativo} onChange={(e) => setH({ ativo: e.target.checked })} />
            Usar horário
          </label>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          O horário vale para a equipe, no fuso de Brasília. A IA continua respondendo a qualquer hora, mas fora do
          horário ela avisa quando a equipe volta. Sem IA, o cliente recebe a mensagem automática abaixo, e a
          conversa fica na fila para o próximo expediente (o SLA começa a contar quando a loja abre).
        </p>

        <div className={clsx("space-y-2", !h.ativo && "opacity-60")}>
          {ORDEM.map((i) => {
            const d = h.dias[i];
            const aberto = d.faixas.length > 0;
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm">
                <label className="flex w-36 cursor-pointer items-center gap-2 font-semibold text-ink-900">
                  <input
                    type="checkbox"
                    checked={aberto}
                    onChange={(e) => setFaixas(i, e.target.checked ? [{ abre: "08:00", fecha: "18:00" }] : [])}
                  />
                  {DIAS_DA_SEMANA[i]}
                </label>
                {!aberto && <span className="text-xs text-muted">Fechado</span>}
                {d.faixas.map((f, fi) => (
                  <span key={fi} className="flex items-center gap-1">
                    <input
                      type="time"
                      className="input w-auto py-1 text-sm"
                      aria-label={`${DIAS_DA_SEMANA[i]}: abre`}
                      value={f.abre}
                      onChange={(e) =>
                        setFaixas(i, d.faixas.map((x, xi) => (xi === fi ? { ...x, abre: e.target.value } : x)))
                      }
                    />
                    <span className="text-muted">às</span>
                    <input
                      type="time"
                      className="input w-auto py-1 text-sm"
                      aria-label={`${DIAS_DA_SEMANA[i]}: fecha`}
                      value={f.fecha}
                      onChange={(e) =>
                        setFaixas(i, d.faixas.map((x, xi) => (xi === fi ? { ...x, fecha: e.target.value } : x)))
                      }
                    />
                    {d.faixas.length > 1 && (
                      <button
                        type="button"
                        className="btn-ghost px-1.5 py-1"
                        aria-label="Remover faixa"
                        onClick={() => setFaixas(i, d.faixas.filter((_, xi) => xi !== fi))}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </span>
                ))}
                {aberto && d.faixas.length < MAX_FAIXAS_POR_DIA && (
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() => {
                      const ultima = d.faixas[d.faixas.length - 1];
                      setFaixas(i, [...d.faixas, { abre: ultima?.fecha ?? "13:00", fecha: "18:00" }]);
                    }}
                  >
                    <Plus size={12} /> faixa
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className={clsx("space-y-2", !h.ativo && "opacity-60")}>
          <p className="text-sm font-semibold text-ink-900">Datas fechadas (feriados, inventário, férias)</p>
          {h.feriados.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {h.feriados.map((f) => (
                <li key={f.data} className="flex items-center gap-1 rounded-xl bg-canvas px-2.5 py-1 text-xs">
                  {f.data.split("-").reverse().join("/")}
                  {f.nome ? <span className="text-muted">· {f.nome}</span> : null}
                  <button
                    type="button"
                    className="ml-1 text-muted hover:text-red-600"
                    aria-label={`Remover ${f.data}`}
                    onClick={() => setH({ feriados: h.feriados.filter((x) => x.data !== f.data) })}
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              className="input w-auto"
              aria-label="Data fechada"
              value={novaData}
              onChange={(e) => setNovaData(e.target.value)}
            />
            <input
              className="input flex-1"
              placeholder="Nome (opcional), ex.: Natal"
              maxLength={60}
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
            />
            <button type="button" className="btn-dark px-3 text-sm" onClick={adicionarData} disabled={!novaData}>
              Adicionar data
            </button>
          </div>
        </div>

        <label className={clsx("block text-sm", !h.ativo && "opacity-60")}>
          <span className="mb-1 block text-muted">
            Mensagem automática fora do horário (em branco = a padrão). Marcadores: {"{{horario}}"} e {"{{volta}}"}
          </span>
          <textarea
            className="input min-h-[80px]"
            placeholder={op.defaults.mensagem}
            maxLength={1000}
            value={h.mensagem}
            onChange={(e) => setH({ mensagem: e.target.value })}
          />
        </label>
        <label className={clsx("flex flex-wrap items-center gap-2 text-sm", !h.ativo && "opacity-60")}>
          <span className="text-muted">Mandar no máximo uma vez a cada</span>
          <input
            type="number"
            min={1}
            max={168}
            className="input w-20 py-1"
            value={h.intervaloHoras}
            onChange={(e) => setH({ intervaloHoras: Number(e.target.value) })}
          />
          <span className="text-muted">horas por conversa</span>
        </label>

        <div className="rounded-xl border border-line px-3 py-2 text-xs leading-relaxed text-muted">
          <p>
            <span className="font-semibold text-ink-900">Semana:</span> {resumoDoHorario(normal)}
          </p>
          <p>
            <span className="font-semibold text-ink-900">Agora:</span>{" "}
            {agora.aberto ? "dentro do horário" : agora.quandoVolta ? `fora do horário, volta ${agora.quandoVolta}` : "fechado"}
            {!h.ativo && " (o horário está desligado: hoje a loja atende sempre)"}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-ink-900">O cliente recebe:</span>{" "}
            {textoForaDoHorario({ ...normal, ativo: true })}
          </p>
        </div>
        {erroHorario && <p className="text-sm text-red-600">{erroHorario}</p>}
      </section>

      {/* Distribuição e SLA */}
      <section className="card space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Shuffle size={18} className="text-brand-700" /> Distribuição e tempo de resposta
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Distribuição automática</span>
            <select
              className="input"
              value={op.distribuicao}
              onChange={(e) => setOp({ ...op, distribuicao: e.target.value as ModoDistribuicao })}
            >
              {(Object.keys(DISTRIBUICAO_ROTULO) as ModoDistribuicao[]).map((m) => (
                <option key={m} value={m}>
                  {DISTRIBUICAO_ROTULO[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Meta de primeira resposta (minutos)</span>
            <input
              type="number"
              className="input"
              min={op.defaults.slaMin}
              max={op.defaults.slaMax}
              value={slaTxt}
              onChange={(e) => setSlaTxt(e.target.value)}
            />
          </label>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          {op.distribuicao === "rodizio"
            ? "Cada conversa que chega na fila da equipe (transferida pela IA, de cliente sem IA ou da noite, quando a loja abre) vai para a próxima pessoa Online, em rodízio. Ela cai em Minhas conversas dessa pessoa e o tempo de resposta conta para ela. Quem está em Pausa, Ausente ou com o painel fechado não recebe."
            : "A equipe pega as conversas da fila na Central. O status de cada pessoa aparece para todos e nos Resultados."}{" "}
          Conversa esperando mais que a meta aparece como SLA violado na Central (padrão {op.defaults.slaMinutos} min).
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={salvar} disabled={salvando}>
          <Save size={16} /> {salvando ? "Salvando…" : "Salvar horário e distribuição"}
        </button>
        {aviso && <p className="text-sm text-ink-800">{aviso}</p>}
      </div>
    </>
  );
}
