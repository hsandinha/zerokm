"use client";

// Compositor de template: escolhe um template aprovado na Meta, preenche as
// variáveis vendo a prévia e envia. Serve para "Nova conversa" (digita o
// número) e para reabrir uma conversa fora da janela de 24h (número travado).

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Loader2, MessageSquarePlus, SendHorizonal, X } from "lucide-react";
import { formatPhoneBr, parsePhoneBr } from "@wa/lib/phone";

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
  buttons: Array<{ type?: string; text?: string }>;
  examples: string[];
};

export type ComposerTarget =
  | { mode: "new" }
  | { mode: "reopen"; conversationId: string; phone: string; name: string | null };

const CATEGORY_LABEL: Record<string, string> = {
  MARKETING: "marketing",
  UTILITY: "utilidade",
  AUTHENTICATION: "autenticação",
};

/** O WhatsApp usa {{1}}, {{2}}… — a prévia troca pelo valor digitado. */
function render(body: string, values: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (m, n: string) => {
    const v = values[Number(n) - 1]?.trim();
    return v ? v : m;
  });
}

export function TemplateComposer({
  target,
  onClose,
  onSent,
}: {
  target: ComposerTarget;
  onClose: () => void;
  onSent: (conversationId: string) => void;
}) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phone, setPhone] = useState(target.mode === "reopen" ? target.phone : "");
  const [name, setName] = useState(target.mode === "reopen" ? (target.name ?? "") : "");
  const [selected, setSelected] = useState<string>("");
  const [values, setValues] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wa/templates")
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? "Falha ao listar templates");
        if (body.error && !(body.templates ?? []).length) throw new Error(body.error);
        const approved = ((body.templates ?? []) as Template[])
          .filter((t) => t.status === "APPROVED")
          .sort((a, b) => a.name.localeCompare(b.name));
        setTemplates(approved);
        if (approved.length === 1) setSelected(approved[0].name);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const template = useMemo(() => templates?.find((t) => t.name === selected) ?? null, [templates, selected]);

  // Ao trocar de template, começa com o nome do contato em {{1}} — é o uso
  // mais comum — e os exemplos da Meta como sugestão do resto.
  useEffect(() => {
    if (!template) {
      setValues([]);
      return;
    }
    setValues((prev) =>
      Array.from({ length: template.variables }, (_, i) => prev[i] ?? (i === 0 && name.trim() ? name.trim().split(" ")[0] : "")),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.name]);

  const parsed = parsePhoneBr(phone);
  const phoneOk = target.mode === "reopen" || (parsed.valid && parsed.kind === "movel");
  const missing = template ? values.slice(0, template.variables).filter((v) => !v.trim()).length : 0;
  const canSend = Boolean(template) && phoneOk && missing === 0 && !sending;

  async function send() {
    if (!template || !canSend) return;
    setSending(true);
    setError(null);
    const payload = {
      templateName: template.name,
      language: template.language,
      params: values.slice(0, template.variables),
    };
    const res =
      target.mode === "new"
        ? await fetch("/api/wa/conversations/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, phone, name: name.trim() || null }),
          })
        : await fetch(`/api/wa/conversations/${target.conversationId}/template`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
    const body = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(body.error ?? "Falha ao enviar");
      return;
    }
    onSent(body.conversationId);
  }

  const preview = template ? render(template.body, values) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <MessageSquarePlus size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{target.mode === "new" ? "Nova conversa" : "Reabrir com template"}</p>
            <p className="truncate text-xs text-muted">
              {target.mode === "new"
                ? "Fora da janela de 24h só template aprovado chega. A IA assume assim que o lead responder."
                : `${target.name ? `${target.name} · ` : ""}${formatPhoneBr(target.phone)} — o template reabre a janela; a IA continua dali.`}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted hover:bg-canvas" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="grid flex-1 gap-4 overflow-y-auto p-5 md:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            {target.mode === "new" && (
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                <div>
                  <label className="label">Celular</label>
                  <input
                    className={clsx("input", phone && !phoneOk && "border-red-300")}
                    placeholder="(31) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoFocus
                  />
                  {phone && !phoneOk && (
                    <p className="mt-1 text-[11px] text-red-600">
                      {parsed.valid ? "Número fixo não recebe WhatsApp" : `Número inválido${parsed.reason ? ` — ${parsed.reason}` : ""}`}
                    </p>
                  )}
                </div>
                <div>
                  <label className="label">Nome (opcional)</label>
                  <input className="input" placeholder="Como chamar a pessoa" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              </div>
            )}

            <div>
              <label className="label">Template aprovado</label>
              {loadError ? (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{loadError}</p>
              ) : templates == null ? (
                <p className="text-xs text-muted">Carregando templates da Meta…</p>
              ) : templates.length === 0 ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Nenhum template aprovado neste WABA. Crie e submeta um em Templates — a aprovação é da Meta.
                </p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-2xl border border-line p-1">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelected(t.name)}
                      className={clsx(
                        "flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition",
                        selected === t.name ? "bg-brand-100" : "hover:bg-canvas",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold">{t.name}</span>
                          <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-800">
                            {CATEGORY_LABEL[t.category] ?? t.category.toLowerCase()}
                          </span>
                          {t.variables > 0 && (
                            <span className="shrink-0 text-[10px] text-muted">
                              {t.variables} variáve{t.variables === 1 ? "l" : "is"}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[11px] text-muted">{t.body}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {template && template.variables > 0 && (
              <div className="space-y-2">
                <label className="label">Variáveis</label>
                {Array.from({ length: template.variables }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <code className="w-12 shrink-0 rounded bg-brand-50 px-1.5 py-1 text-center text-[11px] text-brand-700">{`{{${i + 1}}}`}</code>
                    <input
                      className="input py-2"
                      placeholder={template.examples[i] ? `ex.: ${template.examples[i]}` : `Valor de {{${i + 1}}}`}
                      value={values[i] ?? ""}
                      onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="label">Prévia</label>
            <div className="rounded-2xl bg-canvas p-4">
              {!template ? (
                <p className="text-xs text-muted">Escolha um template para ver como a mensagem chega no WhatsApp.</p>
              ) : (
                <div className="ml-auto max-w-[95%] rounded-2xl bg-brand-100 px-3.5 py-2 text-sm leading-relaxed">
                  {template.header && <p className="mb-1 font-bold">{template.header}</p>}
                  <p className="whitespace-pre-wrap">{preview}</p>
                  {template.footer && <p className="mt-1 text-[11px] text-muted">{template.footer}</p>}
                  {template.buttons?.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-line/60 pt-2">
                      {template.buttons.map((b, i) => (
                        <p key={i} className="rounded-lg bg-paper/70 py-1 text-center text-xs font-semibold text-sky-700">
                          {b.text ?? b.type}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {template && missing > 0 && (
              <p className="mt-2 text-[11px] text-amber-700">
                Falta preencher {missing} variáve{missing === 1 ? "l" : "is"} — a Meta recusa a mensagem com variável vazia.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="text-[11px] text-muted">{error ? <span className="text-red-600">{error}</span> : "Envio conta como mensagem de template na sua conta Meta."}</p>
          <div className="flex gap-2">
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn-primary px-4 py-1.5 text-xs" onClick={send} disabled={!canSend}>
              {sending ? <Loader2 size={14} className="animate-spin" /> : <SendHorizonal size={14} />}
              {sending ? "Enviando…" : target.mode === "new" ? "Enviar e abrir conversa" : "Enviar template"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
