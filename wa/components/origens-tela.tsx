"use client";

// Origens: de onde vieram as conversas da loja no período e quantas viraram
// venda (etapa "ganho" do funil). O anúncio de clique para WhatsApp ou
// Messenger chega com a primeira mensagem e fica marcado na conversa; o que
// chegou sem anúncio aparece por campanha ou por canal.
//
// O id do clique (ctwa_clid) fica guardado em cada conversa de anúncio: é o
// que a API de Conversões da Meta pede para devolver a venda ao anúncio.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Check, ExternalLink, Loader2, Megaphone, Pencil, Signpost, X } from "lucide-react";
import { formatNumber, percent } from "@wa/lib/stages";
import { useWaPanel } from "@wa/components/wa-panel";

type Linha = {
  chave: string;
  fonte: "anuncio" | "campanha" | "direto";
  nome: string;
  canal: string | null;
  idOrigem: string | null;
  conversas: number;
  vendas: number;
  apelido: string | null;
  link: string | null;
  imagem: string | null;
};

type Resposta = {
  desde: string;
  ate: string;
  total: { conversas: number; vendas: number };
  porAnuncio: { conversas: number; vendas: number };
  linhas: Linha[];
  podeNomear: boolean;
};

const PERIODOS = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
  { dias: 365, rotulo: "12 meses" },
];

const CANAL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", sms: "SMS" };

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="card">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-muted">{detalhe}</p>}
    </div>
  );
}

function NomeDoAnuncio({ linha, podeNomear, onSalvo }: { linha: Linha; podeNomear: boolean; onSalvo: () => void }) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await fetch("/api/wa/origens", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idOrigem: linha.idOrigem, apelido: rascunho }),
    });
    setSalvando(false);
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setErro(b.error ?? "Não deu para salvar.");
      return;
    }
    setEditando(false);
    onSalvo();
  }

  if (editando) {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <input
          className="input min-w-0 flex-1 py-1 text-sm"
          value={rascunho}
          maxLength={80}
          autoFocus
          placeholder="Nome que a equipe reconhece"
          onChange={(e) => setRascunho(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") setEditando(false);
          }}
        />
        <button className="btn-primary px-2 py-1 text-xs" onClick={salvar} disabled={salvando} aria-label="Salvar nome">
          {salvando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
        </button>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditando(false)} aria-label="Cancelar">
          <X size={12} />
        </button>
        {erro && <span className="w-full text-[11px] text-red-600">{erro}</span>}
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate font-semibold">{linha.nome}</span>
      {podeNomear && linha.idOrigem && (
        <button
          type="button"
          onClick={() => {
            setRascunho(linha.apelido ?? "");
            setEditando(true);
          }}
          className="shrink-0 rounded p-0.5 text-muted hover:text-brand-700"
          title={linha.apelido ? "Mudar o nome" : "Dar um nome a este anúncio"}
          aria-label="Dar um nome"
        >
          <Pencil size={12} />
        </button>
      )}
      {linha.link && (
        <a href={linha.link} target="_blank" rel="noreferrer" className="shrink-0 text-muted hover:text-brand-700" title="Ver anúncio">
          <ExternalLink size={12} />
        </a>
      )}
    </span>
  );
}

export function OrigensTela() {
  const { base } = useWaPanel();
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/wa/origens?dias=${dias}`);
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "Não deu para carregar as origens.");
      setDados(b as Resposta);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para carregar as origens.");
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const total = dados?.total ?? { conversas: 0, vendas: 0 };
  const anuncio = dados?.porAnuncio ?? { conversas: 0, vendas: 0 };
  const semAnuncio = { conversas: total.conversas - anuncio.conversas, vendas: total.vendas - anuncio.vendas };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="brand-kicker">Atendimento</p>
          <h1 className="mt-1 text-2xl font-bold">Origens</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            De onde vieram as conversas do período: anúncio de clique para WhatsApp ou Messenger, campanha ou contato
            direto. Venda é a conversa que está na etapa ganho do funil.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              onClick={() => setDias(p.dias)}
              className={clsx(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                dias === p.dias ? "pill-active" : "border border-line bg-paper text-muted",
              )}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      {erro && <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 text-xs text-red-600">{erro}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Numero
          rotulo="Conversas no período"
          valor={formatNumber(total.conversas)}
          detalhe={`${formatNumber(total.vendas)} venda${total.vendas === 1 ? "" : "s"} (${percent(total.vendas, total.conversas)})`}
        />
        <Numero
          rotulo="Por anúncio"
          valor={formatNumber(anuncio.conversas)}
          detalhe={`${formatNumber(anuncio.vendas)} venda${anuncio.vendas === 1 ? "" : "s"} (${percent(anuncio.vendas, anuncio.conversas)})`}
        />
        <Numero
          rotulo="Sem anúncio"
          valor={formatNumber(semAnuncio.conversas)}
          detalhe={`${formatNumber(semAnuncio.vendas)} venda${semAnuncio.vendas === 1 ? "" : "s"} (${percent(semAnuncio.vendas, semAnuncio.conversas)})`}
        />
      </div>

      <div className="card overflow-hidden p-0">
        {carregando && !dados ? (
          <p className="flex items-center gap-2 px-4 py-8 text-sm text-muted">
            <Loader2 size={15} className="animate-spin" /> Carregando…
          </p>
        ) : !dados || dados.linhas.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted">
            <Signpost className="mx-auto mb-2 opacity-40" />
            Nenhuma conversa no período. Quando alguém tocar num anúncio de clique para WhatsApp, a conversa aparece
            aqui com o anúncio.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-semibold">Origem</th>
                  <th className="px-4 py-2 font-semibold">Canal</th>
                  <th className="px-4 py-2 text-right font-semibold">Conversas</th>
                  <th className="px-4 py-2 text-right font-semibold">Vendas</th>
                  <th className="px-4 py-2 text-right font-semibold">Conversão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {dados.linhas.map((l) => (
                  <tr key={l.chave} className={clsx(carregando && "opacity-60")}>
                    <td className="max-w-[22rem] px-4 py-2.5">
                      <span className="flex items-center gap-2.5">
                        {l.fonte === "anuncio" ? (
                          l.imagem ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={l.imagem} alt="" className="h-9 w-9 shrink-0 rounded-lg bg-canvas object-cover" />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
                              <Megaphone size={15} />
                            </span>
                          )
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas text-muted">
                            <Signpost size={15} />
                          </span>
                        )}
                        {l.fonte === "anuncio" ? (
                          <NomeDoAnuncio linha={l} podeNomear={dados.podeNomear} onSalvo={carregar} />
                        ) : (
                          <span className="truncate text-ink-700">{l.nome}</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">{l.canal ? CANAL[l.canal] ?? l.canal : ""}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(l.conversas)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-emerald-700">{formatNumber(l.vendas)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">{percent(l.vendas, l.conversas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted">
        Cada conversa conta uma vez: no anúncio, se chegou por ele dentro do período; senão, na campanha ou no canal em
        que começou. Na{" "}
        <Link href={`${base}/central`} className="font-semibold text-brand-700 hover:underline">
          Central
        </Link>
        , quem chegou por anúncio tem o selo Anúncio e o cartão do anúncio no topo da conversa.
      </p>
    </div>
  );
}
