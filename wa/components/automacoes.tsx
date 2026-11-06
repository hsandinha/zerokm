"use client";

// Automações da loja: pós-atendimento (agradecimento e avaliação no Google),
// pós-venda e aniversário. Cada uma liga e desliga aqui; o texto, o prazo e o
// template abrem em modal, como os outros cadastros do atendimento. As regras
// de envio estão em wa/lib/automacoes-servidor.ts.
//
// O follow-up por coluna mora no Funil (menu de cada coluna); os toques dele
// aparecem no histórico daqui, junto com as automações.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Bell, Cake, Car, HeartHandshake, Loader2, Pencil, X } from "lucide-react";
import {
  CAMPOS,
  HORAS_DO_ANIVERSARIO,
  HORARIO_PERMITIDO,
  INFO,
  preencherTexto,
  type AutomacaoConfig,
  type CampoAutomacao,
  type TipoAutomacao,
} from "@wa/lib/automacoes";
import { dateTime } from "@wa/lib/stages";
import { usePodeUsar, useWaPanel } from "@wa/components/wa-panel";
import { CamposDoTexto, EscolhaDeTemplate, useModelosAutomaticos } from "@wa/components/template-automatico";

type Envio = {
  id: string;
  tipo: string;
  situacao: "enviando" | "enviada" | "pulada" | "falhou";
  canal: string | null;
  como: string | null;
  motivo: string | null;
  contato: string | null;
  conversationId: string | null;
  criadoEm: string;
};

const ICONE: Record<TipoAutomacao, typeof Cake> = {
  pos_atendimento: HeartHandshake,
  pos_venda: Car,
  aniversario: Cake,
};

const NOME_DO_TIPO: Record<string, string> = {
  pos_atendimento: "Pós-atendimento",
  pos_venda: "Pós-venda",
  aniversario: "Aniversário",
  funil: "Follow-up do funil",
};

const SITUACAO: Record<Envio["situacao"], { label: string; cls: string }> = {
  enviada: { label: "Enviada", cls: "bg-emerald-100 text-emerald-700" },
  pulada: { label: "Pulada", cls: "bg-amber-100 text-amber-700" },
  falhou: { label: "Falhou", cls: "bg-red-100 text-red-600" },
  enviando: { label: "Enviando", cls: "bg-ink-100 text-ink-800" },
};

const COMO: Record<string, string> = { texto: "texto", ia: "escrita pela IA", modelo: "template" };

function quando(a: AutomacaoConfig): string {
  if (a.tipo === "aniversario") return `No dia do aniversário, a partir das ${a.hora}h.`;
  const info = INFO[a.tipo].espera!;
  const n = a.espera;
  const unidade = info.unidade === "dias" ? (n === 1 ? "dia" : "dias") : n === 1 ? "hora" : "horas";
  return a.tipo === "pos_venda"
    ? `${n} ${unidade} depois de a conversa ir para venda fechada.`
    : `${n} ${unidade} depois de a conversa ser encerrada.`;
}

export function Automacoes() {
  const { base } = useWaPanel();
  const podeUsar = usePodeUsar();
  const [automacoes, setAutomacoes] = useState<AutomacaoConfig[] | null>(null);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [loja, setLoja] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<AutomacaoConfig | null>(null);
  const [salvando, setSalvando] = useState<TipoAutomacao | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/wa/automacoes");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(body.error ?? "Não foi possível carregar as automações.");
      return;
    }
    setAutomacoes(body.automacoes ?? []);
    setEnvios(body.envios ?? []);
    setLoja(body.loja ?? "");
    setErro(null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Grava a automação inteira; devolve a mensagem de erro (ou null). */
  async function salvar(a: AutomacaoConfig): Promise<string | null> {
    setSalvando(a.tipo);
    try {
      const res = await fetch("/api/wa/automacoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return body.error ?? "Não foi possível salvar.";
      await load();
      return null;
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="brand-kicker">Atendimento</p>
        <h1 className="mt-1 text-2xl font-bold">Automações</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Mensagens que saem sozinhas, uma vez por evento. Dentro da janela de 24h vai o texto; fora dela, só o
          template aprovado (sem template, não sai). Quem pediu para não receber mensagens fica de fora, e nada sai
          entre {HORARIO_PERMITIDO.ate}h e {HORARIO_PERMITIDO.de}h.
        </p>
      </div>

      {erro && (
        <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 text-xs text-red-600">{erro}</p>
      )}

      {!automacoes ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Carregando…
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {automacoes.map((a) => {
            const Icon = ICONE[a.tipo];
            return (
              <div key={a.tipo} className="card flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{INFO[a.tipo].titulo}</p>
                    <p className="mt-0.5 text-xs text-muted">{INFO[a.tipo].descricao}</p>
                  </div>
                </div>
                <div className="space-y-1 text-xs">
                  <p className="text-ink-800">{quando(a)}</p>
                  <p className="text-muted">
                    {a.template ? `Fora da janela: template ${a.template}.` : "Sem template: fora da janela de 24h não sai."}
                  </p>
                  <p className="line-clamp-3 whitespace-pre-wrap rounded-2xl bg-canvas px-3 py-2 text-ink-800">
                    {a.texto || "Sem texto."}
                  </p>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={a.ativa}
                      disabled={salvando === a.tipo}
                      onChange={async (e) => {
                        const msg = await salvar({ ...a, ativa: e.target.checked });
                        if (msg) {
                          setErro(msg);
                          // Ligar sem o que falta abre o modal para completar.
                          if (e.target.checked) setEditando({ ...a, ativa: true });
                        }
                      }}
                    />
                    {a.ativa ? "Ligada" : "Desligada"}
                  </label>
                  <button className="btn-ghost ml-auto px-3 py-1.5 text-xs" onClick={() => setEditando(a)}>
                    <Pencil size={14} /> Configurar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {podeUsar("funil") && (
        <p className="flex items-start gap-2 rounded-2xl border border-line bg-paper px-4 py-2.5 text-xs text-muted">
          <Bell size={14} className="mt-0.5 shrink-0" />
          <span>
            O follow-up de quem parou de responder se configura por coluna, no{" "}
            <Link href={`${base}/pipeline`} className="font-semibold text-brand-700 hover:underline">
              Funil
            </Link>
            : menu da coluna, opção Follow-up.
          </span>
        </p>
      )}

      <div className="card overflow-hidden p-0">
        <p className="border-b border-line px-4 py-3 text-sm font-bold">Envios recentes</p>
        {envios.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">Nenhuma mensagem automática ainda.</p>
        ) : (
          <ul className="divide-y divide-line">
            {envios.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-xs">
                <span className={clsx("rounded-full px-2 py-0.5 font-semibold", SITUACAO[e.situacao].cls)}>
                  {SITUACAO[e.situacao].label}
                </span>
                <span className="font-semibold text-ink-900">{NOME_DO_TIPO[e.tipo] ?? e.tipo}</span>
                <span className="min-w-0 flex-1 truncate text-ink-800">
                  {e.contato ?? "contato apagado"}
                  {e.como ? ` · ${COMO[e.como] ?? e.como}` : ""}
                  {e.motivo ? ` · ${e.motivo}` : ""}
                </span>
                {e.conversationId && (
                  <Link href={`${base}/central?c=${e.conversationId}`} className="text-brand-700 hover:underline">
                    abrir conversa
                  </Link>
                )}
                <span className="text-muted">{dateTime(e.criadoEm)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editando && (
        <AutomacaoModal
          automacao={editando}
          loja={loja}
          onClose={() => setEditando(null)}
          onSave={async (a) => {
            const msg = await salvar(a);
            if (!msg) {
              setEditando(null);
              setErro(null);
            }
            return msg;
          }}
        />
      )}
    </div>
  );
}

/** Moldura de modal, no mesmo padrão dos outros do atendimento. */
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
      <div className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl">
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

const EXEMPLO = Object.fromEntries(Object.entries(CAMPOS).map(([k, v]) => [k, v.exemplo])) as Record<
  CampoAutomacao,
  string
>;

function AutomacaoModal({
  automacao,
  loja,
  onClose,
  onSave,
}: {
  automacao: AutomacaoConfig;
  loja: string;
  onClose: () => void;
  onSave: (a: AutomacaoConfig) => Promise<string | null>;
}) {
  const info = INFO[automacao.tipo];
  const [a, setA] = useState<AutomacaoConfig>(automacao);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { modelos, aviso, carregando } = useModelosAutomaticos();
  const set = <K extends keyof AutomacaoConfig>(k: K, v: AutomacaoConfig[K]) => setA((x) => ({ ...x, [k]: v }));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro(await onSave(a));
    setSalvando(false);
  }

  const previa = preencherTexto(a.texto, {
    ...EXEMPLO,
    loja: loja || EXEMPLO.loja,
    link_avaliacao: a.linkAvaliacao || EXEMPLO.link_avaliacao,
  });

  return (
    <Modal title={info.titulo} subtitle={info.descricao} onClose={onClose}>
      <form className="space-y-4" onSubmit={salvar}>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={a.ativa} onChange={(e) => set("ativa", e.target.checked)} />
          Automação ligada
        </label>

        {info.espera && (
          <label className="block text-xs font-semibold text-ink-800">
            {info.espera.rotulo}
            <input
              type="number"
              className="input mt-1 w-40"
              min={info.espera.min}
              max={info.espera.max}
              value={a.espera}
              onChange={(e) => set("espera", Number(e.target.value))}
            />
          </label>
        )}

        {a.tipo === "aniversario" && (
          <label className="block text-xs font-semibold text-ink-800">
            A partir de que horas
            <select className="input mt-1 w-40" value={a.hora} onChange={(e) => set("hora", Number(e.target.value))}>
              {HORAS_DO_ANIVERSARIO.map((h) => (
                <option key={h} value={h}>
                  {h}h
                </option>
              ))}
            </select>
          </label>
        )}

        {a.tipo === "pos_atendimento" && (
          <label className="block text-xs font-semibold text-ink-800">
            Link de avaliação no Google
            <input
              className="input mt-1 w-full"
              placeholder="https://g.page/r/..."
              value={a.linkAvaliacao ?? ""}
              onChange={(e) => set("linkAvaliacao", e.target.value || null)}
            />
            <span className="mt-1 block font-normal text-muted">
              No Perfil da Empresa no Google, em &quot;Pedir avaliações&quot;. Entra no texto pelo {"{{link_avaliacao}}"}.
            </span>
          </label>
        )}

        <div>
          <label className="block text-xs font-semibold text-ink-800">
            Texto (dentro da janela de 24h)
            <textarea
              className="input mt-1 min-h-[110px] w-full"
              maxLength={1000}
              value={a.texto}
              onChange={(e) => set("texto", e.target.value)}
            />
          </label>
          <div className="mt-1.5">
            <CamposDoTexto
              campos={info.campos}
              onInserir={(m) => set("texto", `${a.texto}${a.texto && !a.texto.endsWith(" ") ? " " : ""}${m}`)}
            />
          </div>
          {previa && (
            <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-canvas px-3 py-2 text-xs text-ink-800">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">Prévia</span>
              {previa}
            </p>
          )}
        </div>

        <EscolhaDeTemplate
          modelos={modelos}
          aviso={aviso}
          carregando={carregando}
          template={a.template}
          idioma={a.templateIdioma}
          vars={a.templateVars}
          campos={info.campos}
          semTemplate={
            a.tipo === "pos_venda"
              ? "Dias depois da venda a janela quase sempre já fechou: sem template, quase nada sai."
              : "Sem template, quem está fora da janela de 24h não recebe."
          }
          onChange={(v) => setA((x) => ({ ...x, ...v }))}
        />

        {erro && <p className="text-xs text-red-600">{erro}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost px-4 py-2 text-xs" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-dark px-4 py-2 text-xs" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
