"use client";

// Importação da base de contatos por CSV ou Excel (.xlsx). O arquivo é lido no
// navegador (o mesmo leitor da importação de público, wa/lib/audience: separador
// detectado sozinho, BOM do Excel, cabeçalho repetido) e nunca sobe inteiro:
// só as linhas já nos campos da ficha.
//
// A planilha raramente vem com o nome de coluna que esperamos: adivinhamos o
// mapeamento pelo cabeçalho e a pessoa corrige antes de importar. Do .xlsx vale
// a primeira aba visível.

import { useMemo, useRef, useState } from "react";
import { CircleCheck, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { ACEITA_PLANILHA, FORMATOS_DE_PLANILHA, lerPlanilha, PlanilhaError } from "@wa/lib/audience/planilha";
import { CAMPOS_DO_CSV, detectarColunas, linhasDoCsv, type CampoDoCsv } from "@wa/lib/contatos";
import { parsePhoneBr } from "@wa/lib/phone";
import { formatNumber } from "@wa/lib/stages";

type Resultado = { total: number; criados: number; completados: number; ignorados: number; repetidos: number };

/** Linhas por envio: corpo pequeno e progresso na tela. */
const LOTE = 1000;

export function ImportarContatosModal({ onClose, onImportado }: { onClose: () => void; onImportado: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [raw, setRaw] = useState<Array<Record<string, string>>>([]);
  const [mapa, setMapa] = useState<Partial<Record<CampoDoCsv, string>>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<{ feito: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function ler(file: File) {
    setErro(null);
    setResultado(null);
    setArquivo(file.name);
    try {
      const parsed = await lerPlanilha(file);
      if (parsed.headers.length === 0 || parsed.raw.length === 0) {
        setErro("O arquivo está vazio ou sem cabeçalho na primeira linha.");
        return;
      }
      const palpite = detectarColunas(parsed.headers);
      if (!palpite.phone) {
        setErro("Não achei a coluna de telefone. Escolha abaixo de qual coluna ele vem.");
      }
      setHeaders(parsed.headers);
      setRaw(parsed.raw);
      setMapa(palpite);
    } catch (err) {
      setHeaders([]);
      setRaw([]);
      setErro(err instanceof PlanilhaError ? err.message : `Não consegui ler o arquivo. Ele está em ${FORMATOS_DE_PLANILHA}?`);
    }
  }

  const linhas = useMemo(() => linhasDoCsv(raw, mapa), [raw, mapa]);
  const resumo = useMemo(() => {
    const vistos = new Set<string>();
    let validos = 0;
    let repetidos = 0;
    for (const l of linhas) {
      const t = parsePhoneBr(l.phone);
      if (!t.valid || !t.e164) continue;
      if (vistos.has(t.e164)) repetidos++;
      else {
        vistos.add(t.e164);
        validos++;
      }
    }
    return { validos, repetidos, invalidos: linhas.length - validos - repetidos };
  }, [linhas]);

  async function importar() {
    if (!mapa.phone || linhas.length === 0) return;
    setErro(null);
    const total: Resultado = { total: 0, criados: 0, completados: 0, ignorados: 0, repetidos: 0 };
    setEnviando({ feito: 0, total: linhas.length });
    try {
      for (let i = 0; i < linhas.length; i += LOTE) {
        const res = await fetch("/api/wa/contacts/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: linhas.slice(i, i + LOTE) }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Lote sem nenhum telefone válido não é erro da importação inteira.
          if (res.status === 400 && /telefone válido/i.test(body.error ?? "")) {
            total.ignorados += Math.min(LOTE, linhas.length - i);
          } else {
            setErro(`${body.error ?? "Não foi possível importar."} (parou na linha ${i + 2})`);
            break;
          }
        } else {
          for (const k of Object.keys(total) as Array<keyof Resultado>) total[k] += body[k] ?? 0;
        }
        setEnviando({ feito: Math.min(i + LOTE, linhas.length), total: linhas.length });
      }
      setResultado(total);
      onImportado();
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <FileSpreadsheet size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Importar contatos</p>
            <p className="mt-0.5 text-xs text-muted">
              CSV ou Excel (.xlsx) com uma linha por contato e telefone com DDD. Quem já é contato só tem a ficha completada, nada
              é sobrescrito.
            </p>
          </div>
          <button className="rounded-full p-1.5 text-muted hover:bg-canvas" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <input
            ref={fileRef}
            type="file"
            accept={ACEITA_PLANILHA}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) ler(f);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line px-4 py-3">
            <p className="text-sm">
              {arquivo ? (
                <span className="font-semibold">{arquivo}</span>
              ) : (
                <span className="text-muted">Escolha a planilha da sua base (CSV ou Excel).</span>
              )}
            </p>
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> {arquivo ? "Trocar arquivo" : "Escolher arquivo"}
            </button>
          </div>

          {erro && (
            <p className="rounded-2xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>
          )}

          {resultado && (
            <p className="flex items-start gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <CircleCheck size={14} className="mt-0.5 shrink-0" />
              <span>
                Importação concluída: {formatNumber(resultado.criados)} novo{resultado.criados === 1 ? "" : "s"},{" "}
                {formatNumber(resultado.completados)} já existia{resultado.completados === 1 ? "" : "m"} e{" "}
                {resultado.completados === 1 ? "teve a ficha completada" : "tiveram a ficha completada"}
                {resultado.ignorados > 0 && `, ${formatNumber(resultado.ignorados)} sem telefone válido`}
                {resultado.repetidos > 0 && `, ${formatNumber(resultado.repetidos)} repetido(s) no arquivo`}.
              </span>
            </p>
          )}

          {headers.length > 0 && !resultado && (
            <>
              <div>
                <p className="text-xs font-semibold text-ink-800">De qual coluna vem cada campo</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  Já adivinhamos pelo nome das colunas. Corrija o que estiver errado. O telefone é obrigatório e é
                  ele que evita contato repetido.
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {CAMPOS_DO_CSV.map(({ campo, rotulo }) => (
                    <label key={campo} className="block text-[11px] font-semibold text-ink-800">
                      {rotulo}
                      {campo === "phone" ? " *" : ""}
                      <select
                        className="input mt-1 w-full py-1 text-xs"
                        value={mapa[campo] ?? ""}
                        onChange={(e) => setMapa((m) => ({ ...m, [campo]: e.target.value || undefined }))}
                      >
                        <option value="">Não importar</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                <p className="text-xs text-muted">
                  <b className="text-ink-900">{formatNumber(resumo.validos)} contatos</b>
                  {resumo.repetidos > 0 && ` · ${formatNumber(resumo.repetidos)} telefone(s) repetido(s) juntado(s)`}
                  {resumo.invalidos > 0 && ` · ${formatNumber(resumo.invalidos)} linha(s) sem telefone válido`}
                </p>
                <button
                  type="button"
                  className="btn-dark px-4 py-2 text-xs"
                  disabled={!mapa.phone || resumo.validos === 0 || Boolean(enviando)}
                  onClick={importar}
                >
                  {enviando ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> {formatNumber(enviando.feito)} de{" "}
                      {formatNumber(enviando.total)}
                    </>
                  ) : (
                    <>
                      <Upload size={14} /> Importar {formatNumber(resumo.validos)}
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {resultado && (
            <div className="flex justify-end">
              <button type="button" className="btn-dark px-4 py-2 text-xs" onClick={onClose}>
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
