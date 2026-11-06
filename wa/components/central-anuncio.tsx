"use client";

// Origem do lead na Central: o cartão do anúncio no topo da conversa e o selo
// "Anúncio" na fila.
//
// A linha principal do cartão é o que de fato identifica o criativo: o nome
// que a gestão deu, o texto do anúncio, e só então o título (a Meta repete
// "Converse conosco" em dezenas de anúncios diferentes). A gestão nomeia uma
// vez e o nome vale para todas as conversas daquele anúncio.

import { useState } from "react";
import clsx from "clsx";
import { Check, ExternalLink, Megaphone, Pencil } from "lucide-react";
import { NOME_DO_CANAL_DA_ORIGEM, tituloGenerico } from "@wa/lib/origem";
import type { CanalDaOrigem } from "@wa/models/origem";

export type OrigemNaTela = {
  canal: CanalDaOrigem;
  tipoOrigem: string | null;
  idOrigem: string | null;
  titulo: string | null;
  texto: string | null;
  link: string | null;
  midia: "image" | "video" | null;
  imagem: string | null;
  em: string;
  nome: string;
  apelido: string | null;
  conversasDoAnuncio: number | null;
  temClique: boolean;
};

function diaCurto(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

export function CartaoDoAnuncio({
  origem,
  podeNomear,
  onNomeado,
}: {
  origem: OrigemNaTela;
  podeNomear: boolean;
  onNomeado: () => void;
}) {
  const [semImagem, setSemImagem] = useState(false);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ehPost = origem.tipoOrigem === "post";
  const principal =
    origem.apelido ?? (origem.texto || (!tituloGenerico(origem.titulo) ? origem.titulo : null)) ?? origem.nome;
  const secundaria = origem.apelido ? origem.texto : null;

  async function salvar() {
    if (!origem.idOrigem) return;
    setSalvando(true);
    setErro(null);
    const r = await fetch("/api/wa/origens", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idOrigem: origem.idOrigem, apelido: rascunho }),
    });
    setSalvando(false);
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setErro(b.error ?? "Não deu para salvar o nome.");
      return;
    }
    setEditando(false);
    onNomeado();
  }

  return (
    <div className="mx-auto mb-2 flex w-full max-w-xl gap-3 rounded-2xl border border-line bg-paper p-3">
      {origem.imagem && !semImagem ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={origem.imagem}
          alt=""
          onError={() => setSemImagem(true)}
          className="h-16 w-16 shrink-0 rounded-xl bg-canvas object-cover"
        />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted">
          <Megaphone size={22} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-brand-700">
          Chegou por {ehPost ? "um post" : "um anúncio"}
          {origem.midia === "video" ? " em vídeo" : ""} · {NOME_DO_CANAL_DA_ORIGEM[origem.canal]} · {diaCurto(origem.em)}
          {/* Conta cada chegada pelo anúncio (wa/lib/origem-loja.ts), e a mesma
              pessoa pode clicar mais de uma vez: são chegadas, não contatos. */}
          {(origem.conversasDoAnuncio ?? 0) > 1 && (
            <span className="font-normal text-muted"> · {origem.conversasDoAnuncio} chegadas por ele</span>
          )}
        </p>
        {editando ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              maxLength={80}
              autoFocus
              placeholder="Ex.: Onix 2024, vídeo do pátio"
              aria-label="Nome deste anúncio"
              className="input min-w-0 flex-1 py-1.5 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") salvar();
                if (e.key === "Escape") setEditando(false);
              }}
            />
            <button type="button" onClick={salvar} disabled={salvando} className="btn-primary px-3 py-1.5 text-xs">
              <Check size={13} /> {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        ) : (
          <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-ink-900">
            {principal}
            {podeNomear && origem.idOrigem && (
              <button
                type="button"
                onClick={() => {
                  setRascunho(origem.apelido ?? "");
                  setEditando(true);
                }}
                title={origem.apelido ? "Mudar o nome deste anúncio" : "Dar um nome a este anúncio"}
                className="ml-1.5 inline-flex items-center gap-1 align-middle text-[11px] font-semibold text-brand-700 hover:underline"
              >
                <Pencil size={11} />
                {origem.apelido ? "" : "dar um nome"}
              </button>
            )}
          </p>
        )}
        {secundaria && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{secundaria}</p>}
        {erro && <p className="mt-1 text-[11px] text-red-600">{erro}</p>}
        {origem.link && (
          <a
            href={origem.link}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline"
          >
            Ver {ehPost ? "post" : "anúncio"} <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  );
}

/** Selo da fila: a conversa chegou por anúncio. */
export function SeloDeOrigem({ nome, className }: { nome: string; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex max-w-[9rem] items-center gap-0.5 truncate rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700",
        className,
      )}
      title={`Chegou pelo anúncio: ${nome}`}
    >
      <Megaphone size={9} className="shrink-0" />
      <span className="truncate">Anúncio</span>
    </span>
  );
}
