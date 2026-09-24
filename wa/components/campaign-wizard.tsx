"use client";

// Assistente de nova campanha em 4 passos: Audiência → Template →
// Configuração → Revisar.
//
// A audiência vem primeiro porque é ela que dá as variáveis do template: sem
// saber se cada destinatário tem nome, empresa e cidade, não dá para mapear
// {{1}}, {{2}}, {{3}} — e variável vazia faz a Meta recusar a mensagem
// inteira, com a campanha já rodando.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  FileUp,
  ListChecks,
  Loader2,
  Play,
  Save,
  Search,
  Users,
  X,
} from "lucide-react";
import { parseCsv } from "@wa/lib/audience/csv";
import { applyMapping } from "@wa/lib/audience/mapping";
import type { AudienceField, ColumnMapping } from "@wa/lib/audience/types";
import { formatPhoneBr, parsePhoneBr } from "@wa/lib/phone";
import { formatCnpj } from "@wa/lib/documento";
import { formatNumber } from "@wa/lib/stages";
import { describeWindow } from "@wa/lib/send-window";
import { estimateCostUsd } from "@wa/lib/campaign-status";
import {
  PARAM_LABEL,
  countBodyVars,
  defaultParamMap,
  emptyParamPositions,
  renderTemplateBody,
  resolveParams,
  type ParamMapItem,
  type ParamType,
} from "@wa/lib/campaign-params";

const STEPS = ["Audiência", "Template", "Configuração", "Revisar"];

const PARAM_TYPES: ParamType[] = [
  "first_name",
  "full_name",
  "company",
  "city",
  "state",
  "phone",
  "fixed",
];

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

type Source = "cnpja" | "targets" | "pessoa" | "csv";

type Template = {
  name: string;
  language: string;
  category: string;
  status: string;
  body: string;
  variables: number;
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

export function CampaignWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // ── Passo 1: audiência ──────────────────────────────────────
  const [source, setSource] = useState<Source>("cnpja");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [buscando, setBuscando] = useState(false);

  // CNPJá
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

  // CSV
  const [csv, setCsv] = useState<{
    file: string;
    headers: string[];
    rows: Array<Record<string, string>>;
    mapping: ColumnMapping;
  } | null>(null);

  // ── Passo 2: template ───────────────────────────────────────
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [paramsMap, setParamsMap] = useState<ParamMapItem[]>([]);

  // ── Passo 3: configuração ───────────────────────────────────
  const [name, setName] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sendStart, setSendStart] = useState("09:00");
  const [sendEnd, setSendEnd] = useState("18:00");
  const [sendDays, setSendDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [dailyLimit, setDailyLimit] = useState(0);
  const [throttleSeconds, setThrottleSeconds] = useState(4);
  const [followups, setFollowups] = useState<Array<{ template: string; hours: number }>>([]);

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
  const varCount = template ? countBodyVars(template.body) : 0;

  // Trocar de template refaz o mapeamento: o número de variáveis muda.
  useEffect(() => {
    if (!template) return;
    setParamsMap((atual) =>
      atual.length === varCount ? atual : defaultParamMap(varCount),
    );
  }, [template, varCount]);

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
    if (source === "targets" && !base) carregarBase();
    if (source === "pessoa" && people.length === 0) carregarPessoas("");
  }, [source, base, people.length, carregarBase, carregarPessoas]);

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
    const text = await file.text();
    const parsed = parseCsv(text);
    setCsv({
      file: file.name,
      headers: parsed.headers,
      rows: parsed.raw,
      mapping: parsed.suggestedMapping,
    });
    aplicarCsv(parsed.raw, parsed.suggestedMapping);
  }

  function aplicarCsv(rows: Array<Record<string, string>>, mapping: ColumnMapping) {
    const out: Recipient[] = [];
    let invalidos = 0;
    for (const raw of rows) {
      const row = applyMapping(raw, mapping);
      const parsed = parsePhoneBr(row.phone);
      if (!parsed.valid || !parsed.e164) {
        invalidos++;
        continue;
      }
      out.push({
        phone: parsed.e164,
        name: row.contactName ?? null,
        company: row.company ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        cnpj: row.cnpj ?? null,
      });
    }
    setRecipients(out);
    setAviso(
      invalidos > 0
        ? `${invalidos} linha(s) sem telefone válido ficaram de fora.`
        : null,
    );
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
        : recipients.length;

  // Prévia com o primeiro destinatário — é o texto que a pessoa vai receber.
  const amostra: Recipient | null =
    source === "targets"
      ? (base?.sample[0] ?? null)
      : source === "pessoa"
        ? people.find((p) => selectedPeople[p.partnerId])
          ? {
              phone: Object.values(selectedPeople)[0]?.[0] ?? "",
              name: people.find((p) => selectedPeople[p.partnerId])?.name ?? null,
            }
          : null
        : (recipients[0] ?? null);

  const paramsAmostra = amostra
    ? resolveParams(paramsMap, {
        phone: amostra.phone,
        contactName: amostra.name ?? null,
        company: amostra.company ?? null,
        city: amostra.city ?? null,
        state: amostra.state ?? null,
      })
    : [];
  const vaziosAmostra = emptyParamPositions(paramsAmostra);

  async function criar(iniciar: boolean) {
    setSalvando(true);
    setErro(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim() || `Campanha ${new Date().toLocaleDateString("pt-BR")}`,
        templateName,
        templateLanguage: template?.language,
        paramsMap,
        source,
        start: iniciar,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        sendStart,
        sendEnd,
        sendDays,
        dailyLimit,
        throttleSeconds,
        followupTemplates: followups.map((f) => f.template).filter(Boolean),
        followupDelaysHours: followups.map((f) => f.hours),
      };

      if (source === "cnpja" || source === "csv") {
        payload.recipients = recipients;
        payload.filters = source === "cnpja" ? { cnae, uf, city } : undefined;
      } else if (source === "pessoa") {
        payload.partners = Object.entries(selectedPeople).map(([partnerId, phones]) => ({
          partnerId,
          phones,
        }));
      } else {
        payload.limit = baseLimit;
      }

      const res = await fetch("/api/wa/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao criar a campanha");
      router.push(`/dashboard/admin/whatsapp/campanhas/${body.campaignId}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao criar a campanha");
    } finally {
      setSalvando(false);
    }
  }

  const podeAvancar =
    step === 0
      ? totalAudiencia > 0
      : step === 1
        ? Boolean(template) && vaziosAmostra.length === 0
        : true;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/admin/whatsapp/campanhas" className="rounded-full p-2 text-muted hover:bg-canvas">
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
          {erro}
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
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["cnpja", "Buscar no CNPJá"],
                ["targets", "Empresas da base"],
                ["pessoa", "Por pessoa (Procob)"],
                ["csv", "Importar CSV"],
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
                  <Link href="/dashboard/admin/whatsapp/contatos/enriquecer" className="text-xs text-brand-700 hover:underline">
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
                    <Link href="/dashboard/admin/whatsapp/contatos/enriquecer" className="text-brand-700 hover:underline">
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

          {source === "csv" && (
            <div className="card space-y-3">
              <p className="text-sm text-muted">
                O arquivo pode vir com qualquer cabeçalho: as colunas são detectadas e você confirma
                antes de disparar.
              </p>
              <label className="btn-ghost inline-flex cursor-pointer px-4 py-2 text-xs">
                <FileUp size={14} /> Escolher arquivo
                <input
                  type="file"
                  accept=".csv,text/csv"
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
                            aplicarCsv(csv.rows, mapping);
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
                    {formatNumber(recipients.length)} telefone(s) válido(s).
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm">
              <Users size={15} className="text-muted" />
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
                Nenhum template aprovado neste WABA.{" "}
                <Link href="/dashboard/admin/whatsapp/templates" className="underline">
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
                  <p className="whitespace-pre-wrap text-sm">{template.body}</p>
                </div>

                {varCount > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      De onde vem cada variável
                    </p>
                    {paramsMap.map((p, i) => (
                      <div key={i} className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2">
                        <span className="text-xs font-bold text-muted">{`{{${i + 1}}}`}</span>
                        <select
                          className="input py-1.5 text-xs"
                          value={p.type}
                          onChange={(e) => {
                            const copia = [...paramsMap];
                            copia[i] = { ...copia[i], type: e.target.value as ParamType };
                            setParamsMap(copia);
                          }}
                        >
                          {PARAM_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {PARAM_LABEL[t]}
                            </option>
                          ))}
                        </select>
                        {p.type === "fixed" ? (
                          <input
                            className="input py-1.5 text-xs"
                            placeholder="texto fixo"
                            value={p.value ?? ""}
                            onChange={(e) => {
                              const copia = [...paramsMap];
                              copia[i] = { ...copia[i], value: e.target.value };
                              setParamsMap(copia);
                            }}
                          />
                        ) : (
                          <span className="truncate text-xs text-muted">
                            {paramsAmostra[i] || "—"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {vaziosAmostra.length > 0 && (
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
                      Prévia para {amostra.name ?? formatPhoneBr(amostra.phone)}
                    </p>
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
              Configurar o disparo
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
                placeholder="Lojistas de BH — abertura"
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
                Prospecção às 3h da manhã queima a nota de qualidade do número. A janela vale para o
                disparo e para o follow-up, no fuso de Brasília.
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
              value={`${formatNumber(totalAudiencia)} destinatário(s) · ${
                source === "cnpja"
                  ? "CNPJá"
                  : source === "targets"
                    ? "empresas da base"
                    : source === "pessoa"
                      ? `${pessoasSelecionadas} pessoa(s) da Procob`
                      : "CSV"
              }`}
            />
            <Linha label="Template" value={`${templateName} (${template?.language ?? "pt_BR"})`} />
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
              value={`US$ ${estimateCostUsd(totalAudiencia, template?.category).toFixed(2)} (${
                template?.category ?? "MARKETING"
              })`}
            />
          </div>

          <p className="rounded-2xl border border-line bg-canvas px-4 py-3 text-xs text-muted">
            Quem pediu opt-out fica de fora automaticamente, e quem ficaria com variável vazia
            também — os dois aparecem como &quot;pulados&quot; no detalhe da campanha.
          </p>

          <div className="flex flex-wrap justify-between gap-2">
            <button className="btn-ghost" onClick={() => setStep(2)}>
              Voltar
            </button>
            <div className="flex gap-2">
              <button className="btn-ghost" disabled={salvando} onClick={() => criar(false)}>
                <Save size={15} /> Salvar rascunho
              </button>
              <button className="btn-primary" disabled={salvando} onClick={() => criar(true)}>
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

function Linha({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}
