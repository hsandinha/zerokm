"use client";

// Assistente de nova campanha em 4 passos: Audiência → Template →
// Configuração → Revisar.
//
// A audiência vem primeiro porque é ela que dá as variáveis do template: sem
// saber se cada destinatário tem nome, empresa e cidade, não dá para mapear
// {{1}}, {{2}}, {{3}} — e variável vazia faz a Meta recusar a mensagem
// inteira, com a campanha já rodando.
//
// Loja: o público é a soma das fontes dela (contatos, coluna do funil, lista
// colada, CSV), com a origem de cada pessoa e a opção de desmarcar quem não
// deve receber. Contatos e coluna vêm do servidor, pelo escopo da loja. CNV:
// além disso, a prospecção (CNPJá, base de empresas, sócios da Procob).
//
// A revisão pergunta ao servidor (dryRun) quantos vão receber de fato e quem
// fica de fora e por quê: é a mesma conferência da criação, então o número da
// tela é o número da campanha.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  ClipboardList,
  Columns3,
  FileUp,
  ImageIcon,
  ListChecks,
  Loader2,
  Paperclip,
  Play,
  RefreshCw,
  Save,
  Search,
  Users,
  X,
} from "lucide-react";
import { ACEITA_PLANILHA, lerPlanilha, PlanilhaError } from "@wa/lib/audience/planilha";
import { applyMapping } from "@wa/lib/audience/mapping";
import type { AudienceField, ColumnMapping } from "@wa/lib/audience/types";
import {
  ORIGEM_LABEL,
  juntarPublico,
  lerListaColada,
  type OrigemDoPublico,
  type PessoaDoPublico,
} from "@wa/lib/audience/publico";
import { formatPhoneBr, parsePhoneBr } from "@wa/lib/phone";
import { COLUNA_CORES, formatNumber } from "@wa/lib/stages";
import { describeWindow } from "@wa/lib/send-window";
import { estimateCostUsd } from "@wa/lib/campaign-status";
import {
  PARAM_LABEL,
  defaultParamMap,
  emptyParamPositions,
  fallbacksDe,
  renderTemplateBody,
  resolveParam,
  resolveParams,
  type ParamMapItem,
  type ParamType,
  type RecipientRow,
} from "@wa/lib/campaign-params";
import { useWaPanel, usePodeUsar } from "@wa/components/wa-panel";

const STEPS = ["Audiência", "Template", "Configuração", "Revisar"];

const PARAM_TYPES_BASE: ParamType[] = [
  "first_name",
  "full_name",
  "company",
  "city",
  "state",
  "phone",
  "fixed",
];
const PARAM_TYPES_CSV: ParamType[] = ["var1", "var2", "var3"];

const FIELD_LABELS: Array<[AudienceField | "", string]> = [
  ["", "— ignorar —"],
  ["phone", "Telefone"],
  ["contactName", "Nome do contato"],
  ["company", "Empresa"],
  ["cnpj", "CNPJ"],
  ["city", "Cidade"],
  ["state", "UF"],
  ["email", "E-mail"],
  ["var1", "Variável extra 1"],
  ["var2", "Variável extra 2"],
  ["var3", "Variável extra 3"],
];

const WEEKDAYS: Array<[number, string]> = [
  [1, "seg"],
  [2, "ter"],
  [3, "qua"],
  [4, "qui"],
  [5, "sex"],
  [6, "sáb"],
  [0, "dom"],
];

/** Origem do cadastro do contato, para o filtro de "Contatos". */
const ORIGEM_CONTATO_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  csv: "importação CSV",
  manual: "cadastro manual",
  cnpja: "CNPJá",
  procob: "Procob",
};

const ORIGEM_CLS: Record<OrigemDoPublico, string> = {
  contatos: "bg-sky-100 text-sky-700",
  coluna: "bg-violet-100 text-violet-700",
  colar: "bg-amber-100 text-amber-700",
  csv: "bg-emerald-100 text-emerald-700",
};

/** Mostrar 10 mil linhas com checkbox trava a tela: a busca acha o resto. */
const LINHAS_NA_LISTA = 200;

type Source = "cnpja" | "targets" | "pessoa" | "publico";

type HeaderFormat = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION" | null;

type Template = {
  name: string;
  language: string;
  category: string;
  status: string;
  body: string;
  variables: number;
  header: string | null;
  headerFormat?: HeaderFormat;
  headerVariables?: number;
  buttonVariables?: Array<{ index: number; text: string; urlPrefix: string; example: string | null }>;
  footer?: string | null;
};

type Recipient = {
  phone: string;
  name?: string | null;
  company?: string | null;
  city?: string | null;
  state?: string | null;
  cnpj?: string | null;
};

type Person = {
  partnerId: string;
  name: string;
  document: string | null;
  phones: Array<{ phone: string; score: number | null; operator: string | null; preferred: boolean }>;
};

type Coluna = { id: string; name: string; color: string; cartoes: number };

type MidiaDoHeader = { id: string; filename: string | null; tipo: string; previewUrl: string | null };

type Revisao = {
  recipients: number;
  people: number;
  skippedOptOut: number;
  skippedEmptyParam: number;
  skippedInvalid: number;
  duplicates: number;
  excluded: number;
  withoutMobile: number;
  truncated: boolean;
  invalidSample: string[];
  skippedSample: Array<{ phone: string; name: string | null; motivo: string }>;
  templateCategory: string;
};

const NOME_MIDIA: Record<string, string> = { IMAGE: "imagem", VIDEO: "vídeo", DOCUMENT: "documento" };
const ACEITA_MIDIA: Record<string, string> = {
  IMAGE: "image/jpeg,image/png",
  VIDEO: "video/mp4,video/3gpp",
  DOCUMENT: "application/pdf,.pdf,.doc,.docx,.xls,.xlsx",
};

function ehMidia(f: HeaderFormat | undefined): f is "IMAGE" | "VIDEO" | "DOCUMENT" {
  return f === "IMAGE" || f === "VIDEO" || f === "DOCUMENT";
}

function linhaDaPessoa(p: { phone: string; name?: string | null } & Partial<PessoaDoPublico>): RecipientRow {
  return {
    phone: p.phone,
    contactName: p.name ?? null,
    company: p.company ?? null,
    city: p.city ?? null,
    state: p.state ?? null,
    var1: p.var1 ?? null,
    var2: p.var2 ?? null,
    var3: p.var3 ?? null,
  };
}

function Stepper({ step, goTo }: { step: number; goTo: (s: number) => void }) {
  return (
    <div className="mb-7 flex items-center gap-2">
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={label} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
            <button
              type="button"
              onClick={() => (done ? goTo(i) : undefined)}
              disabled={!done}
              className={clsx(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition",
                active
                  ? "pill-active"
                  : done
                    ? "bg-brand-100 text-brand-700 hover:bg-brand-200"
                    : "border border-line text-muted",
              )}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/15 text-[10px]">
                {done ? <Check size={11} /> : i + 1}
              </span>
              {label}
            </button>
            {i < STEPS.length - 1 && <span className="h-px min-w-4 flex-1 bg-line" />}
          </div>
        );
      })}
    </div>
  );
}

/** De onde vem um valor do template ({{n}} do corpo, do cabeçalho ou do link). */
function ParamSelect({
  item,
  tipos,
  amostra,
  onChange,
  placeholder = "texto fixo",
}: {
  item: ParamMapItem;
  tipos: ParamType[];
  amostra: string;
  onChange: (p: ParamMapItem) => void;
  placeholder?: string;
}) {
  return (
    <>
      <select
        className="input py-1.5 text-xs"
        value={item.type}
        onChange={(e) => onChange({ ...item, type: e.target.value as ParamType })}
      >
        {tipos.map((t) => (
          <option key={t} value={t}>
            {PARAM_LABEL[t]}
          </option>
        ))}
      </select>
      {item.type === "fixed" ? (
        <input
          className="input py-1.5 text-xs"
          placeholder={placeholder}
          value={item.value ?? ""}
          onChange={(e) => onChange({ ...item, value: e.target.value })}
        />
      ) : (
        <span className="truncate text-xs text-muted">{amostra || "(vazio)"}</span>
      )}
    </>
  );
}

export function CampaignWizard({ colunaInicial = null }: { colunaInicial?: string | null } = {}) {
  const { base: painel, store } = useWaPanel();
  const podeUsar = usePodeUsar();
  const temFunil = podeUsar("funil");
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Loja não manda o "sua loja" do CNV para o cliente final (empresa vazia fica vazia).
  const fallbacks = useMemo(() => fallbacksDe(store ? "loja" : null), [store]);

  // ── Passo 1: audiência ──────────────────────────────────────
  // Loja dispara só para o público dela: CNPJá, base e Procob são do CNV.
  const [source, setSource] = useState<Source>(store || colunaInicial ? "publico" : "cnpja");
  const [buscando, setBuscando] = useState(false);

  // CNPJá
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [cnae, setCnae] = useState("");
  const [uf, setUf] = useState("");
  const [city, setCity] = useState("");
  const [nextToken, setNextToken] = useState<string | null>(null);

  // Base
  const [base, setBase] = useState<{ total: number; pending: number; sample: Recipient[] } | null>(
    null,
  );
  const [baseLimit, setBaseLimit] = useState(500);

  // Pessoa (Procob)
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<Record<string, string[]>>({});
  const [buscaPessoa, setBuscaPessoa] = useState("");

  // Público somado: contatos, coluna do funil, lista colada, CSV.
  const [usarContatos, setUsarContatos] = useState(false);
  const [janela24h, setJanela24h] = useState(false);
  const [origemContato, setOrigemContato] = useState("");
  const [contatos, setContatos] = useState<{ pessoas: PessoaDoPublico[]; truncado: boolean } | null>(null);
  const [usarColuna, setUsarColuna] = useState(Boolean(colunaInicial) && temFunil);
  const [colunaId, setColunaId] = useState(colunaInicial ?? "");
  const [colunas, setColunas] = useState<Coluna[] | null>(null);
  const [daColuna, setDaColuna] = useState<{ pessoas: PessoaDoPublico[]; truncado: boolean } | null>(null);
  const [usarColar, setUsarColar] = useState(false);
  const [textoColado, setTextoColado] = useState("");
  const [usarCsv, setUsarCsv] = useState(false);
  const [csv, setCsv] = useState<{
    file: string;
    headers: string[];
    rows: Array<Record<string, string>>;
    mapping: ColumnMapping;
  } | null>(null);
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [buscaPublico, setBuscaPublico] = useState("");

  // ── Passo 2: template ───────────────────────────────────────
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [paramsMap, setParamsMap] = useState<ParamMapItem[]>([]);
  const [headerParam, setHeaderParam] = useState<ParamMapItem>({ type: "first_name" });
  const [buttonParams, setButtonParams] = useState<Record<number, ParamMapItem>>({});
  const [headerMidia, setHeaderMidia] = useState<MidiaDoHeader | null>(null);
  const [enviandoMidia, setEnviandoMidia] = useState(false);
  const [erroMidia, setErroMidia] = useState<string | null>(null);

  // ── Passo 3: configuração ───────────────────────────────────
  const [name, setName] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sendStart, setSendStart] = useState("09:00");
  const [sendEnd, setSendEnd] = useState("18:00");
  const [sendDays, setSendDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [dailyLimit, setDailyLimit] = useState(0);
  const [throttleSeconds, setThrottleSeconds] = useState(4);
  const [followups, setFollowups] = useState<Array<{ template: string; hours: number }>>([]);

  // ── Passo 4: revisão ────────────────────────────────────────
  const [revisao, setRevisao] = useState<Revisao | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [erroRevisao, setErroRevisao] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wa/templates")
      .then(async (r) => {
        const body = await r.json();
        setTemplates((body.templates ?? []).filter((t: Template) => t.status === "APPROVED"));
        if (body.error) setErro(body.error);
      })
      .catch(() => setTemplates([]));
  }, []);

  const template = useMemo(
    () => templates?.find((t) => t.name === templateName) ?? null,
    [templates, templateName],
  );
  const varCount = template?.variables ?? 0;
  const headerFormat = template?.headerFormat ?? null;
  const headerVars = template?.headerVariables ?? 0;
  const botoesUrl = template?.buttonVariables ?? [];

  // Trocar de template refaz o mapeamento: o número de variáveis muda, e o
  // arquivo do cabeçalho de um não serve para o outro.
  useEffect(() => {
    if (!template) return;
    setParamsMap((atual) => (atual.length === varCount ? atual : defaultParamMap(varCount)));
    setButtonParams((atual) => {
      const novo: Record<number, ParamMapItem> = {};
      for (const b of template.buttonVariables ?? []) novo[b.index] = atual[b.index] ?? { type: "fixed", value: "" };
      return novo;
    });
  }, [template, varCount]);
  const formatoAnterior = useRef<HeaderFormat>(null);
  useEffect(() => {
    if (formatoAnterior.current !== headerFormat) setHeaderMidia(null);
    formatoAnterior.current = headerFormat;
  }, [headerFormat]);

  // ── Leituras da audiência ───────────────────────────────────
  const carregarBase = useCallback(async () => {
    setBuscando(true);
    try {
      const res = await fetch("/api/wa/campaigns/audience?source=targets");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao ler a base");
      setBase({ total: body.total ?? 0, pending: body.pending ?? 0, sample: body.sample ?? [] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao ler a base");
    } finally {
      setBuscando(false);
    }
  }, []);

  const carregarPessoas = useCallback(async (q: string) => {
    setBuscando(true);
    try {
      const sp = new URLSearchParams({ source: "pessoa" });
      if (q.trim()) sp.set("q", q.trim());
      const res = await fetch(`/api/wa/campaigns/audience?${sp.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao ler os sócios");
      setPeople(body.people ?? []);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao ler os sócios");
    } finally {
      setBuscando(false);
    }
  }, []);

  useEffect(() => {
    if (store) return;
    if (source === "targets" && !base) carregarBase();
    if (source === "pessoa" && people.length === 0) carregarPessoas("");
  }, [store, source, base, people.length, carregarBase, carregarPessoas]);

  // Contatos da loja: o servidor resolve pelo escopo; a tela só manda os filtros.
  useEffect(() => {
    if (source !== "publico" || !usarContatos) return;
    let vivo = true;
    const sp = new URLSearchParams({ fonte: "contatos" });
    if (janela24h) sp.set("janela24h", "1");
    if (origemContato) sp.set("origem", origemContato);
    setBuscando(true);
    fetch(`/api/wa/campaigns/publico?${sp.toString()}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Falha ao ler os contatos");
        if (vivo) setContatos({ pessoas: body.pessoas ?? [], truncado: Boolean(body.truncado) });
      })
      .catch((e: Error) => vivo && setErro(e.message))
      .finally(() => vivo && setBuscando(false));
    return () => {
      vivo = false;
    };
  }, [source, usarContatos, janela24h, origemContato]);

  // Colunas do funil (uma vez) e os contatos da coluna escolhida.
  useEffect(() => {
    if (source !== "publico" || !usarColuna || !temFunil || colunas) return;
    fetch("/api/wa/campaigns/publico?fonte=colunas")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Falha ao ler o funil");
        setColunas(body.colunas ?? []);
      })
      .catch((e: Error) => {
        setErro(e.message);
        // Sem isto o bloco ficaria em "Carregando o funil…" para sempre.
        setColunas([]);
      });
  }, [source, usarColuna, temFunil, colunas]);

  useEffect(() => {
    if (source !== "publico" || !usarColuna || !colunaId || !temFunil) return;
    let vivo = true;
    setBuscando(true);
    fetch(`/api/wa/campaigns/publico?fonte=coluna&coluna=${encodeURIComponent(colunaId)}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Falha ao ler a coluna");
        if (vivo) setDaColuna({ pessoas: body.pessoas ?? [], truncado: Boolean(body.truncado) });
      })
      .catch((e: Error) => {
        if (!vivo) return;
        setErro(e.message);
        setDaColuna(null);
      })
      .finally(() => vivo && setBuscando(false));
    return () => {
      vivo = false;
    };
  }, [source, usarColuna, colunaId, temFunil]);

  async function buscarCnpja(more = false) {
    setBuscando(true);
    setErro(null);
    try {
      const res = await fetch("/api/wa/campaigns/cnpja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnae: cnae || undefined,
          uf: uf || undefined,
          city: city || undefined,
          limit: 100,
          token: more ? nextToken : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Falha na busca");
      const achados: Recipient[] = (body.companies ?? [])
        .filter((c: { phone: string | null }) => c.phone)
        .map((c: { phone: string; name: string; city: string | null; state: string | null; taxId: string }) => ({
          phone: c.phone,
          name: c.name,
          company: c.name,
          city: c.city,
          state: c.state,
          cnpj: c.taxId,
        }));
      setRecipients((prev) => (more ? [...prev, ...achados] : achados));
      setNextToken(body.next ?? null);
      if (achados.length === 0 && !more) {
        setAviso("Nenhuma empresa com telefone para esse filtro.");
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro na busca");
    } finally {
      setBuscando(false);
    }
  }

  async function lerCsv(file: File) {
    let parsed;
    try {
      parsed = await lerPlanilha(file);
    } catch (err) {
      setErro(err instanceof PlanilhaError ? err.message : "Não consegui ler a planilha.");
      return;
    }
    setErro(null);
    setCsv({
      file: file.name,
      headers: parsed.headers,
      rows: parsed.raw,
      mapping: parsed.suggestedMapping,
    });
  }

  // CSV mapeado: só celular válido entra; o resto vira aviso.
  const doCsv = useMemo(() => {
    const pessoas: PessoaDoPublico[] = [];
    let invalidos = 0;
    if (!csv) return { pessoas, invalidos, temVariavelExtra: false };
    for (const raw of csv.rows) {
      const row = applyMapping(raw, csv.mapping);
      const parsed = parsePhoneBr(row.phone);
      if (!parsed.valid || !parsed.e164 || parsed.kind === "fixo") {
        invalidos++;
        continue;
      }
      pessoas.push({
        phone: parsed.e164,
        name: row.contactName ?? null,
        company: row.company ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        var1: row.var1 ?? null,
        var2: row.var2 ?? null,
        var3: row.var3 ?? null,
        origem: "csv",
      });
    }
    const temVariavelExtra = Object.values(csv.mapping).some((f) => f === "var1" || f === "var2" || f === "var3");
    return { pessoas, invalidos, temVariavelExtra };
  }, [csv]);

  const colado = useMemo(() => lerListaColada(textoColado), [textoColado]);

  // A lista que a tela mostra é a mesma soma que o servidor faz na criação.
  const listas = useMemo(() => {
    if (source !== "publico") return [];
    return [
      usarContatos ? (contatos?.pessoas ?? []) : [],
      usarColuna && colunaId ? (daColuna?.pessoas ?? []) : [],
      usarColar ? colado.pessoas : [],
      usarCsv ? doCsv.pessoas : [],
    ];
  }, [source, usarContatos, contatos, usarColuna, colunaId, daColuna, usarColar, colado, usarCsv, doCsv]);
  const juntado = useMemo(() => juntarPublico(listas), [listas]);
  const selecionados = useMemo(
    () => juntado.pessoas.filter((p) => !excluidos.has(p.phone)),
    [juntado, excluidos],
  );
  const filtradosPublico = useMemo(() => {
    const q = buscaPublico.trim().toLowerCase();
    if (!q) return juntado.pessoas;
    const digitos = q.replace(/\D/g, "");
    return juntado.pessoas.filter(
      (p) => (p.name ?? "").toLowerCase().includes(q) || (digitos.length >= 3 && p.phone.includes(digitos)),
    );
  }, [juntado, buscaPublico]);
  const porOrigem = useMemo(() => {
    const n: Partial<Record<OrigemDoPublico, number>> = {};
    for (const p of juntado.pessoas) n[p.origem] = (n[p.origem] ?? 0) + 1;
    return n;
  }, [juntado]);

  function marcarTodos(marcar: boolean) {
    setExcluidos((atual) => {
      const novo = new Set(atual);
      for (const p of filtradosPublico) {
        if (marcar) novo.delete(p.phone);
        else novo.add(p.phone);
      }
      return novo;
    });
  }

  function togglePerson(p: Person, todos: boolean) {
    setSelectedPeople((atual) => {
      const copia = { ...atual };
      if (copia[p.partnerId]) delete copia[p.partnerId];
      else copia[p.partnerId] = todos ? p.phones.map((f) => f.phone) : [p.phones[0].phone];
      return copia;
    });
  }

  const pessoasSelecionadas = Object.keys(selectedPeople).length;
  const fonesDePessoas = Object.values(selectedPeople).reduce((a, f) => a + f.length, 0);

  const totalAudiencia =
    source === "targets"
      ? Math.min(base?.total ?? 0, baseLimit)
      : source === "pessoa"
        ? fonesDePessoas
        : source === "publico"
          ? selecionados.length
          : recipients.length;

  // Prévia com o primeiro destinatário — é o texto que a pessoa vai receber.
  const amostra: RecipientRow | null =
    source === "targets"
      ? base?.sample[0]
        ? linhaDaPessoa({
            ...base.sample[0],
            name: (base.sample[0] as Recipient & { contactName?: string | null }).contactName ?? base.sample[0].name,
          })
        : null
      : source === "pessoa"
        ? people.find((p) => selectedPeople[p.partnerId])
          ? {
              phone: Object.values(selectedPeople)[0]?.[0] ?? "",
              contactName: people.find((p) => selectedPeople[p.partnerId])?.name ?? null,
            }
          : null
        : source === "publico"
          ? selecionados[0]
            ? linhaDaPessoa(selecionados[0])
            : null
          : recipients[0]
            ? linhaDaPessoa(recipients[0])
            : null;

  const paramsAmostra = amostra ? resolveParams(paramsMap, amostra, fallbacks) : [];
  const headerAmostra = amostra && headerVars > 0 ? resolveParam(headerParam, amostra, fallbacks) : "";
  const vaziosAmostra = emptyParamPositions(paramsAmostra);

  // Quantos do público ficariam com algum buraco (corpo, cabeçalho ou link):
  // esses ficam de fora, e a revisão mostra quem são.
  const comVazio = useMemo(() => {
    if (!template) return 0;
    const linhasDoPublico: RecipientRow[] =
      source === "publico"
        ? selecionados.map(linhaDaPessoa)
        : source === "cnpja"
          ? recipients.map(linhaDaPessoa)
          : [];
    return linhasDoPublico.filter((row) => {
      if (emptyParamPositions(resolveParams(paramsMap, row, fallbacks)).length > 0) return true;
      if (headerVars > 0 && !resolveParam(headerParam, row, fallbacks).trim()) return true;
      return botoesUrl.some((b) => !resolveParam(buttonParams[b.index] ?? { type: "fixed" }, row, fallbacks).trim());
    }).length;
  }, [template, source, selecionados, recipients, paramsMap, headerVars, headerParam, botoesUrl, buttonParams, fallbacks]);

  const tiposDeParam = useMemo(
    () => [...PARAM_TYPES_BASE, ...(source === "publico" && usarCsv && doCsv.temVariavelExtra ? PARAM_TYPES_CSV : [])],
    [source, usarCsv, doCsv.temVariavelExtra],
  );

  async function anexarMidia(file: File) {
    if (!ehMidia(headerFormat)) return;
    setEnviandoMidia(true);
    setErroMidia(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("uso", "campanha");
      form.set("formato", headerFormat);
      const res = await fetch("/api/wa/campaigns/midia", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Falha ao enviar o arquivo");
      setHeaderMidia({
        id: body.id,
        filename: body.filename ?? file.name,
        tipo: body.tipo,
        previewUrl: headerFormat === "IMAGE" ? URL.createObjectURL(file) : null,
      });
    } catch (err) {
      setErroMidia(err instanceof Error ? err.message : "Falha ao enviar o arquivo");
    } finally {
      setEnviandoMidia(false);
    }
  }

  function montarPayload(iniciar: boolean, dryRun: boolean): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      name: name.trim() || `Campanha ${new Date().toLocaleDateString("pt-BR")}`,
      templateName,
      templateLanguage: template?.language,
      paramsMap,
      headerParamsMap: headerVars > 0 ? [headerParam] : [],
      buttonParamsMap: botoesUrl.map((b) => ({ index: b.index, ...(buttonParams[b.index] ?? { type: "fixed", value: "" }) })),
      headerMedia: headerMidia ? { midiaId: headerMidia.id } : null,
      start: iniciar,
      dryRun,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      sendStart,
      sendEnd,
      sendDays,
      dailyLimit,
      throttleSeconds,
      followupTemplates: followups.map((f) => f.template).filter(Boolean),
      followupDelaysHours: followups.map((f) => f.hours),
    };

    if (source === "publico") {
      // Contatos e coluna: só os filtros; quem entra o servidor decide.
      payload.publico = {
        contatos: usarContatos ? { janela24h, origem: origemContato || null } : null,
        coluna: usarColuna && colunaId ? { id: colunaId } : null,
        colados: usarColar ? colado.pessoas : [],
        csv: usarCsv ? doCsv.pessoas : [],
        excluir: [...excluidos],
      };
    } else if (source === "cnpja") {
      payload.source = "cnpja";
      payload.recipients = recipients;
      payload.filters = { cnae, uf, city };
    } else if (source === "pessoa") {
      payload.source = "pessoa";
      payload.partners = Object.entries(selectedPeople).map(([partnerId, phones]) => ({
        partnerId,
        phones,
      }));
    } else {
      payload.source = "targets";
      payload.limit = baseLimit;
    }
    return payload;
  }

  // Revisão honesta: a mesma conferência da criação, sem criar.
  const revisar = useCallback(async () => {
    setRevisando(true);
    setErroRevisao(null);
    try {
      const res = await fetch("/api/wa/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(montarPayload(false, true)),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao conferir a campanha");
      setRevisao(body as Revisao);
    } catch (err) {
      setRevisao(null);
      setErroRevisao(err instanceof Error ? err.message : "Falha ao conferir a campanha");
    } finally {
      setRevisando(false);
    }
    // montarPayload lê o estado atual do assistente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, templateName, paramsMap, headerParam, buttonParams, headerMidia, usarContatos, janela24h, origemContato, usarColuna, colunaId, usarColar, colado, usarCsv, doCsv, excluidos, recipients, selectedPeople, baseLimit]);

  useEffect(() => {
    if (step === 3) revisar();
  }, [step, revisar]);

  async function criar(iniciar: boolean) {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/wa/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(montarPayload(iniciar, false)),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao criar a campanha");
      router.push(`${painel}/campanhas/${body.campaignId}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao criar a campanha");
    } finally {
      setSalvando(false);
    }
  }

  const faltaMidia = ehMidia(headerFormat) && !headerMidia;
  const totalComparavel = source === "publico" ? selecionados.length : source === "cnpja" ? recipients.length : 0;
  const todosVazios = totalComparavel > 0 && comVazio >= totalComparavel;

  const podeAvancar =
    step === 0
      ? totalAudiencia > 0
      : step === 1
        ? Boolean(template) &&
          headerFormat !== "LOCATION" &&
          !faltaMidia &&
          !todosVazios &&
          (totalComparavel > 0 || vaziosAmostra.length === 0)
        : true;

  const ondeEsta = store ? "no WhatsApp da loja" : "neste WABA";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`${painel}/campanhas`} className="rounded-full p-2 text-muted hover:bg-canvas">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <p className="brand-kicker">Disparo</p>
          <h1 className="text-2xl font-bold">Nova campanha</h1>
        </div>
      </div>

      <Stepper step={step} goTo={setStep} />

      {erro && (
        <p className="flex items-start gap-2 rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span className="flex-1">{erro}</span>
          <button onClick={() => setErro(null)} aria-label="Fechar aviso">
            <X size={14} />
          </button>
        </p>
      )}
      {aviso && (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
          {aviso}
        </p>
      )}

      {/* ── Passo 1: audiência ───────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-4">
          {!store && (
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["cnpja", "Buscar no CNPJá"],
                  ["targets", "Empresas da base"],
                  ["pessoa", "Por pessoa (Procob)"],
                  ["publico", "Contatos, funil e listas"],
                ] as Array<[Source, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => {
                    setSource(id);
                    setRecipients([]);
                    setAviso(null);
                  }}
                  className={clsx(
                    "rounded-full px-3.5 py-2 text-xs font-semibold transition",
                    source === id ? "pill-active" : "border border-line bg-paper text-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {source === "cnpja" && (
            <div className="card space-y-3">
              <p className="text-sm text-muted">
                Empresas ativas na Receita, com telefone declarado. O CNPJá cobra por consulta —
                refine o filtro antes de trazer muita gente.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="block">
                  <span className="label">CNAE</span>
                  <input
                    className="input"
                    placeholder="4511101"
                    value={cnae}
                    onChange={(e) => setCnae(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="label">UF</span>
                  <input
                    className="input"
                    placeholder="MG"
                    maxLength={2}
                    value={uf}
                    onChange={(e) => setUf(e.target.value.toUpperCase())}
                  />
                </label>
                <label className="block">
                  <span className="label">Município</span>
                  <input
                    className="input"
                    placeholder="Belo Horizonte"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-dark px-4 py-2 text-xs" onClick={() => buscarCnpja(false)} disabled={buscando}>
                  {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  Buscar
                </button>
                {nextToken && (
                  <button
                    className="btn-ghost px-4 py-2 text-xs"
                    onClick={() => buscarCnpja(true)}
                    disabled={buscando}
                  >
                    Trazer mais 100
                  </button>
                )}
                <span className="text-xs text-muted">
                  {formatNumber(recipients.length)} empresa(s) na fila
                </span>
              </div>
            </div>
          )}

          {source === "targets" && (
            <div className="card space-y-3">
              <p className="text-sm text-muted">
                Empresas que já estão na base com telefone — vindas de importação ou do
                enriquecimento pela Procob.
              </p>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Building2 size={15} className="text-brand-700" />
                  {formatNumber(base?.total ?? 0)} prontas
                </span>
                {(base?.pending ?? 0) > 0 && (
                  <Link href={`${painel}/contatos/enriquecer`} className="text-xs text-brand-700 hover:underline">
                    {formatNumber(base!.pending)} sem telefone — enriquecer →
                  </Link>
                )}
                <label className="ml-auto flex items-center gap-2 text-xs">
                  <span className="text-muted">disparar no máximo</span>
                  <input
                    type="number"
                    min={1}
                    className="input w-24 py-1 text-xs"
                    value={baseLimit}
                    onChange={(e) => setBaseLimit(Math.max(1, Number(e.target.value)))}
                  />
                </label>
              </div>
              {(base?.sample.length ?? 0) > 0 && (
                <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
                  {base!.sample.map((t) => (
                    <li key={t.phone} className="flex justify-between gap-2 border-b border-line py-1">
                      <span className="truncate">{t.company ?? t.name ?? "—"}</span>
                      <span className="shrink-0 text-muted">{formatPhoneBr(t.phone)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {source === "pessoa" && (
            <div className="card space-y-3">
              <p className="text-sm text-muted">
                O bureau devolve vários celulares do mesmo sócio e não diz qual está ativo. Marcando
                a pessoa, todos os números escolhidos entram — e, quando ela responder em um, os
                outros que ainda não saíram são cancelados.
              </p>
              <label className="relative block">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  className="input py-2 pl-8 text-sm"
                  placeholder="Buscar sócio pelo nome…"
                  value={buscaPessoa}
                  onChange={(e) => setBuscaPessoa(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && carregarPessoas(buscaPessoa)}
                />
              </label>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {people.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted">
                    Nenhum sócio com celular guardado. Use{" "}
                    <Link href={`${painel}/contatos/enriquecer`} className="text-brand-700 hover:underline">
                      Enriquecer
                    </Link>{" "}
                    para buscar na Procob.
                  </p>
                )}
                {people.map((p) => {
                  const marcado = Boolean(selectedPeople[p.partnerId]);
                  return (
                    <div
                      key={p.partnerId}
                      className={clsx(
                        "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                        marcado ? "border-brand-300 bg-brand-50" : "border-line",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => togglePerson(p, true)}
                        className="h-4 w-4"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{p.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {p.phones.map((f) => formatPhoneBr(f.phone)).join(" · ")}
                        </span>
                      </span>
                      {marcado && (
                        <button
                          className="shrink-0 text-[11px] text-brand-700 hover:underline"
                          onClick={() =>
                            setSelectedPeople((a) => ({
                              ...a,
                              [p.partnerId]:
                                a[p.partnerId].length === p.phones.length
                                  ? [p.phones[0].phone]
                                  : p.phones.map((f) => f.phone),
                            }))
                          }
                        >
                          {selectedPeople[p.partnerId].length === p.phones.length
                            ? "só o melhor número"
                            : `todos os ${p.phones.length}`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted">
                {formatNumber(pessoasSelecionadas)} pessoa(s) · {formatNumber(fonesDePessoas)}{" "}
                número(s) na fila
              </p>
            </div>
          )}

          {source === "publico" && (
            <>
              <div className="card space-y-3">
                <p className="text-sm text-muted">
                  {store
                    ? "Escolha para quem a loja vai mandar. Dá para somar mais de uma fonte: quem aparece em duas entra uma vez só."
                    : "Contatos do CNV, uma coluna do funil, uma lista colada ou um CSV. Dá para somar mais de uma fonte: quem aparece em duas entra uma vez só."}
                </p>

                {/* Contatos */}
                <FonteToggle
                  ativo={usarContatos}
                  onToggle={() => setUsarContatos((v) => !v)}
                  icone={<Users size={15} />}
                  titulo={store ? "Contatos da loja" : "Contatos"}
                  descricao="Quem já falou com vocês. Quem pediu para sair fica de fora."
                  contagem={usarContatos ? porOrigem.contatos : undefined}
                >
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={janela24h} onChange={(e) => setJanela24h(e.target.checked)} />
                      Só quem falou nas últimas 24h
                    </label>
                    <label className="flex items-center gap-1.5">
                      <span className="text-muted">Origem</span>
                      <select
                        className="input py-1 text-xs"
                        value={origemContato}
                        onChange={(e) => setOrigemContato(e.target.value)}
                      >
                        <option value="">todas</option>
                        {Object.entries(ORIGEM_CONTATO_LABEL).map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {contatos?.truncado && (
                      <span className="text-amber-700">Mostrando os 10 mil mais recentes.</span>
                    )}
                  </div>
                </FonteToggle>

                {/* Coluna do funil */}
                {temFunil && (
                  <FonteToggle
                    ativo={usarColuna}
                    onToggle={() => setUsarColuna((v) => !v)}
                    icone={<Columns3 size={15} />}
                    titulo="Coluna do funil"
                    descricao="Quem está numa etapa do funil, como Em conversa ou Perdido."
                    contagem={usarColuna && colunaId ? porOrigem.coluna : undefined}
                  >
                    {colunas === null ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        <Loader2 size={12} className="animate-spin" /> Carregando o funil…
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {colunas.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => setColunaId(c.id)}
                            className={clsx(
                              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                              colunaId === c.id ? "pill-active" : "border border-line text-muted",
                            )}
                          >
                            <span className={clsx("h-2 w-2 rounded-full", COLUNA_CORES[c.color]?.dot ?? "bg-ink-300")} />
                            {c.name}
                            <span className="opacity-70">{formatNumber(c.cartoes)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </FonteToggle>
                )}

                {/* Lista colada */}
                <FonteToggle
                  ativo={usarColar}
                  onToggle={() => setUsarColar((v) => !v)}
                  icone={<ClipboardList size={15} />}
                  titulo="Colar lista"
                  descricao="Um celular por linha, com o nome antes ou depois (opcional)."
                  contagem={usarColar ? porOrigem.colar : undefined}
                >
                  <textarea
                    className="input min-h-28 font-mono text-xs"
                    placeholder={"Ana Souza; (31) 99999-0000\n31988887777 Carlos\n(31) 97777-6666"}
                    value={textoColado}
                    onChange={(e) => setTextoColado(e.target.value)}
                  />
                  {colado.invalidas.length > 0 && (
                    <p className="text-[11px] text-amber-700">
                      {formatNumber(colado.invalidas.length)} linha(s) sem celular válido ficaram de fora:{" "}
                      {colado.invalidas.slice(0, 3).join(" · ")}
                      {colado.invalidas.length > 3 ? "…" : ""}
                    </p>
                  )}
                </FonteToggle>

                {/* CSV */}
                <FonteToggle
                  ativo={usarCsv}
                  onToggle={() => setUsarCsv((v) => !v)}
                  icone={<FileUp size={15} />}
                  titulo="Importar planilha"
                  descricao="CSV ou Excel (.xlsx), com qualquer cabeçalho: as colunas são detectadas e você confirma."
                  contagem={usarCsv && csv ? porOrigem.csv : undefined}
                >
                  <label className="btn-ghost inline-flex cursor-pointer px-4 py-2 text-xs">
                    <FileUp size={14} /> {csv ? "Trocar arquivo" : "Escolher arquivo"}
                    <input
                      type="file"
                      accept={ACEITA_PLANILHA}
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && lerCsv(e.target.files[0])}
                    />
                  </label>
                  {csv && (
                    <div className="space-y-2 rounded-2xl border border-line bg-canvas p-3">
                      <p className="text-xs font-semibold">
                        {csv.file} · {formatNumber(csv.rows.length)} linha(s)
                      </p>
                      <div className="max-h-52 space-y-1 overflow-y-auto">
                        {csv.headers.map((h) => (
                          <div key={h} className="grid grid-cols-[1fr_1fr] items-center gap-2 text-xs">
                            <span className="truncate text-muted">{h}</span>
                            <select
                              className="input py-1 text-xs"
                              value={csv.mapping[h] ?? ""}
                              onChange={(e) => {
                                const mapping = { ...csv.mapping, [h]: e.target.value as AudienceField | "" };
                                setCsv({ ...csv, mapping });
                              }}
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
                      <p className="text-xs text-muted">
                        {formatNumber(doCsv.pessoas.length)} celular(es) válido(s)
                        {doCsv.invalidos > 0 ? ` · ${formatNumber(doCsv.invalidos)} linha(s) sem celular válido ficaram de fora` : ""}.
                      </p>
                    </div>
                  )}
                </FonteToggle>
              </div>

              {juntado.pessoas.length > 0 && (
                <div className="card space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-sm font-bold">
                      {formatNumber(selecionados.length)} de {formatNumber(juntado.pessoas.length)} marcados
                    </span>
                    {(Object.keys(porOrigem) as OrigemDoPublico[]).map((o) => (
                      <span key={o} className={clsx("rounded-full px-2 py-0.5 font-semibold", ORIGEM_CLS[o])}>
                        {ORIGEM_LABEL[o]} {formatNumber(porOrigem[o] ?? 0)}
                      </span>
                    ))}
                    {juntado.duplicados > 0 && (
                      <span className="text-muted">
                        {formatNumber(juntado.duplicados)} repetido(s) juntado(s)
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="relative block min-w-48 flex-1">
                      <Search
                        size={14}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                      />
                      <input
                        className="input py-2 pl-8 text-sm"
                        placeholder="Buscar por nome ou telefone"
                        value={buscaPublico}
                        onChange={(e) => setBuscaPublico(e.target.value)}
                      />
                    </label>
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => marcarTodos(true)}>
                      Marcar {buscaPublico ? "os achados" : "todos"}
                    </button>
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => marcarTodos(false)}>
                      Desmarcar {buscaPublico ? "os achados" : "todos"}
                    </button>
                  </div>
                  <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-2xl border border-line">
                    {filtradosPublico.slice(0, LINHAS_NA_LISTA).map((p) => {
                      const marcado = !excluidos.has(p.phone);
                      return (
                        <li key={p.phone}>
                          <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-canvas">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={marcado}
                              onChange={() =>
                                setExcluidos((atual) => {
                                  const novo = new Set(atual);
                                  if (novo.has(p.phone)) novo.delete(p.phone);
                                  else novo.add(p.phone);
                                  return novo;
                                })
                              }
                            />
                            <span className={clsx("min-w-0 flex-1 truncate", !marcado && "text-muted line-through")}>
                              {p.name || formatPhoneBr(p.phone)}
                            </span>
                            {p.name && <span className="shrink-0 text-xs text-muted">{formatPhoneBr(p.phone)}</span>}
                            <span className={clsx("shrink-0 rounded-full px-1.5 text-[10px] font-semibold", ORIGEM_CLS[p.origem])}>
                              {ORIGEM_LABEL[p.origem]}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                    {filtradosPublico.length === 0 && (
                      <li className="px-3 py-6 text-center text-xs text-muted">Ninguém com essa busca.</li>
                    )}
                  </ul>
                  {filtradosPublico.length > LINHAS_NA_LISTA && (
                    <p className="text-[11px] text-muted">
                      Mostrando {LINHAS_NA_LISTA} de {formatNumber(filtradosPublico.length)}. Use a busca
                      para achar alguém.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm">
              {buscando ? <Loader2 size={15} className="animate-spin text-muted" /> : <Users size={15} className="text-muted" />}
              <b>{formatNumber(totalAudiencia)}</b> destinatário(s)
            </p>
            <button className="btn-primary" disabled={!podeAvancar} onClick={() => setStep(1)}>
              Escolher o template
            </button>
          </div>
        </div>
      )}

      {/* ── Passo 2: template ────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="card space-y-3">
            <label className="block">
              <span className="label">Template aprovado</span>
              <select
                className="input"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              >
                <option value="">— escolha —</option>
                {(templates ?? []).map((t) => (
                  <option key={`${t.name}-${t.language}`} value={t.name}>
                    {t.name} ({t.language} · {t.category})
                  </option>
                ))}
              </select>
            </label>
            {templates?.length === 0 && (
              <p className="text-xs text-amber-700">
                Nenhum template aprovado {ondeEsta}.{" "}
                <Link href={`${painel}/templates`} className="underline">
                  Criar um agora
                </Link>
                .
              </p>
            )}

            {template && (
              <>
                <div className="rounded-2xl border border-line bg-canvas p-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Corpo do template
                  </p>
                  {template.header && <p className="mb-1 text-sm font-bold">{template.header}</p>}
                  <p className="whitespace-pre-wrap text-sm">{template.body}</p>
                </div>

                {headerFormat === "LOCATION" && (
                  <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    Template com localização no cabeçalho ainda não pode ser disparado por campanha.
                  </p>
                )}

                {/* Cabeçalho de mídia: o mesmo arquivo para todos. */}
                {ehMidia(headerFormat) && (
                  <div className="space-y-2 rounded-2xl border border-line p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {NOME_MIDIA[headerFormat] === "imagem" ? "Imagem" : NOME_MIDIA[headerFormat] === "vídeo" ? "Vídeo" : "Documento"} do cabeçalho
                    </p>
                    <p className="text-xs text-muted">
                      Este template tem {NOME_MIDIA[headerFormat]} no cabeçalho. Sem o arquivo, a Meta
                      recusa todas as mensagens. Até 4 MB.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="btn-ghost inline-flex cursor-pointer px-4 py-2 text-xs">
                        {enviandoMidia ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                        {headerMidia ? "Trocar arquivo" : "Anexar arquivo"}
                        <input
                          type="file"
                          accept={ACEITA_MIDIA[headerFormat]}
                          className="hidden"
                          disabled={enviandoMidia}
                          onChange={(e) => e.target.files?.[0] && anexarMidia(e.target.files[0])}
                        />
                      </label>
                      {headerMidia && (
                        <span className="flex items-center gap-2 text-xs">
                          {headerMidia.previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={headerMidia.previewUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                          ) : (
                            <ImageIcon size={14} className="text-muted" />
                          )}
                          {headerMidia.filename}
                          <Check size={13} className="text-brand-700" />
                        </span>
                      )}
                    </div>
                    {erroMidia && <p className="text-xs text-red-600">{erroMidia}</p>}
                  </div>
                )}

                {headerVars > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Variável do cabeçalho
                    </p>
                    <div className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2">
                      <span className="text-xs font-bold text-muted">{"{{1}}"}</span>
                      <ParamSelect item={headerParam} tipos={tiposDeParam} amostra={headerAmostra} onChange={setHeaderParam} />
                    </div>
                  </div>
                )}

                {varCount > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      De onde vem cada variável
                    </p>
                    {paramsMap.map((p, i) => (
                      <div key={i} className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2">
                        <span className="text-xs font-bold text-muted">{`{{${i + 1}}}`}</span>
                        <ParamSelect
                          item={p}
                          tipos={tiposDeParam}
                          amostra={paramsAmostra[i] ?? ""}
                          onChange={(novo) => setParamsMap((atual) => atual.map((x, j) => (j === i ? novo : x)))}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {botoesUrl.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Final do link dos botões
                    </p>
                    {botoesUrl.map((b) => {
                      const item = buttonParams[b.index] ?? { type: "fixed" as const, value: "" };
                      const valor = amostra ? resolveParam(item, amostra, fallbacks) : item.value ?? "";
                      return (
                        <div key={b.index} className="space-y-1">
                          <div className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2">
                            <span className="truncate text-xs font-bold text-muted" title={b.text}>
                              {b.text}
                            </span>
                            <ParamSelect
                              item={item}
                              tipos={tiposDeParam}
                              amostra={valor}
                              placeholder={b.example ? b.example.replace(b.urlPrefix, "") : "final do link"}
                              onChange={(novo) => setButtonParams((atual) => ({ ...atual, [b.index]: novo }))}
                            />
                          </div>
                          <p className="pl-14 text-[11px] text-muted">
                            {b.urlPrefix}
                            <b className="text-ink-800">{valor || "…"}</b>
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {comVazio > 0 && (
                  <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    {todosVazios
                      ? "Todos os destinatários ficariam com alguma variável vazia. A Meta recusa a mensagem inteira quando isso acontece: troque a origem ou use texto fixo."
                      : `${formatNumber(comVazio)} destinatário(s) ficariam com alguma variável vazia e vão ficar de fora. A revisão mostra quem são.`}
                  </p>
                )}
                {totalComparavel === 0 && vaziosAmostra.length > 0 && (
                  <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    A variável {vaziosAmostra.map((n) => `{{${n}}}`).join(", ")} ficaria vazia nesta
                    audiência. A Meta recusa a mensagem inteira quando isso acontece — troque a
                    origem ou use texto fixo.
                  </p>
                )}

                {amostra && (
                  <div className="rounded-2xl border border-brand-300 bg-brand-50 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                      Prévia para {amostra.contactName ?? formatPhoneBr(amostra.phone)}
                    </p>
                    {headerMidia?.previewUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={headerMidia.previewUrl} alt="" className="mb-2 max-h-40 rounded-xl object-cover" />
                    )}
                    {template.header && (
                      <p className="mb-1 text-sm font-bold">
                        {headerVars > 0 ? template.header.replace("{{1}}", headerAmostra || "{{1}}") : template.header}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-sm">
                      {renderTemplateBody(template.body, paramsAmostra)}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(0)}>
              Voltar
            </button>
            <button className="btn-primary" disabled={!podeAvancar} onClick={() => setStep(2)}>
              {faltaMidia ? `Anexe ${NOME_MIDIA[headerFormat as string] === "imagem" ? "a imagem" : `o ${NOME_MIDIA[headerFormat as string]}`}` : "Configurar o disparo"}
            </button>
          </div>
        </div>
      )}

      {/* ── Passo 3: configuração ────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="card space-y-3">
            <label className="block">
              <span className="label">Nome da campanha</span>
              <input
                className="input"
                placeholder={store ? "Ofertas de novembro para clientes" : "Lojistas de BH — abertura"}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">Começar em (em branco = ao iniciar)</span>
                <input
                  type="datetime-local"
                  className="input"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="label">Limite por dia (0 = sem limite)</span>
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(Math.max(0, Number(e.target.value)))}
                />
              </label>
              <label className="block">
                <span className="label">Início da janela</span>
                <input
                  type="time"
                  className="input"
                  value={sendStart}
                  onChange={(e) => setSendStart(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="label">Fim da janela</span>
                <input
                  type="time"
                  className="input"
                  value={sendEnd}
                  onChange={(e) => setSendEnd(e.target.value)}
                />
              </label>
            </div>

            <div>
              <span className="label">Dias de disparo</span>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map(([n, label]) => (
                  <button
                    key={n}
                    onClick={() =>
                      setSendDays((d) =>
                        d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort(),
                      )
                    }
                    className={clsx(
                      "rounded-full px-3 py-1.5 text-xs font-semibold",
                      sendDays.includes(n) ? "pill-active" : "border border-line text-muted",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {store
                  ? "Mensagem de madrugada incomoda o cliente e derruba a nota de qualidade do número. A janela vale para o disparo e para o follow-up, no fuso de Brasília."
                  : "Prospecção às 3h da manhã queima a nota de qualidade do número. A janela vale para o disparo e para o follow-up, no fuso de Brasília."}
              </p>
            </div>

            <label className="block">
              <span className="label">Intervalo entre mensagens (segundos)</span>
              <input
                type="number"
                min={1}
                max={60}
                className="input w-32"
                value={throttleSeconds}
                onChange={(e) => setThrottleSeconds(Math.min(60, Math.max(1, Number(e.target.value))))}
              />
            </label>
          </div>

          {/* Cadência */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold">Cadência de follow-up</p>
                <p className="text-xs text-muted">
                  Quem não responder recebe outro toque, com outro ângulo. Se responder antes, a
                  cadência é cancelada sozinha.
                </p>
              </div>
              <button
                className="btn-ghost px-3 py-1.5 text-xs"
                onClick={() =>
                  setFollowups((f) => [...f, { template: "", hours: f.length === 0 ? 48 : 120 }])
                }
                disabled={followups.length >= 3}
              >
                Adicionar toque
              </button>
            </div>
            {followups.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_7rem_2rem] items-center gap-2">
                <select
                  className="input py-1.5 text-xs"
                  value={f.template}
                  onChange={(e) => {
                    const copia = [...followups];
                    copia[i] = { ...copia[i], template: e.target.value };
                    setFollowups(copia);
                  }}
                >
                  <option value="">— template do {i + 2}º toque —</option>
                  {(templates ?? []).map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="number"
                    min={1}
                    className="input py-1.5 text-xs"
                    value={f.hours}
                    onChange={(e) => {
                      const copia = [...followups];
                      copia[i] = { ...copia[i], hours: Math.max(1, Number(e.target.value)) };
                      setFollowups(copia);
                    }}
                  />
                  <span className="text-muted">h</span>
                </label>
                <button
                  className="rounded-full p-1.5 text-muted hover:bg-canvas"
                  onClick={() => setFollowups((list) => list.filter((_, j) => j !== i))}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(1)}>
              Voltar
            </button>
            <button className="btn-primary" onClick={() => setStep(3)}>
              Revisar
            </button>
          </div>
        </div>
      )}

      {/* ── Passo 4: revisar ─────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="card space-y-2 text-sm">
            <Linha label="Nome" value={name || "(sem nome)"} />
            <Linha
              label="Audiência"
              value={
                source === "cnpja"
                  ? "CNPJá"
                  : source === "targets"
                    ? "empresas da base"
                    : source === "pessoa"
                      ? `${pessoasSelecionadas} pessoa(s) da Procob`
                      : (Object.keys(porOrigem) as OrigemDoPublico[]).map((o) => ORIGEM_LABEL[o]).join(" + ") || "(vazia)"
              }
            />
            <Linha label="Template" value={`${templateName} (${template?.language ?? "pt_BR"})`} />
            {headerMidia && <Linha label="Cabeçalho" value={headerMidia.filename ?? NOME_MIDIA[headerFormat as string] ?? "arquivo"} />}
            <Linha
              label="Janela"
              value={describeWindow({
                send_start: sendStart,
                send_end: sendEnd,
                send_days: sendDays,
                timezone: "America/Sao_Paulo",
              })}
            />
            <Linha
              label="Ritmo"
              value={`1 a cada ${throttleSeconds}s${
                dailyLimit > 0 ? ` · máximo ${formatNumber(dailyLimit)}/dia` : ""
              }`}
            />
            <Linha
              label="Início"
              value={scheduledAt ? new Date(scheduledAt).toLocaleString("pt-BR") : "assim que iniciar"}
            />
            <Linha
              label="Cadência"
              value={
                followups.filter((f) => f.template).length > 0
                  ? followups
                      .filter((f) => f.template)
                      .map((f, i) => `${i + 2}º toque: ${f.template} em ${f.hours}h`)
                      .join(" · ")
                  : "sem follow-up"
              }
            />
            <Linha
              label="Custo estimado na Meta"
              value={`US$ ${estimateCostUsd(revisao?.recipients ?? totalAudiencia, template?.category).toFixed(2)} (${
                template?.category ?? "MARKETING"
              })`}
            />
          </div>

          {/* Quem recebe e quem fica de fora: a conferência do servidor. */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold">Quem vai receber</p>
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={revisar} disabled={revisando}>
                {revisando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Conferir de novo
              </button>
            </div>
            {revisando && !revisao ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Loader2 size={14} className="animate-spin" /> Conferindo opt-out, números e variáveis…
              </p>
            ) : erroRevisao ? (
              <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                {erroRevisao}
              </p>
            ) : revisao ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  <Numero label="Vão receber" valor={revisao.recipients} destaque />
                  <Numero label="Pediram para sair" valor={revisao.skippedOptOut} />
                  <Numero label="Variável vazia" valor={revisao.skippedEmptyParam} />
                  <Numero label="Número inválido" valor={revisao.skippedInvalid} />
                </div>
                <p className="text-[11px] text-muted">
                  {[
                    revisao.excluded > 0 ? `${formatNumber(revisao.excluded)} desmarcado(s) na lista` : null,
                    revisao.duplicates > 0 ? `${formatNumber(revisao.duplicates)} repetido(s) entraram uma vez só` : null,
                    revisao.withoutMobile > 0 ? `${formatNumber(revisao.withoutMobile)} contato(s) sem celular ficaram de fora` : null,
                    revisao.truncated ? "a fonte passou de 10 mil pessoas e foi cortada nas mais recentes" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Ninguém foi desmarcado nem estava repetido."}
                </p>
                {revisao.skippedSample.length > 0 && (
                  <details className="rounded-2xl border border-line">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">
                      Quem fica de fora e por quê ({formatNumber(revisao.skippedOptOut + revisao.skippedEmptyParam)})
                    </summary>
                    <ul className="max-h-56 divide-y divide-line overflow-y-auto text-xs">
                      {revisao.skippedSample.map((p) => (
                        <li key={p.phone} className="flex justify-between gap-2 px-3 py-1.5">
                          <span className="truncate">{p.name || formatPhoneBr(p.phone)}</span>
                          <span className="shrink-0 text-muted">{p.motivo}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {revisao.invalidSample.length > 0 && (
                  <p className="text-[11px] text-muted">
                    Números inválidos: {revisao.invalidSample.slice(0, 5).join(" · ")}
                    {revisao.skippedInvalid > 5 ? "…" : ""}
                  </p>
                )}
                {revisao.recipients === 0 && (
                  <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    Ninguém vai receber com esse público e esse mapeamento. Volte e ajuste antes de criar.
                  </p>
                )}
                <p className="text-[11px] text-muted">
                  Quem fica de fora aparece como &quot;pulado&quot;, com o motivo, no detalhe da campanha.
                </p>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <button className="btn-ghost" onClick={() => setStep(2)}>
              Voltar
            </button>
            <div className="flex gap-2">
              <button
                className="btn-ghost"
                disabled={salvando || revisando || !revisao || revisao.recipients === 0}
                onClick={() => criar(false)}
              >
                <Save size={15} /> Salvar rascunho
              </button>
              <button
                className="btn-primary"
                disabled={salvando || revisando || !revisao || revisao.recipients === 0}
                onClick={() => criar(true)}
              >
                {salvando ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                {scheduledAt ? "Agendar" : "Iniciar disparo"}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        <ListChecks size={12} /> O disparo roda no worker de 1 minuto, respeitando a janela e o
        limite diário.
      </p>
    </div>
  );
}

function FonteToggle({
  ativo,
  onToggle,
  icone,
  titulo,
  descricao,
  contagem,
  children,
}: {
  ativo: boolean;
  onToggle: () => void;
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  contagem?: number;
  children: React.ReactNode;
}) {
  return (
    <div className={clsx("rounded-2xl border p-3", ativo ? "border-brand-300 bg-brand-50/40" : "border-line")}>
      <label className="flex cursor-pointer items-start gap-2">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={ativo} onChange={onToggle} />
        <span className="mt-0.5 text-brand-700">{icone}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{titulo}</span>
          <span className="block text-xs text-muted">{descricao}</span>
        </span>
        {contagem !== undefined && (
          <span className="shrink-0 text-xs font-semibold text-brand-700">{formatNumber(contagem)}</span>
        )}
      </label>
      {ativo && <div className="mt-3 space-y-2 pl-6">{children}</div>}
    </div>
  );
}

function Numero({ label, valor, destaque }: { label: string; valor: number; destaque?: boolean }) {
  return (
    <div className={clsx("rounded-xl py-2", destaque ? "bg-brand-50" : "bg-canvas")}>
      <p className={clsx("text-sm font-bold", destaque ? "text-brand-700" : "text-ink-900")}>{formatNumber(valor)}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

function Linha({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}
