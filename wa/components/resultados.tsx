"use client";

// Resultados do atendimento da loja. A ordem é a das perguntas de quem abre a
// tela: "alguém está esperando agora?", "quanto entrou e quanto virou venda?",
// "quanto demoramos para responder?", "o que saiu no mês?" e, para o gestor,
// "quem está atendendo o quê, e como cada um foi no período?".
//
// Números são stat tiles e tabelas (sem gráfico): cada um responde a uma
// pergunta, e o detalhe por canal e por pessoa fica em tabela, que lê melhor
// que barra para poucos valores com várias colunas.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  Bot,
  CalendarCheck,
  Clock,
  Inbox,
  Loader2,
  Megaphone,
  Moon,
  RefreshCw,
  Send,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { PERIODOS, type PeriodoId } from "@wa/lib/periodo";
import { STATUS_COR, STATUS_ROTULO, formatarDuracao, formatarSegundos } from "@wa/lib/equipe";
import { formatNumber, percent } from "@wa/lib/stages";
import { useWaPanel } from "@wa/components/wa-panel";
import type { DesempenhoDaEquipe, ResultadosDaLoja } from "@wa/lib/resultados";

type Resposta = { gestor: boolean; resultados: ResultadosDaLoja; desempenho: DesempenhoDaEquipe | null };

const ATUALIZA_MS = 120_000;

function Tile({
  label,
  value,
  hint,
  icon: Icon,
  alerta,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Inbox;
  alerta?: boolean;
  href?: string;
}) {
  const corpo = (
    <div className={clsx("card h-full transition", href && "hover:border-ink-300", alerta && "border-amber-300 bg-amber-50")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <Icon size={16} className={alerta ? "text-amber-700" : "text-muted"} aria-hidden />
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-xs leading-snug text-muted">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}

function Secao({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function Resultados() {
  const { base } = useWaPanel();
  const [periodo, setPeriodo] = useState<PeriodoId>("7d");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    if (periodo === "datas" && !de) return;
    const q = new URLSearchParams({ periodo });
    if (periodo === "datas") {
      q.set("de", de);
      if (ate) q.set("ate", ate);
    }
    setCarregando(true);
    fetch(`/api/wa/resultados?${q}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Falha ao carregar");
        setDados(body as Resposta);
        setErro(null);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar"))
      .finally(() => setCarregando(false));
  }, [periodo, de, ate]);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, ATUALIZA_MS);
    return () => clearInterval(t);
  }, [carregar]);

  const r = dados?.resultados;
  const central = `${base}/central`;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="brand-kicker">Atendimento</p>
          <h1 className="text-2xl font-bold text-ink-900">Resultados</h1>
          {r && <p className="text-sm text-muted">{r.periodo.rotulo}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Período" className="flex flex-wrap gap-1">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={periodo === p.id}
                onClick={() => setPeriodo(p.id)}
                className={clsx(
                  "rounded-2xl px-3 py-1.5 text-sm font-semibold transition",
                  periodo === p.id ? "pill-active" : "text-ink-700 hover:bg-canvas",
                )}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
          {periodo === "datas" && (
            <span className="flex items-center gap-1 text-sm">
              <input type="date" className="input w-auto py-1" aria-label="De" value={de} onChange={(e) => setDe(e.target.value)} />
              <span className="text-muted">a</span>
              <input type="date" className="input w-auto py-1" aria-label="Até" value={ate} onChange={(e) => setAte(e.target.value)} />
            </span>
          )}
          <button type="button" className="btn-ghost px-2 py-1.5" onClick={carregar} aria-label="Atualizar" title="Atualizar">
            {carregando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </div>
      </header>

      {erro && <p className="card text-sm text-red-600">{erro}</p>}
      {!r ? (
        !erro && <p className="text-sm text-muted">Carregando…</p>
      ) : (
        <>
          <Secao titulo="Agora">
            {r.agora.horario.ativo && !r.agora.horario.aberto && (
              <p className="flex items-center gap-2 rounded-2xl bg-canvas px-4 py-2 text-sm text-ink-800">
                <Moon size={15} className="text-muted" aria-hidden />
                Fora do horário{r.agora.horario.quandoVolta ? `: a equipe volta ${r.agora.horario.quandoVolta}` : ""}.
                {r.agora.aguardandoAbertura > 0 &&
                  ` ${r.agora.aguardandoAbertura} ${r.agora.aguardandoAbertura === 1 ? "conversa espera" : "conversas esperam"} a abertura.`}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile
                label="Na fila da equipe"
                value={formatNumber(r.agora.fila)}
                hint={r.agora.semResponsavel ? `${formatNumber(r.agora.semResponsavel)} sem responsável` : "Todas com responsável"}
                icon={Inbox}
                href={`${central}`}
              />
              <Tile
                label="SLA violado"
                value={formatNumber(r.agora.slaViolado)}
                hint={`Esperando mais de ${r.agora.slaMinutos} min pela primeira resposta`}
                icon={AlertTriangle}
                alerta={r.agora.slaViolado > 0}
                href={`${central}`}
              />
              <Tile label="Em atendimento" value={formatNumber(r.agora.comEquipe)} hint="Com alguém da equipe" icon={Users} />
              <Tile label="Com a IA" value={formatNumber(r.agora.comIa)} hint="A IA está conversando" icon={Bot} />
            </div>
          </Secao>

          <Secao titulo="Conversas">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label="Hoje" value={formatNumber(r.conversas.hoje)} hint="Clientes que escreveram hoje" icon={Inbox} />
              <Tile label="Últimos 7 dias" value={formatNumber(r.conversas.semana)} icon={Inbox} />
              <Tile label="Este mês" value={formatNumber(r.conversas.mes)} icon={Inbox} />
              <Tile label="No período" value={formatNumber(r.conversas.periodo)} hint={r.periodo.rotulo} icon={Inbox} />
            </div>
          </Secao>

          <Secao titulo={`No período: ${r.periodo.rotulo}`}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label="Leads novos" value={formatNumber(r.leadsNovos)} hint="Contatos novos que escreveram" icon={UserPlus} />
              <Tile
                label="Visitas pedidas"
                value={formatNumber(r.visitasPedidas)}
                hint="Visita ou test drive pedido pela IA"
                icon={CalendarCheck}
              />
              <Tile
                label="Vendas"
                value={formatNumber(r.vendas)}
                hint={r.leadsNovos ? `${percent(r.vendas, r.leadsNovos)} dos leads novos` : "Conversas na etapa de venda"}
                icon={Trophy}
              />
              <Tile
                label="Passadas para a equipe"
                value={formatNumber(r.transferencias)}
                hint="Transferências da IA"
                icon={Users}
              />
            </div>
          </Secao>

          <Secao titulo="Tempo de primeira resposta">
            <div className="grid gap-3 sm:grid-cols-2">
              <Tile
                label="IA"
                value={formatarSegundos(r.resposta.ia.mediana)}
                hint={
                  r.resposta.ia.n
                    ? `Mediana de ${formatNumber(r.resposta.ia.n)} conversas. Média ${formatarSegundos(r.resposta.ia.media)}.`
                    : "Sem respostas da IA no período"
                }
                icon={Bot}
              />
              <Tile
                label="Equipe"
                value={formatarSegundos(r.resposta.equipe.mediana)}
                hint={
                  r.resposta.equipe.n
                    ? `Mediana de ${formatNumber(r.resposta.equipe.n)} atendimentos. Média ${formatarSegundos(r.resposta.equipe.media)}.${r.resposta.equipe.semResposta ? ` ${formatNumber(r.resposta.equipe.semResposta)} ainda sem resposta.` : ""}`
                    : "Conta desde a entrada na fila (ou a abertura da loja) até a primeira mensagem da equipe"
                }
                icon={Clock}
                alerta={r.resposta.equipe.media != null && r.resposta.equipe.media > r.agora.slaMinutos * 60}
              />
            </div>
          </Secao>

          <Secao titulo="Este mês">
            <div className="grid gap-3 sm:grid-cols-2">
              <Tile
                label="Mensagens enviadas"
                value={formatNumber(r.mensagensMes.total)}
                hint={`IA ${formatNumber(r.mensagensMes.ia)}, equipe ${formatNumber(r.mensagensMes.equipe)}, campanhas ${formatNumber(r.mensagensMes.campanhas)}, automáticas ${formatNumber(r.mensagensMes.automaticas)}`}
                icon={Send}
              />
              <Tile
                label="Campanhas"
                value={formatNumber(r.campanhasMes.total)}
                hint={
                  r.campanhasMes.enviadas
                    ? `${formatNumber(r.campanhasMes.enviadas)} enviadas, ${percent(r.campanhasMes.lidas, r.campanhasMes.enviadas)} lidas, ${percent(r.campanhasMes.respondidas, r.campanhasMes.enviadas)} responderam`
                    : "Nenhum disparo no mês"
                }
                icon={Megaphone}
              />
            </div>
          </Secao>

          <Secao titulo="Por canal">
            {r.porCanal.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma conversa no período.</p>
            ) : (
              <div className="card overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th className="px-4 py-2 font-semibold">Canal</th>
                      <th className="px-4 py-2 text-right font-semibold">Conversas</th>
                      <th className="px-4 py-2 text-right font-semibold">Leads novos</th>
                      <th className="px-4 py-2 text-right font-semibold">Vendas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.porCanal.map((c) => (
                      <tr key={c.canal} className="border-b border-line last:border-0">
                        <td className="px-4 py-2 font-semibold text-ink-900">{c.rotulo}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatNumber(c.conversas)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatNumber(c.leads)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatNumber(c.vendas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>

          {dados?.desempenho && <Desempenho d={dados.desempenho} central={central} rotulo={r.periodo.rotulo} sla={r.agora.slaMinutos} />}
        </>
      )}
    </div>
  );
}

function Desempenho({
  d,
  central,
  rotulo,
  sla,
}: {
  d: DesempenhoDaEquipe;
  central: string;
  rotulo: string;
  sla: number;
}) {
  const agora = Date.now();
  return (
    <>
      <Secao titulo="Equipe agora">
        <div className="grid gap-3 md:grid-cols-2">
          {d.pessoas.map((p) => {
            const cor = STATUS_COR[p.status];
            return (
              <div key={p.email} className="card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">{p.nome ?? p.email}</p>
                    {p.nome && <p className="truncate text-xs text-muted">{p.email}</p>}
                  </div>
                  <span className={clsx("flex shrink-0 items-center gap-1.5 text-xs font-semibold", cor.texto)}>
                    <span className={clsx("h-2 w-2 rounded-full", cor.dot)} aria-hidden />
                    {STATUS_ROTULO[p.status]}
                    {p.pausaMotivo ? ` · ${p.pausaMotivo}` : ""}
                    {p.status !== "ausente" && p.statusDesde
                      ? ` há ${formatarDuracao(agora - new Date(p.statusDesde).getTime())}`
                      : ""}
                  </span>
                </div>
                {p.agora.length === 0 ? (
                  <p className="text-xs text-muted">Nenhuma conversa com esta pessoa agora.</p>
                ) : (
                  <ul className="space-y-1">
                    {p.agora.map((c) => {
                      const ms = c.desde ? agora - new Date(c.desde).getTime() : 0;
                      const atrasada = c.espera && ms > sla * 60_000;
                      return (
                        <li key={c.conversationId}>
                          <Link
                            href={`${central}?c=${c.conversationId}`}
                            className="flex items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-1.5 text-sm hover:bg-ink-100"
                          >
                            <span className="truncate">{c.cliente}</span>
                            <span
                              className={clsx(
                                "flex shrink-0 items-center gap-1 text-xs",
                                atrasada ? "font-semibold text-red-600" : "text-muted",
                              )}
                            >
                              {atrasada && <AlertTriangle size={12} aria-hidden />}
                              {c.espera ? "esperando resposta" : "em atendimento"}
                              {c.desde ? ` há ${formatarDuracao(ms)}` : ""}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Secao>

      <Secao titulo={`Desempenho por atendente: ${rotulo}`}>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-2 font-semibold">Pessoa</th>
                <th className="px-4 py-2 text-right font-semibold">Assumidas</th>
                <th className="px-4 py-2 text-right font-semibold">1ª resposta (média)</th>
                <th className="px-4 py-2 text-right font-semibold">Resolvidas</th>
                <th className="px-4 py-2 text-right font-semibold">Vendas</th>
                {d.comAutor && <th className="px-4 py-2 text-right font-semibold">Mensagens</th>}
              </tr>
            </thead>
            <tbody>
              {d.pessoas.map((p) => (
                <tr key={p.email} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">
                    <span className="font-semibold text-ink-900">{p.nome ?? p.email}</span>
                    {p.papel === "gestor" && <span className="ml-1 text-xs text-muted">gestor</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNumber(p.assumidas)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {p.respostaN ? (
                      <span title={`${p.respostaN} atendimentos`}>{formatarSegundos(p.respostaMedia)}</span>
                    ) : (
                      <span className="text-muted">sem dados</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNumber(p.resolvidas)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNumber(p.vendas)}</td>
                  {d.comAutor && <td className="px-4 py-2 text-right tabular-nums">{formatNumber(p.mensagens ?? 0)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Assumidas: conversas que a pessoa pegou, recebeu por transferência ou pelo rodízio. A primeira resposta conta
          desde a entrada na fila (ou a abertura da loja). Resolvidas: encerradas por ela. Vendas: conversas na etapa de
          venda com a pessoa como responsável. Os números contam a partir desta versão do atendimento.
        </p>
      </Secao>
    </>
  );
}
