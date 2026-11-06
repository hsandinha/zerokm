"use client";

// Templates do WhatsApp: ver o que existe (com status e motivo de recusa) e
// criar um novo, submetendo direto para a Meta — sem entrar na Business
// Manager. A aprovação continua sendo da Meta; aqui o template nasce PENDING.
//
// O formulário cobre o que a Meta aceita num template de marketing ou
// utilidade: cabeçalho de texto (com até uma variável) ou de mídia (imagem,
// vídeo, documento, com a amostra que a Meta olha para aprovar), botões de
// resposta rápida, de link (fixo ou com o final dinâmico) e de ligar.

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, Check, Loader2, Paperclip, Plus, Send, Trash2, X } from "lucide-react";
import { useFeedback } from "@/components/ui/Feedback";
import { useWaPanel } from "@wa/components/wa-panel";

type Template = {
  id: string;
  name: string;
  status: string;
  language: string;
  category: string;
  body: string;
  variables: number;
  header: string | null;
  headerFormat?: string | null;
  footer: string | null;
  buttons: Array<{ type: string; text?: string; url?: string; phone_number?: string }>;
  rejectedReason: string | null;
  quality: string | null;
};

type FormatoHeader = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

type Botao =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string; example: string }
  | { type: "PHONE_NUMBER"; text: string; phone_number: string };

const STATUS_CLS: Record<string, string> = {
  APPROVED: "bg-brand-100 text-brand-700",
  PENDING: "bg-amber-100 text-amber-700",
  IN_APPEAL: "bg-amber-100 text-amber-700",
  REJECTED: "bg-red-100 text-red-600",
  PAUSED: "bg-ink-100 text-ink-800",
  DISABLED: "bg-red-100 text-red-600",
};

const STATUS_LABEL: Record<string, string> = {
  APPROVED: "Aprovado",
  PENDING: "Em análise",
  IN_APPEAL: "Em recurso",
  REJECTED: "Recusado",
  PAUSED: "Pausado",
  DISABLED: "Desativado",
};

/** Abas de status: "Em análise" junta pendente e em recurso. */
const ABAS: Array<{ id: string; label: string; status: string[] | null }> = [
  { id: "todos", label: "Todos", status: null },
  { id: "aprovados", label: "Aprovados", status: ["APPROVED"] },
  { id: "analise", label: "Em análise", status: ["PENDING", "IN_APPEAL"] },
  { id: "recusados", label: "Recusados", status: ["REJECTED"] },
  { id: "pausados", label: "Pausados", status: ["PAUSED", "DISABLED"] },
];

const CATEGORIA_LABEL: Record<string, string> = {
  MARKETING: "marketing",
  UTILITY: "utilidade",
  AUTHENTICATION: "autenticação",
};

const FORMATOS: Array<[FormatoHeader, string]> = [
  ["NONE", "Sem cabeçalho"],
  ["TEXT", "Texto"],
  ["IMAGE", "Imagem"],
  ["VIDEO", "Vídeo"],
  ["DOCUMENT", "Documento"],
];

const ACEITA: Record<string, string> = {
  IMAGE: "image/jpeg,image/png",
  VIDEO: "video/mp4",
  DOCUMENT: "application/pdf,.pdf",
};

const DICA_MIDIA: Record<string, string> = {
  IMAGE: "JPG ou PNG, até 4 MB.",
  VIDEO: "MP4, até 4 MB.",
  DOCUMENT: "PDF, até 4 MB.",
};

/** Números das variáveis {{n}} do texto, na ordem. */
function variablesOf(text: string): number[] {
  const found = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return [...new Set(found)].sort((a, b) => a - b);
}

export function TemplatesScreen() {
  const { store } = useWaPanel();
  const { confirm: confirmar, notify, feedback } = useFeedback();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [aba, setAba] = useState("todos");

  const [name, setName] = useState("");
  const [category, setCategory] = useState<"MARKETING" | "UTILITY">("MARKETING");
  const [headerFormat, setHeaderFormat] = useState<FormatoHeader>("NONE");
  const [headerText, setHeaderText] = useState("");
  const [headerExample, setHeaderExample] = useState("");
  const [amostra, setAmostra] = useState<{ id: string; filename: string; previewUrl: string | null } | null>(null);
  const [enviandoAmostra, setEnviandoAmostra] = useState(false);
  const [body, setBody] = useState("");
  const [footerText, setFooterText] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [botoes, setBotoes] = useState<Botao[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/wa/templates");
    const data = await res.json();
    setTemplates(data.templates ?? []);
    setLoadError(data.error ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const vars = useMemo(() => variablesOf(body), [body]);
  const headerVars = useMemo(() => (headerFormat === "TEXT" ? variablesOf(headerText) : []), [headerFormat, headerText]);

  // Prévia com as variáveis já trocadas pelos exemplos — é assim que a Meta
  // avalia e é assim que o cliente vai receber.
  const preview = useMemo(() => {
    let text = body;
    vars.forEach((n, i) => {
      text = text.replaceAll(`{{${n}}}`, examples[i]?.trim() || `«exemplo ${n}»`);
    });
    return text;
  }, [body, vars, examples]);

  const contagem = useMemo(() => {
    const n: Record<string, number> = {};
    for (const a of ABAS) n[a.id] = a.status ? templates.filter((t) => a.status!.includes(t.status)).length : templates.length;
    return n;
  }, [templates]);
  const daAba = useMemo(() => {
    const filtro = ABAS.find((a) => a.id === aba)?.status;
    return filtro ? templates.filter((t) => filtro.includes(t.status)) : templates;
  }, [templates, aba]);

  const links = botoes.filter((b) => b.type === "URL").length;
  const ligar = botoes.filter((b) => b.type === "PHONE_NUMBER").length;

  function adicionarBotao(type: Botao["type"]) {
    setBotoes((atual) => [
      ...atual,
      type === "URL"
        ? { type, text: "", url: "https://", example: "" }
        : type === "PHONE_NUMBER"
          ? { type, text: "Ligar", phone_number: "+55" }
          : { type, text: "" },
    ]);
  }

  function mudarBotao(i: number, campos: Partial<Record<"text" | "url" | "example" | "phone_number", string>>) {
    setBotoes((atual) => atual.map((b, j) => (j === i ? ({ ...b, ...campos } as Botao) : b)));
  }

  async function anexarAmostra(file: File) {
    if (headerFormat === "NONE" || headerFormat === "TEXT") return;
    setEnviandoAmostra(true);
    setErrors([]);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("uso", "amostra");
      form.set("formato", headerFormat);
      const res = await fetch("/api/wa/campaigns/midia", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao enviar a amostra");
      setAmostra({
        id: data.id,
        filename: data.filename ?? file.name,
        previewUrl: headerFormat === "IMAGE" ? URL.createObjectURL(file) : null,
      });
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Falha ao enviar a amostra"]);
    } finally {
      setEnviandoAmostra(false);
    }
  }

  function limpar() {
    setName("");
    setBody("");
    setHeaderFormat("NONE");
    setHeaderText("");
    setHeaderExample("");
    setAmostra(null);
    setFooterText("");
    setBotoes([]);
    setExamples([]);
  }

  async function submit() {
    setSubmitting(true);
    setErrors([]);
    setNotice(null);

    const midia = headerFormat !== "NONE" && headerFormat !== "TEXT";
    const res = await fetch("/api/wa/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        category,
        language: "pt_BR",
        headerFormat: headerFormat === "NONE" ? undefined : headerFormat,
        headerText: headerFormat === "TEXT" ? headerText || undefined : undefined,
        headerExample: headerFormat === "TEXT" && headerVars.length > 0 ? headerExample : undefined,
        headerMidiaId: midia ? amostra?.id : undefined,
        body,
        footerText: footerText || undefined,
        bodyExamples: examples,
        buttons: botoes.length > 0 ? botoes : undefined,
      }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setErrors(data.errors ?? [data.error ?? "Falha ao criar"]);
      return;
    }
    setNotice(
      `Template "${name}" enviado para a Meta: ${STATUS_LABEL[data.template.status] ?? data.template.status}. A aprovação costuma sair em minutos ou algumas horas.`,
    );
    limpar();
    setShowForm(false);
    await load();
  }

  async function remove(templateName: string) {
    if (!(await confirmar({ title: `Excluir o template "${templateName}"?`, description: "Ele é apagado na Meta e não pode ser recuperado.", confirmLabel: "Excluir template", danger: true }))) return;
    const res = await fetch(`/api/wa/templates?name=${encodeURIComponent(templateName)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      notify(data.error ?? "Falha ao excluir o template.");
      return;
    }
    await load();
  }

  const faltaAmostra = (headerFormat === "IMAGE" || headerFormat === "VIDEO" || headerFormat === "DOCUMENT") && !amostra;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="brand-kicker text-brand-700">WhatsApp</p>
          <h1 className="mt-1 text-2xl font-bold">Templates</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Criados e enviados para a Meta daqui, sem abrir a Business Manager. Quem aprova ainda é
            a Meta: o template nasce <b>em análise</b> e só pode ser disparado quando ficar{" "}
            <b>aprovado</b>.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> Novo template
        </button>
      </div>

      {loadError && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {loadError}
        </p>
      )}

      {showForm && (
        <section className="card space-y-4">
          <h2 className="text-sm font-bold">Novo template</h2>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="label">Nome</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                placeholder={store ? "oferta_semana_v1" : "abertura_socio_v1"}
              />
              <p className="mt-1 text-[11px] text-muted">
                Só minúsculas, números e underscore. Não dá para reaproveitar o nome de um template
                existente.
              </p>
            </div>
            <div>
              <label className="label">Categoria</label>
              <select
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value as "MARKETING" | "UTILITY")}
              >
                <option value="MARKETING">{store ? "Marketing (ofertas e promoções)" : "Marketing (prospecção)"}</option>
                <option value="UTILITY">{store ? "Utilidade (aviso de pedido, agendamento)" : "Utilidade (serviço/transacional)"}</option>
              </select>
              <p className="mt-1 text-[11px] text-muted">
                {store
                  ? "Oferta, promoção e convite são marketing. Classificar errado como utilidade é motivo de recusa."
                  : "Prospecção é marketing. Classificar errado como utilidade é motivo de recusa."}
              </p>
            </div>
            <div>
              <label className="label">Idioma</label>
              <input className="input" value="pt_BR" disabled />
            </div>
          </div>

          {/* Cabeçalho */}
          <div className="space-y-2">
            <label className="label">Cabeçalho (opcional)</label>
            <div className="flex flex-wrap gap-1.5">
              {FORMATOS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setHeaderFormat(id);
                    setAmostra(null);
                  }}
                  className={clsx(
                    "rounded-full px-3 py-1.5 text-xs font-semibold",
                    headerFormat === id ? "pill-active" : "border border-line text-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {headerFormat === "TEXT" && (
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <input
                    className="input"
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    maxLength={60}
                    placeholder={store ? "Oferta para {{1}}" : "Novidade para a sua loja"}
                  />
                  <p className="mt-1 text-[11px] text-muted">
                    Até 60 caracteres e no máximo uma variável, {"{{1}}"}. {headerText.length}/60
                  </p>
                </div>
                {headerVars.length > 0 && (
                  <div>
                    <input
                      className="input"
                      value={headerExample}
                      onChange={(e) => setHeaderExample(e.target.value)}
                      placeholder="Exemplo do {{1}} do cabeçalho (obrigatório)"
                    />
                  </div>
                )}
              </div>
            )}
            {(headerFormat === "IMAGE" || headerFormat === "VIDEO" || headerFormat === "DOCUMENT") && (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="btn-ghost inline-flex cursor-pointer px-4 py-2 text-xs">
                    {enviandoAmostra ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                    {amostra ? "Trocar amostra" : "Anexar amostra"}
                    <input
                      type="file"
                      accept={ACEITA[headerFormat]}
                      className="hidden"
                      disabled={enviandoAmostra}
                      onChange={(e) => e.target.files?.[0] && anexarAmostra(e.target.files[0])}
                    />
                  </label>
                  {amostra && (
                    <span className="flex items-center gap-1.5 text-xs">
                      <Check size={13} className="text-brand-700" />
                      {amostra.filename}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted">
                  {DICA_MIDIA[headerFormat]} A Meta aprova olhando esta amostra; em cada campanha você
                  escolhe o arquivo que vai de verdade.
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="label">Corpo da mensagem</label>
            <textarea
              className="input min-h-32"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={1024}
              placeholder={
                store
                  ? "Olá {{1}}! Chegou o {{2}} que você procurava aqui na loja. Quer agendar uma visita?"
                  : "Olá {{1}}! Aqui é a Vera, do CNV — mais de 12 mil veículos 0km para a sua loja…"
              }
            />
            <p className="mt-1 text-[11px] text-muted">
              Use {`{{1}}`}, {`{{2}}`}… para as variáveis, em ordem. {body.length}/1024
            </p>
          </div>

          {vars.length > 0 && (
            <div>
              <label className="label">Exemplos das variáveis (obrigatório)</label>
              <div className="grid gap-2 md:grid-cols-3">
                {vars.map((n, i) => (
                  <div key={n}>
                    <span className="text-[11px] text-muted">{`{{${n}}}`}</span>
                    <input
                      className="input"
                      value={examples[i] ?? ""}
                      onChange={(e) => {
                        const next = [...examples];
                        next[i] = e.target.value;
                        setExamples(next);
                      }}
                      placeholder={n === 1 ? "João" : "exemplo"}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-amber-700">
                Variável sem exemplo é a causa mais comum de recusa da Meta.
              </p>
            </div>
          )}

          <div>
            <label className="label">Rodapé (opcional, até 60)</label>
            <input
              className="input"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              maxLength={60}
              placeholder="Responda SAIR para não receber mais"
            />
          </div>

          {/* Botões */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="label mb-0">Botões (opcional, até 10)</label>
              <button
                type="button"
                className="btn-ghost px-3 py-1 text-xs"
                disabled={botoes.length >= 10}
                onClick={() => adicionarBotao("QUICK_REPLY")}
              >
                <Plus size={12} /> Resposta rápida
              </button>
              <button
                type="button"
                className="btn-ghost px-3 py-1 text-xs"
                disabled={botoes.length >= 10 || links >= 2}
                onClick={() => adicionarBotao("URL")}
              >
                <Plus size={12} /> Link
              </button>
              <button
                type="button"
                className="btn-ghost px-3 py-1 text-xs"
                disabled={botoes.length >= 10 || ligar >= 1}
                onClick={() => adicionarBotao("PHONE_NUMBER")}
              >
                <Plus size={12} /> Ligar
              </button>
            </div>
            {botoes.map((b, i) => (
              <div key={i} className="grid items-start gap-2 rounded-xl border border-line p-2 md:grid-cols-[8rem_1fr_1fr_2rem]">
                <span className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {b.type === "QUICK_REPLY" ? "Resposta rápida" : b.type === "URL" ? "Link" : "Ligar"}
                </span>
                <input
                  className="input py-1.5 text-xs"
                  value={b.text}
                  maxLength={25}
                  placeholder={b.type === "QUICK_REPLY" ? "Quero saber mais" : b.type === "URL" ? "Ver o carro" : "Ligar"}
                  onChange={(e) => mudarBotao(i, { text: e.target.value })}
                />
                {b.type === "URL" ? (
                  <div className="space-y-1">
                    <input
                      className="input py-1.5 text-xs"
                      value={b.url}
                      placeholder="https://site.com.br/carro/{{1}}"
                      onChange={(e) => mudarBotao(i, { url: e.target.value })}
                    />
                    {b.url.includes("{{1}}") ? (
                      <input
                        className="input py-1.5 text-xs"
                        value={b.example}
                        placeholder="Exemplo do final do link (ex.: 12345)"
                        onChange={(e) => mudarBotao(i, { example: e.target.value })}
                      />
                    ) : (
                      <p className="text-[10px] text-muted">
                        Link fixo. Com {"{{1}}"} no fim, cada envio completa o final do endereço.
                      </p>
                    )}
                  </div>
                ) : b.type === "PHONE_NUMBER" ? (
                  <input
                    className="input py-1.5 text-xs"
                    value={b.phone_number}
                    placeholder="+55 31 99999-0000"
                    onChange={(e) => mudarBotao(i, { phone_number: e.target.value })}
                  />
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="rounded-full p-1.5 text-muted hover:bg-canvas"
                  onClick={() => setBotoes((atual) => atual.filter((_, j) => j !== i))}
                  aria-label="Tirar botão"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          {body.trim() && (
            <div>
              <label className="label">Prévia</label>
              <div className="max-w-sm rounded-3xl rounded-tl-md border border-line bg-canvas p-4 text-sm">
                {amostra?.previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={amostra.previewUrl} alt="" className="mb-2 max-h-40 rounded-xl object-cover" />
                )}
                {(headerFormat === "VIDEO" || headerFormat === "DOCUMENT") && (
                  <p className="mb-2 rounded-xl bg-paper px-3 py-6 text-center text-xs text-muted">
                    {headerFormat === "VIDEO" ? "vídeo" : "documento"} {amostra ? `· ${amostra.filename}` : ""}
                  </p>
                )}
                {headerFormat === "TEXT" && headerText && (
                  <p className="mb-1 font-bold">{headerText.replace("{{1}}", headerExample.trim() || "«exemplo»")}</p>
                )}
                <p className="whitespace-pre-wrap">{preview}</p>
                {footerText && <p className="mt-2 text-[11px] text-muted">{footerText}</p>}
                {botoes.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-line pt-2">
                    {botoes.map((b, i) => (
                      <p key={i} className="text-center text-xs text-brand-700">
                        {b.text || (b.type === "URL" ? "link" : b.type === "PHONE_NUMBER" ? "ligar" : "resposta")}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <ul className="space-y-1 text-xs text-red-600">
              {errors.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <button
              className="btn-primary"
              onClick={submit}
              disabled={submitting || enviandoAmostra || !body.trim() || faltaAmostra}
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Enviar para a Meta
            </button>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
            {faltaAmostra && <span className="text-[11px] text-amber-700">Anexe a amostra do cabeçalho.</span>}
          </div>
        </section>
      )}

      {notice && (
        <p className="rounded-xl border border-brand-300 bg-brand-50 p-3 text-sm text-brand-700">
          {notice}
        </p>
      )}

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">{store ? "Templates do WhatsApp da loja" : "Templates no WABA"}</h2>
          <div className="scrollbar-thin flex gap-1 overflow-x-auto">
            {ABAS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className={clsx(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold",
                  aba === a.id ? "pill-active" : "border border-line text-muted",
                )}
              >
                {a.label}
                <span className="ml-1 opacity-70">{contagem[a.id] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <p className="mt-2 text-sm text-muted">Carregando…</p>
        ) : templates.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nenhum template ainda. Sem pelo menos um aprovado, nenhuma campanha pode ser disparada.
          </p>
        ) : daAba.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nenhum template nesta aba.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {daAba.map((t) => (
              <div key={`${t.id}-${t.language}`} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{t.name}</span>
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      STATUS_CLS[t.status] ?? "bg-ink-100 text-ink-800",
                    )}
                  >
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                  <span className="text-[11px] text-muted">
                    {CATEGORIA_LABEL[t.category] ?? t.category.toLowerCase()} · {t.language}
                    {t.variables > 0 ? ` · ${t.variables} variável(is)` : ""}
                    {t.headerFormat === "IMAGE" ? " · imagem no cabeçalho" : ""}
                    {t.headerFormat === "VIDEO" ? " · vídeo no cabeçalho" : ""}
                    {t.headerFormat === "DOCUMENT" ? " · documento no cabeçalho" : ""}
                    {t.quality ? ` · qualidade ${t.quality}` : ""}
                  </span>
                  <button
                    className="ml-auto text-muted hover:text-red-600"
                    onClick={() => remove(t.name)}
                    title="Excluir na Meta"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {t.header && <p className="mt-2 text-xs font-bold text-ink-800">{t.header}</p>}
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{t.body}</p>
                {t.footer && <p className="mt-1 text-[11px] text-muted">{t.footer}</p>}
                {t.buttons.length > 0 && (
                  <p className="mt-1 text-[11px] text-brand-700">
                    botões:{" "}
                    {t.buttons
                      .map((b) => `${b.text ?? b.type}${b.type === "URL" && b.url?.includes("{{1}}") ? " (link dinâmico)" : ""}`)
                      .join(" · ")}
                  </p>
                )}
                {t.rejectedReason && (
                  <p className="mt-2 text-xs text-red-600">Motivo da recusa: {t.rejectedReason}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="zk-ui">{feedback}</div>
    </div>
  );
}
