"use client";

// Importação de base: um CSV vira empresas (`alvos`) e contatos.
//
// Não há layout obrigatório — as colunas são detectadas pelo nome e quem
// importa confirma antes de gravar. O arquivo sobe em lotes porque uma
// planilha inteira de uma vez estoura o limite de body da Vercel.
//
// O que a importação faz sozinha: valida CNPJ e CPF por dígito verificador,
// canoniza o telefone, descarta quem já é cliente da CNV e mantém de fora quem
// pediu opt-out.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AlertTriangle, Check, FileUp, Loader2, Upload } from "lucide-react";
import { parseCsv } from "@wa/lib/audience/csv";
import type { AudienceField, ColumnMapping } from "@wa/lib/audience/types";
import { dateTime, formatNumber } from "@wa/lib/stages";

const CHUNK_ROWS = 1000;

const FIELD_LABELS: Array<[AudienceField | "", string]> = [
  ["", "— ignorar —"],
  ["phone", "Telefone"],
  ["contactName", "Nome do contato"],
  ["company", "Empresa / razão social"],
  ["cnpj", "CNPJ"],
  ["city", "Cidade"],
  ["state", "UF"],
  ["email", "E-mail"],
  ["partnerName", "Nome do sócio"],
  ["partnerTaxId", "CPF do sócio"],
];

type Import = {
  id: string;
  kind: string;
  filename: string | null;
  rowsTotal: number;
  rowsOk: number;
  rowsError: number;
  status: string;
  error: string | null;
  createdBy: string | null;
  createdAt: string;
};

type Resultado = {
  rowsTotal: number;
  rowsOk: number;
  rowsError: number;
  targetsUpserted: number;
  contactsUpserted: number;
  alreadyCustomers: number;
  errors: Array<{ line: number; error: string }>;
};

export function ImportScreen() {
  const [historico, setHistorico] = useState<Import[]>([]);
  const [arquivo, setArquivo] = useState<{
    name: string;
    headers: string[];
    rows: Array<Record<string, string>>;
    mapping: ColumnMapping;
  } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/wa/imports");
    if (!res.ok) return;
    const body = await res.json();
    setHistorico(body.imports ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function escolher(file: File) {
    setErro(null);
    setResultado(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.raw.length === 0) {
      setErro("O arquivo não tem linhas de dados.");
      return;
    }
    setArquivo({
      name: file.name,
      headers: parsed.headers,
      rows: parsed.raw,
      mapping: parsed.suggestedMapping,
    });
  }

  async function importar() {
    if (!arquivo) return;
    const temTelefone = Object.values(arquivo.mapping).includes("phone");
    const temCnpj = Object.values(arquivo.mapping).includes("cnpj");
    if (!temTelefone && !temCnpj) {
      setErro("Marque ao menos a coluna do telefone ou a do CNPJ — sem uma das duas não há o que gravar.");
      return;
    }

    setEnviando(true);
    setErro(null);
    setProgresso(0);
    const total: Resultado = {
      rowsTotal: 0,
      rowsOk: 0,
      rowsError: 0,
      targetsUpserted: 0,
      contactsUpserted: 0,
      alreadyCustomers: 0,
      errors: [],
    };

    try {
      const criar = await fetch("/api/wa/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "csv", filename: arquivo.name, mapping: arquivo.mapping }),
      });
      const criado = await criar.json();
      if (!criar.ok) throw new Error(criado.error ?? "Falha ao abrir a importação");
      const importId = criado.importId as string;

      for (let i = 0; i < arquivo.rows.length; i += CHUNK_ROWS) {
        const lote = arquivo.rows.slice(i, i + CHUNK_ROWS);
        const res = await fetch(`/api/wa/imports/${importId}/rows`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: lote, firstLine: i + 2 }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Falha ao enviar um lote");
        const r = body.result as Resultado;
        total.rowsTotal += r.rowsTotal;
        total.rowsOk += r.rowsOk;
        total.rowsError += r.rowsError;
        total.targetsUpserted += r.targetsUpserted;
        total.contactsUpserted += r.contactsUpserted;
        total.alreadyCustomers += r.alreadyCustomers;
        total.errors.push(...r.errors.slice(0, 20));
        setProgresso(Math.round(((i + lote.length) / arquivo.rows.length) * 100));
      }

      await fetch(`/api/wa/imports/${importId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setResultado(total);
      setArquivo(null);
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha na importação");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="brand-kicker">Base</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
          <Upload size={22} /> Importação
        </h1>
        <p className="mt-1 text-sm text-muted">
          Um CSV com telefone e/ou CNPJ vira base de disparo. As colunas são detectadas pelo nome —
          confira antes de gravar.
        </p>
      </div>

      {erro && (
        <p className="flex items-start gap-2 rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {erro}
        </p>
      )}

      {resultado && (
        <div className="card border-brand-300 bg-brand-50">
          <p className="flex items-center gap-2 text-sm font-bold text-brand-700">
            <Check size={16} /> Importação concluída
          </p>
          <ul className="mt-2 space-y-0.5 text-sm">
            <li>{formatNumber(resultado.rowsOk)} linha(s) gravadas</li>
            <li>{formatNumber(resultado.targetsUpserted)} empresa(s) na base</li>
            <li>{formatNumber(resultado.contactsUpserted)} contato(s) de WhatsApp</li>
            {resultado.alreadyCustomers > 0 && (
              <li className="text-muted">
                {formatNumber(resultado.alreadyCustomers)} já são clientes da CNV — entraram
                suprimidos, sem risco de receber oferta
              </li>
            )}
            {resultado.rowsError > 0 && (
              <li className="text-red-600">
                {formatNumber(resultado.rowsError)} linha(s) com problema
              </li>
            )}
          </ul>
          {resultado.errors.length > 0 && (
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted">
              {resultado.errors.map((e, i) => (
                <li key={i}>
                  linha {e.line}: {e.error}
                </li>
              ))}
            </ul>
          )}
          <Link href="/dashboard/admin/whatsapp/campanhas/nova" className="btn-primary mt-3 inline-flex px-4 py-2 text-xs">
            Montar campanha com esta base
          </Link>
        </div>
      )}

      <div className="card space-y-3">
        <label className="btn-ghost inline-flex cursor-pointer px-4 py-2 text-sm">
          <FileUp size={15} /> Escolher arquivo CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && escolher(e.target.files[0])}
          />
        </label>

        {arquivo && (
          <>
            <p className="text-sm font-semibold">
              {arquivo.name} · {formatNumber(arquivo.rows.length)} linha(s)
            </p>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-2xl border border-line bg-canvas p-3">
              {arquivo.headers.map((h) => (
                <div key={h} className="grid grid-cols-[1fr_1fr] items-center gap-2 text-xs">
                  <span className="truncate text-muted" title={h}>
                    {h}
                  </span>
                  <select
                    className="input py-1 text-xs"
                    value={arquivo.mapping[h] ?? ""}
                    onChange={(e) =>
                      setArquivo({
                        ...arquivo,
                        mapping: { ...arquivo.mapping, [h]: e.target.value as AudienceField | "" },
                      })
                    }
                  >
                    {FIELD_LABELS.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {enviando && (
              <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full rounded-full bg-brand-500 transition-[width]"
                  style={{ width: `${progresso}%` }}
                />
              </div>
            )}

            <button className="btn-primary" disabled={enviando} onClick={importar}>
              {enviando ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {enviando ? `Importando… ${progresso}%` : "Importar"}
            </button>
          </>
        )}
      </div>

      {historico.length > 0 && (
        <div className="card p-0">
          <p className="border-b border-line px-4 py-2.5 text-sm font-bold">Importações anteriores</p>
          <ul className="divide-y divide-line text-sm">
            {historico.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{i.filename ?? "(sem nome)"}</span>
                  <span className="block text-xs text-muted">
                    {dateTime(i.createdAt)}
                    {i.createdBy ? ` · ${i.createdBy}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {formatNumber(i.rowsOk)} ok
                  {i.rowsError > 0 ? ` · ${formatNumber(i.rowsError)} com erro` : ""}
                </span>
                <span
                  className={clsx(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    i.status === "done"
                      ? "bg-emerald-100 text-emerald-700"
                      : i.status === "failed"
                        ? "bg-red-100 text-red-600"
                        : "bg-amber-100 text-amber-700",
                  )}
                >
                  {i.status === "done" ? "concluída" : i.status === "failed" ? "falhou" : "em curso"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
