"use client";

// Templates do WhatsApp: ver o que existe (com status e motivo de recusa) e
// criar um novo, submetendo direto para a Meta — sem entrar na Business
// Manager. A aprovação continua sendo da Meta; aqui o template nasce PENDING.

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, Loader2, Plus, Send, Trash2 } from "lucide-react";

type Template = {
  id: string;
  name: string;
  status: string;
  language: string;
  category: string;
  body: string;
  variables: number;
  header: string | null;
  footer: string | null;
  buttons: Array<{ type: string; text?: string; url?: string }>;
  rejectedReason: string | null;
  quality: string | null;
};

const STATUS_CLS: Record<string, string> = {
  APPROVED: "bg-brand-100 text-brand-700",
  PENDING: "bg-amber-100 text-amber-700",
  REJECTED: "bg-red-100 text-red-600",
  PAUSED: "bg-ink-100 text-ink-800",
  DISABLED: "bg-red-100 text-red-600",
};

/** Números das variáveis {{n}} do texto, na ordem. */
function variablesOf(text: string): number[] {
  const found = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return [...new Set(found)].sort((a, b) => a - b);
}

export function TemplatesScreen() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<"MARKETING" | "UTILITY">("MARKETING");
  const [headerText, setHeaderText] = useState("");
  const [body, setBody] = useState("");
  const [footerText, setFooterText] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [buttonText, setButtonText] = useState("");
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

  // Prévia com as variáveis já trocadas pelos exemplos — é assim que a Meta
  // avalia e é assim que o cliente vai receber.
  const preview = useMemo(() => {
    let text = body;
    vars.forEach((n, i) => {
      text = text.replaceAll(`{{${n}}}`, examples[i]?.trim() || `«exemplo ${n}»`);
    });
    return text;
  }, [body, vars, examples]);

  async function submit() {
    setSubmitting(true);
    setErrors([]);
    setNotice(null);

    const res = await fetch("/api/wa/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        category,
        language: "pt_BR",
        headerText: headerText || undefined,
        body,
        footerText: footerText || undefined,
        bodyExamples: examples,
        buttons: buttonText.trim() ? [{ type: "QUICK_REPLY", text: buttonText.trim() }] : undefined,
      }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setErrors(data.errors ?? [data.error ?? "Falha ao criar"]);
      return;
    }
    setNotice(
      `Template "${name}" enviado para a Meta com status ${data.template.status}. A aprovação costuma sair em minutos ou algumas horas.`,
    );
    setName("");
    setBody("");
    setHeaderText("");
    setFooterText("");
    setButtonText("");
    setExamples([]);
    setShowForm(false);
    await load();
  }

  async function remove(templateName: string) {
    if (!confirm(`Excluir o template "${templateName}" na Meta? Isso não pode ser desfeito.`)) return;
    const res = await fetch(`/api/wa/templates?name=${encodeURIComponent(templateName)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Falha ao excluir");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="brand-kicker text-brand-700">WhatsApp</p>
          <h1 className="mt-1 text-2xl font-bold">Templates</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Criados e enviados para a Meta daqui — sem abrir a Business Manager. Quem aprova ainda é
            a Meta: o template nasce <b>PENDING</b> e só pode ser disparado quando ficar{" "}
            <b>APPROVED</b>.
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
                placeholder="abertura_socio_v1"
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
                <option value="MARKETING">Marketing (prospecção)</option>
                <option value="UTILITY">Utilidade (serviço/transacional)</option>
              </select>
              <p className="mt-1 text-[11px] text-muted">
                Prospecção é marketing. Classificar errado como utilidade é motivo de recusa.
              </p>
            </div>
            <div>
              <label className="label">Idioma</label>
              <input className="input" value="pt_BR" disabled />
            </div>
          </div>

          <div>
            <label className="label">Cabeçalho (opcional, até 60 caracteres)</label>
            <input
              className="input"
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              maxLength={60}
            />
          </div>

          <div>
            <label className="label">Corpo da mensagem</label>
            <textarea
              className="input min-h-32"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={1024}
              placeholder="Olá {{1}}! Aqui é a Vera, da CNV — mais de 12 mil veículos 0km para a sua loja…"
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

          <div className="grid gap-3 md:grid-cols-2">
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
            <div>
              <label className="label">Botão de resposta rápida (opcional)</label>
              <input
                className="input"
                value={buttonText}
                onChange={(e) => setButtonText(e.target.value)}
                maxLength={25}
                placeholder="Quero entender"
              />
            </div>
          </div>

          {body.trim() && (
            <div>
              <label className="label">Prévia</label>
              <div className="max-w-sm rounded-3xl rounded-tl-md border border-line bg-canvas p-4 text-sm">
                {headerText && <p className="mb-1 font-bold">{headerText}</p>}
                <p className="whitespace-pre-wrap">{preview}</p>
                {footerText && <p className="mt-2 text-[11px] text-muted">{footerText}</p>}
                {buttonText && (
                  <p className="mt-2 border-t border-line pt-2 text-center text-xs text-brand-700">
                    {buttonText}
                  </p>
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
            <button className="btn-primary" onClick={submit} disabled={submitting || !body.trim()}>
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Enviar para a Meta
            </button>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      {notice && (
        <p className="rounded-xl border border-brand-300 bg-brand-50 p-3 text-sm text-brand-700">
          {notice}
        </p>
      )}

      <section className="card">
        <h2 className="text-sm font-bold">Templates no WABA</h2>
        {loading ? (
          <p className="mt-2 text-sm text-muted">Carregando…</p>
        ) : templates.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nenhum template ainda. Sem pelo menos um aprovado, nenhuma campanha pode ser disparada.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {templates.map((t) => (
              <div key={`${t.id}-${t.language}`} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{t.name}</span>
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      STATUS_CLS[t.status] ?? "bg-ink-100 text-ink-800",
                    )}
                  >
                    {t.status}
                  </span>
                  <span className="text-[11px] text-muted">
                    {t.category} · {t.language}
                    {t.variables > 0 ? ` · ${t.variables} variável(is)` : ""}
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
                    botões: {t.buttons.map((b) => b.text).join(" · ")}
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
    </div>
  );
}
