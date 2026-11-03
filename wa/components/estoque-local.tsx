"use client";

// Estoque do pátio do lojista: os carros que ele tem na loja. A IA oferece
// estes primeiro e, se a loja quiser, também o estoque da rede CNV. Fica na
// mesma tabela dos usados da zerokm e não aparece na vitrine.

import { useCallback, useEffect, useState } from "react";
import { CarFront, Plus, Trash2 } from "lucide-react";

type Carro = {
  id: string;
  marca: string;
  modelo: string;
  ano: string;
  km: number;
  cor?: string;
  combustivel?: string;
  transmissao?: string;
  preco: number;
  opcionais?: string;
  observacoes?: string;
};

const VAZIO = {
  marca: "",
  modelo: "",
  ano: "",
  km: "",
  cor: "",
  combustivel: "Flex",
  transmissao: "Manual",
  preco: "",
  opcionais: "",
  observacoes: "",
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function EstoqueLocal({ canEdit }: { canEdit: boolean }) {
  const [itens, setItens] = useState<Carro[] | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [aberto, setAberto] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch("/api/wa/loja/estoque")
      .then((r) => r.json())
      .then((d) => setItens(d.items ?? []))
      .catch(() => setItens([]));
  }, []);
  useEffect(load, [load]);

  async function salvar() {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/wa/loja/estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tipoVeiculo: "carro", foraDoCatalogo: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Falha ao salvar");
      setForm(VAZIO);
      setAberto(false);
      load();
    } catch (err) {
      setNotice(`❌ ${err instanceof Error ? err.message : "Erro"}`);
    } finally {
      setSaving(false);
    }
  }

  async function remover(id: string) {
    if (!confirm("Tirar este carro do pátio (vendeu ou desistiu)?")) return;
    await fetch(`/api/wa/loja/estoque/${id}`, { method: "DELETE" });
    load();
  }

  const campo = (k: keyof typeof VAZIO, label: string, extra?: Record<string, string>) => (
    <label className="text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input className="input" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} {...extra} />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <CarFront size={20} className="text-brand-700" /> Estoque do pátio
          </h1>
          <p className="text-sm text-muted">
            Os carros da sua loja. A IA oferece estes primeiro — {itens?.length ?? 0} no pátio.
          </p>
        </div>
        {canEdit && (
          <button className="btn-dark px-3 py-1.5 text-sm" onClick={() => setAberto((v) => !v)}>
            <Plus size={14} /> Cadastrar carro
          </button>
        )}
      </div>

      {aberto && canEdit && (
        <section className="card space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {campo("marca", "Marca")}
            {campo("modelo", "Modelo / versão")}
            {campo("ano", "Ano (ex.: 21/22)")}
            {campo("km", "Km", { inputMode: "numeric" })}
            {campo("preco", "Preço (R$)", { inputMode: "numeric" })}
            {campo("cor", "Cor")}
            {campo("combustivel", "Combustível")}
            {campo("transmissao", "Câmbio")}
            {campo("opcionais", "Opcionais")}
          </div>
          {campo("observacoes", "Observações (a IA pode citar: único dono, revisado...)")}
          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={saving} onClick={salvar}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
            {notice && <p className="text-sm">{notice}</p>}
          </div>
        </section>
      )}

      {itens === null ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="card text-sm text-muted">Nenhum carro no pátio ainda.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {itens.map((c) => (
            <li key={c.id} className="card flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold">
                  {c.marca} {c.modelo} {c.ano}
                </span>
                <span className="block text-xs text-muted">
                  {[`${(c.km ?? 0).toLocaleString("pt-BR")} km`, c.transmissao, c.combustivel, c.cor]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="mt-1 block font-bold">{BRL.format(c.preco)}</span>
              </span>
              {canEdit && (
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => remover(c.id)} title="Tirar do pátio">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
