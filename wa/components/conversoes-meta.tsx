"use client";

// "Eventos para a Meta" na Configuração (da loja e do CNV): a API de
// Conversões para mensagens. Quando um cartão que veio de anúncio entra numa
// coluna com evento (Vendido = Purchase), a venda volta para o anúncio e a
// campanha passa a otimizar por quem compra. O evento de cada coluna fica no
// modal da coluna, no Funil.
//
// O cartão mostra a situação e os últimos eventos; o formulário abre em
// modal, no padrão dos outros do atendimento. O token nunca volta do
// servidor: a tela só sabe que há um salvo.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  MinusCircle,
  Plug,
  RefreshCw,
  Send,
  Settings2,
  X,
  XCircle,
} from "lucide-react";
import { usePodeUsar, useWaPanel } from "@wa/components/wa-panel";
import { dateTime, money } from "@wa/lib/stages";
import { SITUACAO_ROTULO, type CanalMeta, type EventoMeta, type SituacaoEventoMeta } from "@wa/lib/conversoes-meta";

type Config = {
  ativo: boolean;
  datasetId: string;
  temToken: boolean;
  testEventCode: string;
  valorPadrao: number | null;
  ultimoTeste: { em: string; ok: boolean; mensagem: string } | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
};

type Linha = {
  id: string;
  conversationId: string;
  contato: string;
  evento: EventoMeta;
  canal: CanalMeta | null;
  colunaNome: string | null;
  valor: number | null;
  status: SituacaoEventoMeta;
  motivo: string | null;
  ultimoErro: string | null;
  tentativas: number;
  quando: string;
  enviadoEm: string | null;
};

type Teste = {
  ok: boolean;
  mensagem: string;
  dataset?: { id: string; name: string | null };
  teste?: { enviado: boolean; mensagem: string };
};

const CANAL: Record<CanalMeta, string> = { whatsapp: "WhatsApp", messenger: "Messenger", instagram: "Instagram" };

const SITUACAO_ESTILO: Record<SituacaoEventoMeta, { cls: string; icon: typeof CheckCircle2 }> = {
  enviado: { cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  pendente: { cls: "bg-amber-100 text-amber-700", icon: Clock },
  enviando: { cls: "bg-sky-100 text-sky-700", icon: Loader2 },
  falhou: { cls: "bg-red-100 text-red-600", icon: XCircle },
  ignorado: { cls: "bg-ink-100 text-muted", icon: MinusCircle },
};

export function EventosParaMeta() {
  const podeUsar = usePodeUsar();
  const { base } = useWaPanel();
  const [config, setConfig] = useState<Config | null>(null);
  const [eventos, setEventos] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    fetch("/api/wa/conversoes-meta")
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? "Falha ao carregar os eventos para a Meta.");
        setConfig(body.config);
        setEventos(body.eventos ?? []);
        setErro(null);
      })
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);
  const funil = podeUsar("funil");
  useEffect(() => {
    if (funil) carregar();
  }, [funil, carregar]);

  // As colunas do funil são onde o evento é escolhido: sem funil, não há o que mandar.
  if (!funil) return null;

  const status = !config
    ? null
    : config.ativo
      ? { rotulo: "Ligado", cls: "bg-emerald-100 text-emerald-700" }
      : config.datasetId || config.temToken
        ? { rotulo: "Desligado", cls: "bg-ink-100 text-muted" }
        : { rotulo: "Não configurado", cls: "bg-amber-100 text-amber-700" };

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Send size={18} className="text-brand-700" /> Eventos para a Meta
            {status && (
              <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", status.cls)}>{status.rotulo}</span>
            )}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            Quando uma conversa que veio de anúncio entra numa coluna com evento (Vendido manda a venda), o evento
            volta para o anúncio pela API de Conversões. A Meta passa a entregar o anúncio para quem tem cara de
            comprador, não só para quem chama. O evento de cada coluna fica no{" "}
            <Link href={`${base}/pipeline`} className="font-semibold text-brand-700 hover:underline">
              Funil
            </Link>
            , em Editar coluna.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={carregar}
            disabled={carregando}
            title="Atualizar a lista"
            aria-label="Atualizar a lista"
          >
            <RefreshCw size={13} className={clsx(carregando && "animate-spin")} />
          </button>
          <button className="btn-dark px-3 py-1.5 text-xs" onClick={() => setAberto(true)} disabled={!config}>
            <Settings2 size={14} /> {config?.datasetId ? "Configurar" : "Conectar"}
          </button>
        </div>
      </div>

      {erro && <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 text-xs text-red-600">{erro}</p>}

      {config && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Resumo rotulo="Conjunto de dados" valor={config.datasetId || "não informado"} vazio={!config.datasetId} />
          <Resumo rotulo="Token de acesso" valor={config.temToken ? "salvo" : "não informado"} vazio={!config.temToken} />
          <Resumo
            rotulo="Valor padrão da venda"
            valor={config.valorPadrao != null ? money(config.valorPadrao) : "preço do carro da conversa"}
            vazio={config.valorPadrao == null}
          />
        </div>
      )}

      {config?.ultimoTeste && (
        <p
          className={clsx(
            "flex items-start gap-2 rounded-xl px-3 py-2 text-xs",
            config.ultimoTeste.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700",
          )}
        >
          {config.ultimoTeste.ok ? <CheckCircle2 size={14} className="mt-px shrink-0" /> : <AlertTriangle size={14} className="mt-px shrink-0" />}
          <span>
            Último teste em {dateTime(config.ultimoTeste.em)}: {config.ultimoTeste.mensagem}
          </span>
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-line">
        {eventos.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted">
            {config?.ativo
              ? "Nenhum evento ainda. O primeiro sai quando uma conversa que veio de anúncio entrar numa coluna com evento."
              : "Nenhum evento ainda. Conecte o conjunto de dados para começar."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-semibold">Conversa</th>
                  <th className="px-3 py-2 font-semibold">Evento</th>
                  <th className="px-3 py-2 font-semibold">Canal</th>
                  <th className="px-3 py-2 text-right font-semibold">Valor</th>
                  <th className="px-3 py-2 font-semibold">Situação</th>
                  <th className="px-3 py-2 text-right font-semibold">Quando</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {eventos.map((e) => (
                  <tr key={e.id}>
                    <td className="max-w-[14rem] px-3 py-2">
                      <Link
                        href={`${base}/central?c=${e.conversationId}`}
                        className="block truncate font-semibold text-ink-900 hover:text-brand-700 hover:underline"
                      >
                        {e.contato}
                      </Link>
                      {e.colunaNome && <span className="block truncate text-[11px] text-muted">entrou em {e.colunaNome}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold text-ink-800">{e.evento}</td>
                    <td className="px-3 py-2 text-xs text-muted">{e.canal ? CANAL[e.canal] : "sem anúncio"}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{e.valor != null ? money(e.valor) : ""}</td>
                    <td className="px-3 py-2">
                      <Situacao linha={e} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-muted">
                      {dateTime(e.enviadoEm ?? e.quando)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {aberto && config && (
        <ConfigModal
          config={config}
          onClose={() => setAberto(false)}
          onSalvo={(c) => {
            setConfig(c);
            setAberto(false);
            carregar();
          }}
          onTestado={carregar}
        />
      )}
    </section>
  );
}

function Resumo({ rotulo, valor, vazio }: { rotulo: string; valor: string; vazio?: boolean }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{rotulo}</p>
      <p className={clsx("mt-0.5 truncate text-sm font-semibold", vazio ? "text-muted" : "text-ink-900")}>{valor}</p>
    </div>
  );
}

function Situacao({ linha }: { linha: Linha }) {
  const estilo = SITUACAO_ESTILO[linha.status];
  const Icone = estilo.icon;
  const rotulo = linha.status === "pendente" && linha.tentativas > 0 ? "Tentando de novo" : SITUACAO_ROTULO[linha.status];
  const detalhe = linha.status === "enviado" ? null : linha.motivo ?? linha.ultimoErro;
  return (
    <span className="block">
      <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", estilo.cls)}>
        <Icone size={11} className={clsx(linha.status === "enviando" && "animate-spin")} /> {rotulo}
      </span>
      {detalhe && (
        <span className="mt-0.5 block max-w-[16rem] text-[11px] leading-snug text-muted" title={linha.ultimoErro ?? undefined}>
          {detalhe}
        </span>
      )}
    </span>
  );
}

/** Moldura do modal, no mesmo padrão dos modais do funil e do atendimento. */
function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{title}</p>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <button className="rounded-full p-1.5 text-muted hover:bg-canvas" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function ConfigModal({
  config,
  onClose,
  onSalvo,
  onTestado,
}: {
  config: Config;
  onClose: () => void;
  onSalvo: (c: Config) => void;
  onTestado: () => void;
}) {
  const [ativo, setAtivo] = useState(config.ativo || (!config.datasetId && !config.temToken));
  const [datasetId, setDatasetId] = useState(config.datasetId);
  const [token, setToken] = useState("");
  const [codigo, setCodigo] = useState(config.testEventCode);
  const [valor, setValor] = useState(config.valorPadrao != null ? String(config.valorPadrao) : "");
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [teste, setTeste] = useState<Teste | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/wa/conversoes-meta", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ativo,
          datasetId,
          ...(token.trim() ? { token: token.trim() } : {}),
          testEventCode: codigo,
          valorPadrao: valor.trim() === "" ? null : valor,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Não foi possível salvar.");
      onSalvo(body.config as Config);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    if (testando) return;
    setTestando(true);
    setTeste(null);
    setErro(null);
    try {
      const res = await fetch("/api/wa/conversoes-meta/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // O que está no formulário, mesmo antes de salvar; token em branco usa o salvo.
        body: JSON.stringify({ datasetId, ...(token.trim() ? { token: token.trim() } : {}), testEventCode: codigo }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Não foi possível testar.");
      setTeste(body as Teste);
      onTestado();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível testar.");
    } finally {
      setTestando(false);
    }
  }

  return (
    <Modal
      title="Eventos para a Meta"
      subtitle="API de Conversões para mensagens: a venda e o lead qualificado voltam para o anúncio de clique para WhatsApp, Messenger e Direct."
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={salvar}>
        <label className="flex cursor-pointer items-start gap-2 rounded-2xl border border-line px-3 py-2.5 text-sm">
          <input type="checkbox" className="mt-0.5" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          <span>
            <span className="font-semibold text-ink-900">Mandar eventos para a Meta</span>
            <span className="block text-xs text-muted">
              Desligado, nada sai: o cartão que entra numa coluna com evento fica na lista como não enviado.
            </span>
          </span>
        </label>

        <div className="rounded-2xl bg-canvas px-4 py-3 text-xs leading-relaxed text-ink-800">
          <p className="flex items-center gap-1.5 font-semibold text-ink-900">
            <KeyRound size={13} /> Onde pegar o ID e o token
          </p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-muted">
            <li>
              No Gerenciador de Eventos da Meta, abra o conjunto de dados ligado ao WhatsApp, à Página ou ao Instagram
              que recebe os anúncios (sem um, crie em Conectar fontes de dados).
            </li>
            <li>O ID do conjunto de dados é o número que aparece abaixo do nome dele.</li>
            <li>
              Em Configurações, na parte da API de Conversões, clique em Gerar token de acesso e cole o token aqui.
            </li>
            <li>
              Para testar, copie o código da aba Testar eventos e use o botão Testar conexão: o evento aparece lá e
              não conta para o anúncio.
            </li>
          </ol>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-ink-800">
            ID do conjunto de dados
            <input
              className="input mt-1 w-full font-mono"
              inputMode="numeric"
              placeholder="Ex.: 1234567890123456"
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value.replace(/[^\d]/g, ""))}
            />
          </label>
          <label className="block text-xs font-semibold text-ink-800">
            Valor padrão da venda (R$)
            <input
              className="input mt-1 w-full"
              inputMode="decimal"
              placeholder="Opcional"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </label>
        </div>
        <p className="-mt-2 text-[11px] leading-snug text-muted">
          A venda vai com o preço do carro ligado à conversa (o último enviado pela Central ou pela IA, ou o da visita
          agendada). Sem carro, vai o valor padrão; sem ele, R$ 0.
        </p>

        <label className="block text-xs font-semibold text-ink-800">
          Token de acesso
          <input
            className="input mt-1 w-full font-mono"
            type="password"
            autoComplete="off"
            placeholder={config.temToken ? "Salvo. Deixe em branco para manter" : "Cole o token gerado no Gerenciador de Eventos"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>

        <label className="block text-xs font-semibold text-ink-800">
          Código de teste (opcional)
          <input
            className="input mt-1 w-full font-mono"
            placeholder="Ex.: TEST12345"
            value={codigo}
            maxLength={40}
            onChange={(e) => setCodigo(e.target.value.trim())}
          />
          <span className="mt-1 block font-normal text-muted">Só vai no evento do botão Testar conexão, nunca nos de verdade.</span>
        </label>

        {teste && (
          <div
            className={clsx(
              "space-y-1 rounded-2xl px-4 py-3 text-xs",
              teste.ok && teste.teste?.enviado !== false ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700",
            )}
          >
            <p className="flex items-start gap-1.5 font-semibold">
              {teste.ok ? <CheckCircle2 size={14} className="mt-px shrink-0" /> : <XCircle size={14} className="mt-px shrink-0" />}
              {teste.mensagem}
            </p>
            {teste.teste && (
              <p className={clsx("pl-5", teste.teste.enviado ? "text-emerald-800" : "text-amber-800")}>{teste.teste.mensagem}</p>
            )}
          </div>
        )}
        {erro && <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 text-xs text-red-600">{erro}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button
            type="button"
            className="btn-ghost px-4 py-2 text-xs"
            onClick={testar}
            disabled={testando || !datasetId || (!token.trim() && !config.temToken)}
          >
            {testando ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
            {testando ? "Testando…" : "Testar conexão"}
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost px-4 py-2 text-xs" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-dark px-4 py-2 text-xs" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
