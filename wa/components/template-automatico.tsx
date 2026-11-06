"use client";

// Escolha do template aprovado de uma mensagem automática (follow-up do funil
// e automações da loja): fora da janela de 24h só ele chega. Cada {{n}} do
// corpo recebe um campo (primeiro nome, nome da loja...). A lista vem de
// /api/wa/automacoes/modelos, que já tira os templates com mídia no cabeçalho
// ou link dinâmico (a automação não tem o arquivo nem o final do link).

import { useEffect, useState } from "react";
import { CAMPOS, parametrosDoModelo, type CampoAutomacao } from "@wa/lib/automacoes";

export type ModeloAutomatico = {
  name: string;
  language: string;
  category: string;
  body: string;
  bodyVars: number;
};

export function useModelosAutomaticos(): { modelos: ModeloAutomatico[]; aviso: string | null; carregando: boolean } {
  const [modelos, setModelos] = useState<ModeloAutomatico[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  useEffect(() => {
    fetch("/api/wa/automacoes/modelos")
      .then((r) => r.json().catch(() => ({})))
      .then((d: { templates?: ModeloAutomatico[]; aviso?: string; error?: string }) => {
        setModelos(d.templates ?? []);
        setAviso(d.aviso ?? d.error ?? null);
      })
      .catch(() => setAviso("Não foi possível carregar os templates."))
      .finally(() => setCarregando(false));
  }, []);
  return { modelos, aviso, carregando };
}

const EXEMPLO = Object.fromEntries(Object.entries(CAMPOS).map(([k, v]) => [k, v.exemplo])) as Record<
  CampoAutomacao,
  string
>;

export function EscolhaDeTemplate({
  modelos,
  aviso,
  carregando,
  template,
  idioma,
  vars,
  campos,
  semTemplate,
  onChange,
}: {
  modelos: ModeloAutomatico[];
  aviso: string | null;
  carregando: boolean;
  template: string | null;
  idioma: string;
  vars: CampoAutomacao[];
  /** Campos que esta mensagem pode usar nas variáveis. */
  campos: CampoAutomacao[];
  /** O que acontece sem template (texto da ajuda). */
  semTemplate: string;
  onChange: (v: { template: string | null; templateIdioma: string; templateVars: CampoAutomacao[] }) => void;
}) {
  const escolhido = modelos.find((m) => m.name === template && m.language === idioma) ?? null;
  // Template salvo que sumiu da lista (recusado, apagado): fica visível para
  // a pessoa trocar, em vez de sumir calado.
  const perdido = template && !carregando && !escolhido;

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-ink-800">
        Template para fora da janela de 24h
        <select
          className="input mt-1 w-full"
          value={template ? `${template}|${idioma}` : ""}
          onChange={(e) => {
            const [name, language] = e.target.value.split("|");
            const m = modelos.find((x) => x.name === name && x.language === language);
            onChange({
              template: m ? m.name : null,
              templateIdioma: m ? m.language : "pt_BR",
              templateVars: m ? Array.from({ length: m.bodyVars }, (_, i) => vars[i] ?? "nome") : [],
            });
          }}
        >
          <option value="">{carregando ? "Carregando…" : "Sem template"}</option>
          {perdido && (
            <option value={`${template}|${idioma}`}>
              {template} ({idioma}): não está mais aprovado
            </option>
          )}
          {modelos.map((m) => (
            <option key={`${m.name}|${m.language}`} value={`${m.name}|${m.language}`}>
              {m.name} ({m.language})
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-muted">{aviso ?? semTemplate}</p>
      {perdido && (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          O template escolhido não está mais aprovado neste número: fora da janela, nada sai até você trocar.
        </p>
      )}

      {escolhido && (
        <div className="space-y-2 rounded-2xl border border-line bg-canvas px-3 py-2">
          {escolhido.bodyVars > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: escolhido.bodyVars }, (_, i) => (
                <label key={i} className="block text-[11px] font-semibold text-ink-800">
                  {`{{${i + 1}}}`}
                  <select
                    className="input mt-1 w-full py-1 text-xs"
                    value={vars[i] ?? "nome"}
                    onChange={(e) => {
                      const novo = Array.from({ length: escolhido.bodyVars }, (_, j) => vars[j] ?? "nome");
                      novo[i] = e.target.value as CampoAutomacao;
                      onChange({ template, templateIdioma: idioma, templateVars: novo });
                    }}
                  >
                    {campos.map((c) => (
                      <option key={c} value={c}>
                        {CAMPOS[c].rotulo}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          <p className="whitespace-pre-wrap text-xs text-ink-800">
            {escolhido.body.replace(/\{\{(\d+)\}\}/g, (_, n: string) =>
              parametrosDoModelo(vars, escolhido.bodyVars, EXEMPLO)[Number(n) - 1] ?? "",
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/** Botões que põem {{campo}} no fim do texto. */
export function CamposDoTexto({
  campos,
  onInserir,
}: {
  campos: CampoAutomacao[];
  onInserir: (marcador: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {campos.map((c) => (
        <button
          key={c}
          type="button"
          className="rounded-full border border-line bg-paper px-2 py-0.5 text-[11px] text-ink-700 hover:bg-canvas"
          onClick={() => onInserir(`{{${c}}}`)}
          title={`Insere ${CAMPOS[c].rotulo.toLowerCase()}`}
        >
          {`{{${c}}}`}
        </button>
      ))}
    </div>
  );
}
