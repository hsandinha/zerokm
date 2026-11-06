"use client";

// Estoque do pátio do lojista: os carros que ele tem na loja. A IA oferece
// estes primeiro (só os disponíveis) e, se a loja quiser, também o estoque da
// rede CNV. Fica na mesma tabela dos usados da zerokm e não aparece na vitrine.
//
// No topo, o painel do dono: quanto dinheiro está parado no pátio, em que
// marca, o que passou de 60 dias e o que está sem foto. Na lista, a situação
// troca direto (reservou, vendeu), sem abrir o cadastro. Cadastro e edição
// abrem em modal, com até 15 fotos (a primeira é a capa), reduzidas no
// navegador antes de subir.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  CarFront,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  ImagePlus,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { REPASSE_COMBUSTIVEIS, REPASSE_TRANSMISSOES } from "@/lib/utils/repasse";
import {
  DIAS_PARADO,
  MAX_FOTOS,
  SITUACOES,
  anoDoFormulario,
  diasNoPatio,
  painelDoEstoque,
  type LinhaDoPainel,
  type PainelDoEstoque,
  type SituacaoCarro,
} from "@wa/lib/estoque-ficha";
import { reduzirFoto } from "@wa/lib/foto-no-navegador";
import type { CarroLocal } from "@wa/lib/estoque-local";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const TOM_DA_SITUACAO: Record<SituacaoCarro, string> = {
  disponivel: "border-emerald-200 bg-emerald-50 text-emerald-700",
  reservado: "border-amber-200 bg-amber-50 text-amber-800",
  vendido: "border-line bg-canvas text-muted",
  pausado: "border-line bg-canvas text-muted",
};

const tituloDo = (c: Pick<CarroLocal, "marca" | "modelo" | "versao">) =>
  [c.marca, c.modelo, c.versao].filter(Boolean).join(" ");

type Filtro = "todos" | SituacaoCarro | "parados" | "sem_foto";

export function EstoqueLocal({ canEdit }: { canEdit: boolean }) {
  const [itens, setItens] = useState<CarroLocal[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<CarroLocal | "novo" | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch("/api/wa/loja/estoque")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Falha ao carregar o estoque");
        setItens(d.items ?? []);
      })
      .catch((e: Error) => {
        setErro(e.message);
        setItens((atual) => atual ?? []);
      });
  }, []);
  useEffect(load, [load]);

  const painel = useMemo(
    () =>
      painelDoEstoque(
        (itens ?? []).map((c) => ({
          id: c.id,
          titulo: [tituloDo(c), c.ano].filter(Boolean).join(" "),
          marca: c.marca,
          preco: c.preco,
          situacao: c.situacao,
          fotos: c.fotos.length,
          createdAt: c.createdAt,
        })),
      ),
    [itens],
  );

  const visiveis = useMemo(() => {
    const agora = new Date();
    const termo = busca.trim().toLowerCase();
    return (itens ?? []).filter((c) => {
      if (filtro === "parados" && !(c.situacao === "disponivel" && diasNoPatio(c.createdAt, agora) > DIAS_PARADO)) return false;
      if (filtro === "sem_foto" && !(c.situacao === "disponivel" && c.fotos.length === 0)) return false;
      if (filtro !== "todos" && filtro !== "parados" && filtro !== "sem_foto" && c.situacao !== filtro) return false;
      if (!termo) return true;
      return [c.marca, c.modelo, c.versao, c.cor, c.placaInterna, c.ano].join(" ").toLowerCase().includes(termo);
    });
  }, [itens, filtro, busca]);

  async function mudarSituacao(c: CarroLocal, situacao: SituacaoCarro) {
    const antes = c.situacao;
    setItens((lista) => lista?.map((x) => (x.id === c.id ? { ...x, situacao } : x)) ?? null);
    const r = await fetch(`/api/wa/loja/estoque/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ situacao }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setItens((lista) => lista?.map((x) => (x.id === c.id ? { ...x, situacao: antes } : x)) ?? null);
      setErro(d.error ?? "Não deu para trocar a situação.");
    }
  }

  function verLista(f: Filtro) {
    setFiltro(f);
    listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const contagem = (s: SituacaoCarro) => (itens ?? []).filter((c) => c.situacao === s).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <CarFront size={20} className="text-brand-700" /> Estoque do pátio
          </h1>
          <p className="text-sm text-muted">
            Os carros da sua loja. A IA oferece primeiro os disponíveis: {painel.quantidade} à venda agora.
          </p>
        </div>
        {canEdit && (
          <button className="btn-dark px-3 py-1.5 text-sm" onClick={() => setEditando("novo")}>
            <Plus size={14} /> Cadastrar carro
          </button>
        )}
      </div>

      {erro && (
        <p className="flex items-start justify-between gap-3 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
          <button onClick={() => setErro(null)} aria-label="Fechar aviso">
            <X size={14} />
          </button>
        </p>
      )}

      {canEdit && itens && itens.length > 0 && <PainelDoPatio painel={painel} onVer={verLista} />}

      <div ref={listaRef} className="flex flex-wrap items-center gap-2">
        <label className="relative block min-w-[12rem] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input py-2 pl-8 text-sm"
            placeholder="Buscar por marca, modelo, cor ou placa"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["todos", `Todos (${itens?.length ?? 0})`],
              ...SITUACOES.map((s) => [s.chave, `${s.rotulo} (${contagem(s.chave)})`] as const),
              ...(filtro === "parados" ? [["parados", `Mais de ${DIAS_PARADO} dias`] as const] : []),
              ...(filtro === "sem_foto" ? [["sem_foto", "Sem foto"] as const] : []),
            ] as Array<readonly [Filtro, string]>
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFiltro(k)}
              className={clsx(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                filtro === k ? "pill-active" : "border border-line bg-paper text-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {itens === null ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={14} className="animate-spin" /> Carregando…
        </p>
      ) : itens.length === 0 ? (
        <div className="card text-sm text-muted">
          Nenhum carro no pátio ainda.{" "}
          {canEdit && (
            <button className="font-semibold text-ink-900 underline" onClick={() => setEditando("novo")}>
              Cadastre o primeiro
            </button>
          )}
        </div>
      ) : visiveis.length === 0 ? (
        <p className="card text-sm text-muted">Nenhum carro com esse filtro.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((c) => (
            <CartaoDoCarro
              key={c.id}
              carro={c}
              canEdit={canEdit}
              onSituacao={(s) => mudarSituacao(c, s)}
              onEditar={() => setEditando(c)}
            />
          ))}
        </ul>
      )}

      {editando && (
        <CarroModal
          carro={editando === "novo" ? null : editando}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CartaoDoCarro({
  carro: c,
  canEdit,
  onSituacao,
  onEditar,
}: {
  carro: CarroLocal;
  canEdit: boolean;
  onSituacao: (s: SituacaoCarro) => void;
  onEditar: () => void;
}) {
  const dias = diasNoPatio(c.createdAt, new Date());
  const capa = c.fotos[0]?.url;
  return (
    <li className={clsx("card flex gap-3 p-3 text-sm", c.situacao !== "disponivel" && c.situacao !== "reservado" && "opacity-70")}>
      <button
        type="button"
        className="relative flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-canvas"
        onClick={canEdit ? onEditar : undefined}
        aria-label={canEdit ? "Editar o carro" : undefined}
        tabIndex={canEdit ? 0 : -1}
      >
        {capa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capa} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <ImageOff size={18} className="text-muted" />
        )}
        {c.fotos.length > 1 && (
          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">
            {c.fotos.length} fotos
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold" title={tituloDo(c)}>
          {tituloDo(c)}
        </p>
        <p className="truncate text-xs text-muted">
          {[c.ano, `${(c.km ?? 0).toLocaleString("pt-BR")} km`, c.transmissao, c.combustivel, c.cor].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted">
          {[c.placaInterna || null, `${dias} ${dias === 1 ? "dia" : "dias"} no pátio`, c.unicoDono ? "único dono" : null, c.aceitaTroca ? "aceita troca" : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="font-bold tabular-nums">{BRL.format(c.preco)}</span>
          <select
            aria-label="Situação"
            value={c.situacao}
            onChange={(e) => onSituacao(e.target.value as SituacaoCarro)}
            className={clsx("rounded-full border px-2 py-0.5 text-xs font-semibold", TOM_DA_SITUACAO[c.situacao])}
          >
            {SITUACOES.map((s) => (
              <option key={s.chave} value={s.chave}>
                {s.rotulo}
              </option>
            ))}
          </select>
          {canEdit && (
            <button className="btn-ghost ml-auto px-2 py-1 text-xs" onClick={onEditar} title="Editar">
              <Pencil size={13} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// ── Painel do dono ───────────────────────────────────────────

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  alerta,
  onClick,
}: {
  icon: typeof Landmark;
  label: string;
  value: string;
  hint?: string;
  alerta?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={clsx("card flex items-start gap-3 p-3 text-left", onClick && "transition hover:border-ink-300")}
    >
      <span
        className={clsx(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          alerta ? "bg-amber-100 text-amber-700" : "bg-brand-100 text-brand-700",
        )}
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-muted">{label}</span>
        <span className="block text-lg font-bold tabular-nums">{value}</span>
        {hint && <span className="block truncate text-[11px] text-muted">{hint}</span>}
      </span>
    </Tag>
  );
}

function ListaDoPainel({ titulo, vazio, linhas }: { titulo: string; vazio: string; linhas: LinhaDoPainel[] }) {
  return (
    <div className="card p-3">
      <p className="mb-2 text-xs font-semibold text-ink-800">{titulo}</p>
      {linhas.length === 0 ? (
        <p className="text-xs text-muted">{vazio}</p>
      ) : (
        <ul className="divide-y divide-line">
          {linhas.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
              <span className="min-w-0 truncate">{l.titulo}</span>
              <span className="flex shrink-0 gap-3 tabular-nums text-muted">
                <span>{l.dias} dias</span>
                <span className="w-20 text-right text-ink-800">{BRL.format(l.preco)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PainelDoPatio({ painel, onVer }: { painel: PainelDoEstoque; onVer: (f: Filtro) => void }) {
  const marcas = painel.porMarca.slice(0, 6);
  const outras = painel.porMarca.slice(6);
  if (outras.length) {
    marcas.push({
      marca: `Outras (${outras.length})`,
      quantidade: outras.reduce((s, m) => s + m.quantidade, 0),
      capital: outras.reduce((s, m) => s + m.capital, 0),
    });
  }
  const maior = Math.max(1, ...marcas.map((m) => m.quantidade));
  return (
    <section aria-label="Painel do estoque" className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={Landmark}
          label="Capital parado"
          value={BRL.format(painel.capital)}
          hint={`${painel.quantidade} disponíveis${painel.reservados ? ` · ${painel.reservados} reservados` : ""}`}
          onClick={() => onVer("disponivel")}
        />
        <Stat
          icon={CarFront}
          label="Marcas no pátio"
          value={String(painel.porMarca.length)}
          hint={painel.porMarca[0] ? `Mais carros: ${painel.porMarca[0].marca}` : undefined}
        />
        <Stat
          icon={Timer}
          label={`Há mais de ${DIAS_PARADO} dias`}
          value={String(painel.parados.quantidade)}
          hint={painel.parados.quantidade ? `${BRL.format(painel.parados.capital)} parados` : "Nenhum carro encalhado"}
          alerta={painel.parados.quantidade > 0}
          onClick={painel.parados.quantidade ? () => onVer("parados") : undefined}
        />
        <Stat
          icon={ImageOff}
          label="Sem foto"
          value={String(painel.semFoto.quantidade)}
          hint={painel.semFoto.quantidade ? "Carro sem foto quase não recebe contato" : "Todos com foto"}
          alerta={painel.semFoto.quantidade > 0}
          onClick={painel.semFoto.quantidade ? () => onVer("sem_foto") : undefined}
        />
      </div>
      {painel.quantidade > 0 && (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="card p-3">
            <p className="mb-2 text-xs font-semibold text-ink-800">Carros por marca</p>
            <ul className="space-y-2">
              {marcas.map((m) => (
                <li key={m.marca}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate">
                      {m.marca} <span className="text-muted">· {m.quantidade}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted">{BRL.format(m.capital)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${Math.max(4, Math.round((m.quantidade / maior) * 100))}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <ListaDoPainel
            titulo={`Há mais de ${DIAS_PARADO} dias no pátio`}
            vazio={`Nenhum carro passou de ${DIAS_PARADO} dias.`}
            linhas={painel.parados.lista}
          />
          <ListaDoPainel titulo="Disponíveis sem foto" vazio="Todos os disponíveis têm foto." linhas={painel.semFoto.lista} />
        </div>
      )}
    </section>
  );
}

// ── Cadastro / edição ────────────────────────────────────────

type Form = {
  marca: string;
  modelo: string;
  versao: string;
  anoFabricacao: string;
  anoModelo: string;
  km: string;
  preco: string;
  cor: string;
  combustivel: string;
  transmissao: string;
  portas: string;
  opcionais: string;
  observacoes: string;
  aceitaTroca: boolean;
  unicoDono: boolean;
  placaInterna: string;
  situacao: SituacaoCarro;
  codigoFipe: string;
  descricaoFipe: string;
  precoFipe: string;
  referenciaFipe: string;
};

const milhar = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("pt-BR"));

function formDo(c: CarroLocal | null): Form {
  return {
    marca: c?.marca ?? "",
    modelo: c?.modelo ?? "",
    versao: c?.versao ?? "",
    anoFabricacao: c?.anoFabricacao ? String(c.anoFabricacao) : "",
    anoModelo: c?.anoModelo ? String(c.anoModelo) : "",
    km: c ? milhar(c.km) : "",
    preco: c ? milhar(c.preco) : "",
    cor: c?.cor ?? "",
    combustivel: c?.combustivel || "Flex",
    transmissao: c?.transmissao || "Manual",
    portas: c?.portas ? String(c.portas) : "4",
    opcionais: c?.opcionais ?? "",
    observacoes: c?.observacoes ?? "",
    aceitaTroca: c?.aceitaTroca ?? false,
    unicoDono: c?.unicoDono ?? false,
    placaInterna: c?.placaInterna ?? "",
    situacao: c?.situacao ?? "disponivel",
    codigoFipe: c?.codigoFipe ?? "",
    descricaoFipe: c?.descricaoFipe ?? "",
    precoFipe: c?.precoFipe != null ? milhar(c.precoFipe) : "",
    referenciaFipe: c?.referenciaFipe ?? "",
  };
}

type FotoDoForm = {
  chave: string;
  /** Já gravada (WaFotoEstoque). null = nova, ainda no navegador. */
  id: string | null;
  url: string;
  blob: Blob | null;
  width?: number;
  height?: number;
};

let seq = 0;
const novaChave = () => `f${++seq}`;

function CarroModal({ carro, onClose, onSaved }: { carro: CarroLocal | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Form>(() => formDo(carro));
  // Depois do primeiro salvamento de um carro novo, os próximos editam ele
  // (se uma foto falhar no meio, tentar de novo não cria outro carro).
  const [carroId, setCarroId] = useState<string | null>(carro?.id ?? null);
  const [fotos, setFotos] = useState<FotoDoForm[]>(() =>
    (carro?.fotos ?? []).map((f) => ({ chave: novaChave(), id: f.id, url: f.url, blob: null })),
  );
  const [preparando, setPreparando] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [fipeAberta, setFipeAberta] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const previas = useRef<string[]>([]);

  useEffect(() => () => previas.current.forEach((u) => URL.revokeObjectURL(u)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !salvando && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, salvando]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function adicionarFotos(lista: FileList | null) {
    setErro(null);
    const arquivos = Array.from(lista ?? []);
    if (arquivoRef.current) arquivoRef.current.value = "";
    if (!arquivos.length) return;
    const vagas = MAX_FOTOS - fotos.length;
    if (arquivos.length > vagas) setErro(`No máximo ${MAX_FOTOS} fotos: ${arquivos.length - vagas} ficaram de fora.`);
    setPreparando((n) => n + Math.min(arquivos.length, vagas));
    for (const f of arquivos.slice(0, Math.max(0, vagas))) {
      try {
        const r = await reduzirFoto(f);
        const url = URL.createObjectURL(r.blob);
        previas.current.push(url);
        setFotos((atual) =>
          atual.length >= MAX_FOTOS
            ? atual
            : [...atual, { chave: novaChave(), id: null, url, blob: r.blob, width: r.width, height: r.height }],
        );
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setPreparando((n) => n - 1);
      }
    }
  }

  function mover(i: number, d: -1 | 1) {
    setFotos((atual) => {
      const j = i + d;
      if (j < 0 || j >= atual.length) return atual;
      const copia = [...atual];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  function fazerCapa(i: number) {
    setFotos((atual) => [atual[i], ...atual.filter((_, k) => k !== i)]);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando || preparando > 0) return;
    setErro(null);
    if (!form.marca.trim() || !form.modelo.trim()) return setErro("Preencha marca e modelo.");
    if (!form.anoModelo.trim()) return setErro("Preencha o ano do modelo.");
    setSalvando(true);
    setProgresso("Salvando a ficha…");
    const corpo = {
      tipoVeiculo: "carro",
      marca: form.marca,
      modelo: form.modelo,
      versao: form.versao,
      ano: anoDoFormulario(form.anoFabricacao, form.anoModelo),
      km: form.km,
      preco: form.preco,
      cor: form.cor,
      combustivel: form.combustivel,
      transmissao: form.transmissao,
      portas: form.portas,
      opcionais: form.opcionais,
      observacoes: form.observacoes,
      aceitaTroca: form.aceitaTroca,
      unicoDono: form.unicoDono,
      placaInterna: form.placaInterna,
      situacao: form.situacao,
      codigoFipe: form.codigoFipe,
      descricaoFipe: form.descricaoFipe,
      precoFipe: form.precoFipe,
      referenciaFipe: form.referenciaFipe,
    };
    try {
      let id = carroId;
      const r = await fetch(id ? `/api/wa/loja/estoque/${id}` : "/api/wa/loja/estoque", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Falha ao salvar");
      id = d.id as string;
      setCarroId(id);

      const gravarOrdem = async (lista: string[]) => {
        const o = await fetch(`/api/wa/loja/estoque/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fotos: lista }),
        });
        if (!o.ok) {
          const od = await o.json().catch(() => ({}));
          throw new Error(od.error ?? "Falha ao arrumar as fotos");
        }
      };

      // As que saíram vão embora antes de subir as novas: senão um carro com
      // 15 fotos não consegue trocar nenhuma (o limite conta as antigas).
      let noServidor = ((d.fotos ?? []) as Array<{ id: string }>).map((f) => f.id);
      const mantidas = fotos.map((f) => f.id).filter((x): x is string => Boolean(x) && noServidor.includes(x as string));
      if (mantidas.length !== noServidor.length) {
        setProgresso("Tirando as fotos removidas…");
        await gravarOrdem(mantidas);
        noServidor = mantidas;
      }

      // Fotos novas, uma de cada vez e na ordem da tela. A que subiu guarda o
      // id: se outra falhar, tentar de novo não manda a mesma duas vezes.
      // O servidor põe cada foto nova no fim da lista dele.
      const ordem: string[] = [];
      const novas = fotos.filter((f) => !f.id).length;
      let n = 0;
      for (const f of fotos) {
        if (f.id) {
          if (noServidor.includes(f.id)) ordem.push(f.id);
          continue;
        }
        if (!f.blob) continue;
        n++;
        setProgresso(`Enviando foto ${n} de ${novas}…`);
        const fd = new FormData();
        fd.set("file", f.blob, "carro.jpg");
        if (f.width) fd.set("width", String(f.width));
        if (f.height) fd.set("height", String(f.height));
        const up = await fetch(`/api/wa/loja/estoque/${id}/fotos`, { method: "POST", body: fd });
        const ud = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error(ud.error ?? "Falha ao enviar a foto");
        const fotoId = ud.id as string;
        setFotos((atual) => atual.map((x) => (x.chave === f.chave ? { ...x, id: fotoId } : x)));
        ordem.push(fotoId);
        noServidor = [...noServidor, fotoId];
      }

      // Ordem final (a capa é a primeira): só grava se a lista da tela for
      // diferente da que ficou no servidor.
      if (ordem.join() !== noServidor.join()) {
        setProgresso("Arrumando as fotos…");
        await gravarOrdem(ordem);
      }
      onSaved();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
      setProgresso(null);
    }
  }

  async function excluir() {
    if (!carroId) return;
    setSalvando(true);
    const r = await fetch(`/api/wa/loja/estoque/${carroId}`, { method: "DELETE" });
    setSalvando(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErro(d.error ?? "Falha ao excluir");
      return;
    }
    onSaved();
  }

  const campo = (k: keyof Form, label: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="block text-xs font-semibold text-ink-800">
      {label}
      <input
        className="input mt-1 w-full"
        value={String(form[k])}
        onChange={(e) => set(k, e.target.value as never)}
        disabled={salvando}
        {...extra}
      />
    </label>
  );

  const escolha = (k: "combustivel" | "transmissao" | "portas", label: string, opcoes: string[]) => (
    <label className="block text-xs font-semibold text-ink-800">
      {label}
      <select className="input mt-1 w-full" value={form[k]} onChange={(e) => set(k, e.target.value)} disabled={salvando}>
        {[...new Set([...(form[k] && !opcoes.includes(form[k]) ? [form[k]] : []), ...opcoes])].map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={() => !salvando && onClose()} />
      <form
        onSubmit={salvar}
        className="relative flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <CarFront size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{carro ? "Editar carro" : "Cadastrar carro no pátio"}</p>
            <p className="mt-0.5 text-xs text-muted">
              A equipe manda na conversa com as fotos e a ficha, e a IA oferece com estes dados enquanto estiver disponível.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-1.5 text-muted hover:bg-canvas"
            onClick={onClose}
            disabled={salvando}
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          {/* Fotos */}
          <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold text-ink-800">Fotos</p>
              <p className="text-[11px] text-muted">
                {fotos.length}/{MAX_FOTOS} · a primeira é a capa
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {fotos.map((f, i) => (
                <div key={f.chave} className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      Capa
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/60 to-transparent p-1">
                    <span className="flex gap-0.5">
                      <button
                        type="button"
                        onClick={() => mover(i, -1)}
                        disabled={i === 0 || salvando}
                        className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-30"
                        aria-label="Mover para a esquerda"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => mover(i, 1)}
                        disabled={i === fotos.length - 1 || salvando}
                        className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-30"
                        aria-label="Mover para a direita"
                      >
                        <ChevronRight size={14} />
                      </button>
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => fazerCapa(i)}
                          disabled={salvando}
                          className="rounded p-1 text-white hover:bg-white/20"
                          aria-label="Usar como capa"
                          title="Usar como capa"
                        >
                          <Star size={14} />
                        </button>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFotos((atual) => atual.filter((x) => x.chave !== f.chave))}
                      disabled={salvando}
                      className="rounded p-1 text-white hover:bg-red-500/70"
                      aria-label="Tirar a foto"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {Array.from({ length: preparando }).map((_, i) => (
                <div key={`p${i}`} className="flex aspect-[4/3] items-center justify-center rounded-xl bg-canvas ring-1 ring-line">
                  <Loader2 size={16} className="animate-spin text-muted" />
                </div>
              ))}
              {fotos.length + preparando < MAX_FOTOS && (
                <button
                  type="button"
                  onClick={() => arquivoRef.current?.click()}
                  disabled={salvando}
                  className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-xs text-muted transition hover:border-ink-400 hover:text-ink-900"
                >
                  <ImagePlus size={18} />
                  Adicionar fotos
                </button>
              )}
            </div>
            <input
              ref={arquivoRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/heic"
              className="hidden"
              onChange={(e) => adicionarFotos(e.target.files)}
            />
          </section>

          {/* FIPE */}
          <section className="rounded-2xl border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 text-xs">
                <p className="font-semibold text-ink-800">Tabela FIPE</p>
                <p className="text-muted">
                  {form.codigoFipe
                    ? [`${form.codigoFipe}`, form.descricaoFipe, form.precoFipe ? `R$ ${form.precoFipe}` : null, form.referenciaFipe || null]
                        .filter(Boolean)
                        .join(" · ")
                    : "Opcional: preenche marca, modelo, versão, ano e combustível e guarda o preço FIPE (só a equipe vê)."}
                </p>
              </div>
              <span className="flex gap-1">
                {form.codigoFipe && (
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() => setForm((f) => ({ ...f, codigoFipe: "", descricaoFipe: "", precoFipe: "", referenciaFipe: "" }))}
                  >
                    Tirar vínculo
                  </button>
                )}
                <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setFipeAberta((v) => !v)}>
                  {fipeAberta ? "Fechar" : "Buscar na FIPE"}
                </button>
              </span>
            </div>
            {fipeAberta && (
              <BuscaFipe
                onEscolher={(d) => {
                  setForm((f) => ({ ...f, ...d }));
                  setFipeAberta(false);
                }}
              />
            )}
          </section>

          {/* Ficha */}
          <section className="grid gap-3 sm:grid-cols-3">
            {campo("marca", "Marca", { placeholder: "CHEVROLET", required: true })}
            {campo("modelo", "Modelo", { placeholder: "ONIX", required: true })}
            {campo("versao", "Versão", { placeholder: "LTZ 1.0 TURBO" })}
            {campo("anoFabricacao", "Ano de fabricação", { inputMode: "numeric", placeholder: "2021", maxLength: 4 })}
            {campo("anoModelo", "Ano do modelo", { inputMode: "numeric", placeholder: "2022", maxLength: 4, required: true })}
            {campo("km", "Quilometragem", { inputMode: "numeric", placeholder: "35.000" })}
            {escolha("transmissao", "Câmbio", REPASSE_TRANSMISSOES)}
            {escolha("combustivel", "Combustível", REPASSE_COMBUSTIVEIS)}
            {escolha("portas", "Portas", ["2", "3", "4", "5"])}
            {campo("cor", "Cor", { placeholder: "Prata" })}
            {campo("preco", "Preço de venda (R$)", { inputMode: "numeric", placeholder: "79.900" })}
            <label className="block text-xs font-semibold text-ink-800">
              Situação
              <select
                className="input mt-1 w-full"
                value={form.situacao}
                onChange={(e) => set("situacao", e.target.value as SituacaoCarro)}
                disabled={salvando}
              >
                {SITUACOES.map((s) => (
                  <option key={s.chave} value={s.chave}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.unicoDono} onChange={(e) => set("unicoDono", e.target.checked)} disabled={salvando} />
              Único dono
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.aceitaTroca}
                onChange={(e) => set("aceitaTroca", e.target.checked)}
                disabled={salvando}
              />
              Aceita troca
            </label>
          </section>

          <section className="grid gap-3">
            {campo("opcionais", "Opcionais", { placeholder: "Ar-condicionado, multimídia, câmera de ré" })}
            {campo("observacoes", "Observações (a IA pode citar: revisado, garantia de fábrica...)")}
          </section>

          <section className="grid gap-3 rounded-2xl bg-canvas p-3 sm:grid-cols-3">
            <p className="text-xs text-muted sm:col-span-3">Só a equipe vê: não vai para a IA nem para o cliente.</p>
            {campo("placaInterna", "Placa", { placeholder: "ABC1D23", maxLength: 8 })}
            {campo("precoFipe", "Preço FIPE (R$)", { inputMode: "numeric" })}
            {campo("referenciaFipe", "Referência FIPE", { placeholder: "novembro de 2026" })}
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          {carroId && carro && !confirmarExclusao && (
            <button type="button" className="btn-ghost px-3 py-2 text-xs text-red-600" onClick={() => setConfirmarExclusao(true)} disabled={salvando}>
              <Trash2 size={13} /> Excluir
            </button>
          )}
          {confirmarExclusao && (
            <span className="flex items-center gap-2 text-xs">
              Excluir do cadastro? (vendido pode ficar como Vendido)
              <button type="button" className="btn-ghost px-2 py-1 text-xs text-red-600" onClick={excluir} disabled={salvando}>
                Excluir
              </button>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setConfirmarExclusao(false)}>
                Não
              </button>
            </span>
          )}
          <span className="min-w-0 flex-1 text-xs">
            {erro ? <span className="text-red-600">{erro}</span> : progresso ? <span className="text-muted">{progresso}</span> : null}
          </span>
          <button type="button" className="btn-ghost px-4 py-2 text-xs" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className="btn-dark px-4 py-2 text-xs" disabled={salvando || preparando > 0}>
            {salvando ? <Loader2 size={13} className="animate-spin" /> : null} Salvar
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Busca na FIPE (marca, modelo, ano) ───────────────────────

type OpcaoFipe = { code: string; name: string };
type DetalheFipe = { brand: string; model: string; modelYear: number; fuel: string; codeFipe: string; referenceMonth: string; price: string };

async function fipe<T>(params: Record<string, string>): Promise<T> {
  const r = await fetch(`/api/wa/loja/estoque/fipe?${new URLSearchParams({ type: "cars", ...params })}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? "FIPE indisponível. Preencha à mão.");
  return d as T;
}

const COMBUSTIVEL_DA_FIPE: Record<string, string> = {
  gasolina: "Gasolina",
  alcool: "Etanol",
  etanol: "Etanol",
  diesel: "Diesel",
  flex: "Flex",
  eletrico: "Elétrico",
  hibrido: "Híbrido",
};
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function BuscaFipe({ onEscolher }: { onEscolher: (d: Partial<Form>) => void }) {
  const [marcas, setMarcas] = useState<OpcaoFipe[]>([]);
  const [marca, setMarca] = useState("");
  const [modelos, setModelos] = useState<OpcaoFipe[]>([]);
  const [filtroModelo, setFiltroModelo] = useState("");
  const [modelo, setModelo] = useState("");
  const [anos, setAnos] = useState<OpcaoFipe[]>([]);
  const [carregando, setCarregando] = useState<string | null>("marcas");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fipe<OpcaoFipe[]>({})
      .then(setMarcas)
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregando(null));
  }, []);

  async function escolherMarca(code: string) {
    setMarca(code);
    setModelo("");
    setModelos([]);
    setAnos([]);
    setFiltroModelo("");
    if (!code) return;
    setCarregando("modelos");
    setErro(null);
    try {
      setModelos(await fipe<OpcaoFipe[]>({ brand: code }));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(null);
    }
  }

  async function escolherModelo(code: string) {
    setModelo(code);
    setAnos([]);
    if (!code) return;
    setCarregando("anos");
    setErro(null);
    try {
      setAnos(await fipe<OpcaoFipe[]>({ brand: marca, model: code }));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(null);
    }
  }

  async function escolherAno(code: string) {
    if (!code) return;
    setCarregando("detalhe");
    setErro(null);
    try {
      const d = await fipe<DetalheFipe>({ brand: marca, model: modelo, year: code });
      const nomeMarca = (d.brand.split(" - ").pop() || d.brand).trim().toUpperCase();
      const [primeira, ...resto] = d.model.trim().split(/\s+/);
      const combustivel = COMBUSTIVEL_DA_FIPE[semAcento(d.fuel).split(/\s+/)[0]] ?? undefined;
      const zeroKm = d.modelYear >= 32000;
      onEscolher({
        marca: nomeMarca,
        modelo: (primeira ?? "").toUpperCase(),
        versao: resto.join(" ").toUpperCase(),
        ...(zeroKm ? {} : { anoModelo: String(d.modelYear) }),
        ...(combustivel ? { combustivel } : {}),
        codigoFipe: d.codeFipe,
        descricaoFipe: d.model,
        precoFipe: d.price.replace(/^R\$\s*/, "").replace(/,00$/, ""),
        referenciaFipe: d.referenceMonth,
      });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(null);
    }
  }

  const modelosFiltrados = modelos.filter((m) => semAcento(m.name).includes(semAcento(filtroModelo)));

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <label className="block text-xs font-semibold text-ink-800">
        Marca
        <select className="input mt-1 w-full" value={marca} onChange={(e) => escolherMarca(e.target.value)}>
          <option value="">{carregando === "marcas" ? "Carregando…" : "Escolha"}</option>
          {marcas.map((m) => (
            <option key={m.code} value={m.code}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <div className="text-xs font-semibold text-ink-800">
        Modelo
        <input
          className="input mt-1 w-full"
          placeholder="Filtrar (ex.: onix)"
          value={filtroModelo}
          onChange={(e) => setFiltroModelo(e.target.value)}
          disabled={!modelos.length}
        />
        <select
          className="input mt-1 w-full"
          value={modelo}
          onChange={(e) => escolherModelo(e.target.value)}
          disabled={!modelos.length}
          aria-label="Modelo na FIPE"
        >
          <option value="">{carregando === "modelos" ? "Carregando…" : `Escolha (${modelosFiltrados.length})`}</option>
          {modelosFiltrados.slice(0, 300).map((m) => (
            <option key={m.code} value={m.code}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <label className="block text-xs font-semibold text-ink-800">
        Ano e combustível
        <select className="input mt-1 w-full" defaultValue="" onChange={(e) => escolherAno(e.target.value)} disabled={!anos.length}>
          <option value="">{carregando === "anos" ? "Carregando…" : "Escolha"}</option>
          {anos.map((a) => (
            <option key={a.code} value={a.code}>
              {a.name.replace(/^32000/, "Zero km")}
            </option>
          ))}
        </select>
      </label>
      {(erro || carregando === "detalhe") && (
        <p className={clsx("text-xs sm:col-span-3", erro ? "text-red-600" : "text-muted")}>
          {erro ?? "Buscando o preço na FIPE…"}
        </p>
      )}
    </div>
  );
}
