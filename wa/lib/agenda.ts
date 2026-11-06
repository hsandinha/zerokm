// Agenda de visita e test drive da loja: regras puras (sem banco), usadas pela
// tela, pelas rotas, pela IA (horarios_livres e agendar_visita) e pelo
// lembrete da véspera. Porte do que o Chatrun faz para salão
// (horarios-livres.ts, agendamento-pela-ia.ts), simplificado para loja de
// carro: não há profissional por serviço, há N visitas ao mesmo tempo (os
// vendedores da loja).
//
// Fuso fixo de Brasília (-03:00, sem horário de verão desde 2019). Toda data
// que entra sem fuso ("2026-11-12T15:00", o que a IA manda) é de Brasília:
// o servidor roda em UTC e `new Date()` direto erraria a hora em 3h.
//
// A configuração da agenda é dela, separada do horário de atendimento da
// loja: a loja pode atender no WhatsApp até as 22h e receber visita só até
// as 18h.

export type StatusAgendamento = "a_confirmar" | "confirmado" | "realizado" | "faltou" | "cancelado";
export type TipoAgendamento = "visita" | "test_drive";

export const STATUS_AGENDAMENTO: Array<{ chave: StatusAgendamento; rotulo: string }> = [
  { chave: "a_confirmar", rotulo: "A confirmar" },
  { chave: "confirmado", rotulo: "Confirmado" },
  { chave: "realizado", rotulo: "Realizado" },
  { chave: "faltou", rotulo: "Faltou" },
  { chave: "cancelado", rotulo: "Cancelado" },
];

export const TIPOS_AGENDAMENTO: Array<{ chave: TipoAgendamento; rotulo: string }> = [
  { chave: "visita", rotulo: "Visita" },
  { chave: "test_drive", rotulo: "Test drive" },
];

export function rotuloDoStatus(s: string): string {
  return STATUS_AGENDAMENTO.find((x) => x.chave === s)?.rotulo ?? s;
}
export function rotuloDoTipo(t: string): string {
  return TIPOS_AGENDAMENTO.find((x) => x.chave === t)?.rotulo ?? "Visita";
}
export function ehStatus(v: unknown): v is StatusAgendamento {
  return STATUS_AGENDAMENTO.some((s) => s.chave === v);
}
export function ehTipo(v: unknown): v is TipoAgendamento {
  return v === "visita" || v === "test_drive";
}

/** Ocupa vaga na agenda (o horário não está livre para outro). */
export function ocupaVaga(status: string): boolean {
  return status === "a_confirmar" || status === "confirmado";
}

// ── Configuração ─────────────────────────────────────────────

export type DiaDaAgenda = { dia: number; ativo: boolean; inicio: string; fim: string };

export type ConfigAgenda = {
  /** 0 = domingo … 6 = sábado, sempre os 7. */
  dias: DiaDaAgenda[];
  /** Quanto dura uma visita ou test drive. */
  duracaoMin: number;
  /** Folga entre uma visita e a próxima: os horários andam de (duração + intervalo). */
  intervaloMin: number;
  /** Quantas visitas ao mesmo tempo (vendedores livres). */
  simultaneas: number;
  /** Antecedência mínima para a IA oferecer um horário de hoje. */
  antecedenciaMin: number;
  lembrete: {
    ativo: boolean;
    /** Template aprovado para quando a janela de 24h estiver fechada. */
    templateName: string | null;
    templateLanguage: string | null;
  };
};

export const DIAS_DA_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export const CONFIG_PADRAO: ConfigAgenda = {
  dias: [
    { dia: 0, ativo: false, inicio: "09:00", fim: "13:00" },
    { dia: 1, ativo: true, inicio: "09:00", fim: "18:00" },
    { dia: 2, ativo: true, inicio: "09:00", fim: "18:00" },
    { dia: 3, ativo: true, inicio: "09:00", fim: "18:00" },
    { dia: 4, ativo: true, inicio: "09:00", fim: "18:00" },
    { dia: 5, ativo: true, inicio: "09:00", fim: "18:00" },
    { dia: 6, ativo: true, inicio: "09:00", fim: "13:00" },
  ],
  duracaoMin: 60,
  intervaloMin: 0,
  simultaneas: 1,
  antecedenciaMin: 60,
  lembrete: { ativo: true, templateName: null, templateLanguage: null },
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function minutosDe(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

export function horaDe(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

function inteiro(v: unknown, min: number, max: number, padrao: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : padrao;
}

/**
 * Valida a configuração que veio da tela. Devolve a config completa (o que
 * faltou fica no padrão) e os erros legíveis do que veio errado.
 */
export function validarConfig(bruto: unknown): { config: ConfigAgenda; errors: string[] } {
  const o = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {};
  const errors: string[] = [];
  const diasIn = Array.isArray(o.dias) ? (o.dias as Array<Record<string, unknown>>) : [];
  const dias = CONFIG_PADRAO.dias.map((padrao) => {
    const d = diasIn.find((x) => Number(x?.dia) === padrao.dia);
    if (!d) return { ...padrao };
    const inicio = String(d.inicio ?? padrao.inicio);
    const fim = String(d.fim ?? padrao.fim);
    const ativo = d.ativo === true;
    if (!HHMM.test(inicio) || !HHMM.test(fim)) {
      errors.push(`${DIAS_DA_SEMANA[padrao.dia]}: use o horário no formato 09:00.`);
      return { ...padrao, ativo };
    }
    if (ativo && minutosDe(fim) <= minutosDe(inicio)) {
      errors.push(`${DIAS_DA_SEMANA[padrao.dia]}: o fim precisa ser depois do início.`);
    }
    return { dia: padrao.dia, ativo, inicio, fim };
  });
  const lem = o.lembrete && typeof o.lembrete === "object" ? (o.lembrete as Record<string, unknown>) : {};
  const templateName = typeof lem.templateName === "string" && lem.templateName.trim() ? lem.templateName.trim().slice(0, 200) : null;
  const config: ConfigAgenda = {
    dias,
    duracaoMin: inteiro(o.duracaoMin, 15, 480, CONFIG_PADRAO.duracaoMin),
    intervaloMin: inteiro(o.intervaloMin, 0, 240, CONFIG_PADRAO.intervaloMin),
    simultaneas: inteiro(o.simultaneas, 1, 50, CONFIG_PADRAO.simultaneas),
    antecedenciaMin: inteiro(o.antecedenciaMin, 0, 24 * 60, CONFIG_PADRAO.antecedenciaMin),
    lembrete: {
      ativo: lem.ativo !== false,
      templateName,
      templateLanguage: templateName
        ? typeof lem.templateLanguage === "string" && lem.templateLanguage.trim()
          ? lem.templateLanguage.trim().slice(0, 20)
          : "pt_BR"
        : null,
    },
  };
  if (o.duracaoMin != null && config.duracaoMin !== Math.round(Number(o.duracaoMin))) errors.push("Duração entre 15 e 480 minutos.");
  if (o.intervaloMin != null && config.intervaloMin !== Math.round(Number(o.intervaloMin))) errors.push("Intervalo entre 0 e 240 minutos.");
  if (o.simultaneas != null && config.simultaneas !== Math.round(Number(o.simultaneas))) errors.push("Visitas ao mesmo tempo: de 1 a 50.");
  return { config, errors };
}

/** Config gravada (pode estar incompleta ou ser de uma versão antiga). */
export function normalizarConfig(bruto: unknown): ConfigAgenda {
  return validarConfig(bruto).config;
}

export function agendaTemDia(config: ConfigAgenda): boolean {
  return config.dias.some((d) => d.ativo && minutosDe(d.fim) > minutosDe(d.inicio));
}

// ── Datas em Brasília ────────────────────────────────────────

const OFFSET = "-03:00";
const MINUTO = 60_000;
const DIA_MS = 86_400_000;

/** Instante (ms) de "AAAA-MM-DD" + "HH:MM" em Brasília. */
export function instanteLocal(data: string, hora: string): number {
  return Date.parse(`${data}T${hora}:00${OFFSET}`);
}

/** "AAAA-MM-DD" de um instante, em Brasília. */
export function dataLocal(instante: number | Date): string {
  const t = typeof instante === "number" ? instante : instante.getTime();
  return new Date(t - 3 * 3600_000).toISOString().slice(0, 10);
}

/** "HH:MM" de um instante, em Brasília. */
export function horaLocal(instante: number | Date): string {
  const t = typeof instante === "number" ? instante : instante.getTime();
  return new Date(t - 3 * 3600_000).toISOString().slice(11, 16);
}

export function hojeEmSaoPaulo(agora: number = Date.now()): string {
  return dataLocal(agora);
}

/** Soma dias a "AAAA-MM-DD" (meio-dia UTC evita qualquer borda de fuso). */
export function somarDias(data: string, dias: number): string {
  return new Date(Date.parse(`${data}T12:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(data: string): number {
  return new Date(`${data}T12:00:00Z`).getUTCDay();
}

/** Segunda-feira da semana da data (a semana da agenda vai de seg a dom). */
export function inicioDaSemana(data: string): string {
  const d = diaDaSemana(data);
  return somarDias(data, d === 0 ? -6 : 1 - d);
}

/** "sábado, 08/11", como o cliente lê no WhatsApp. */
export function rotuloDoDia(data: string): string {
  const [, mes, dia] = data.split("-");
  return `${DIAS_DA_SEMANA[diaDaSemana(data)]}, ${dia}/${mes}`;
}

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function dataValida(a: number, m: number, d: number): string | null {
  const iso = `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : null;
}

const SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

/** "2026-10-31", "31/10", "31/10/2026", "hoje", "amanhã", "sábado" → "AAAA-MM-DD".
 *  Sem ano, é a próxima vez que a data acontece; dia da semana, o próximo
 *  (hoje inclusive). */
export function lerDia(valor: unknown, hoje: string): string | null {
  const v = semAcento(String(valor ?? ""));
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return dataValida(Number(m[1]), Number(m[2]), Number(m[3]));
  m = v.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const anoDeHoje = Number(hoje.slice(0, 4));
    if (m[3]) return dataValida(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[2]), Number(m[1]));
    const neste = dataValida(anoDeHoje, Number(m[2]), Number(m[1]));
    if (!neste) return null;
    return neste >= hoje ? neste : dataValida(anoDeHoje + 1, Number(m[2]), Number(m[1]));
  }
  if (v === "hoje") return hoje;
  if (v === "amanha") return somarDias(hoje, 1);
  if (v === "depois de amanha") return somarDias(hoje, 2);
  const curto = v.replace(/-feira\b.*$/, "").replace(/\.$/, "");
  const i = SEMANA.findIndex((d) => curto.startsWith(d) || (curto.length >= 3 && d.startsWith(curto)));
  if (i >= 0) return somarDias(hoje, (i - diaDaSemana(hoje) + 7) % 7);
  return null;
}

/** "10:30", "10h30", "10h", "10", "10:30:00" → "HH:MM". */
export function lerHora(valor: unknown): string | null {
  const v = semAcento(String(valor ?? "")).replace(/\s+/g, "");
  if (v === "meio-dia" || v === "meiodia") return "12:00";
  const m = v.match(/^(\d{1,2})(?:[:h](\d{2}))?(?::\d{2})?(?:h|hs|horas?)?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export type Periodo = "manha" | "tarde" | "noite";

export function lerPeriodo(valor: unknown): Periodo | null {
  const v = semAcento(String(valor ?? ""));
  if (/manh/.test(v)) return "manha";
  if (/tarde/.test(v)) return "tarde";
  if (/noite/.test(v)) return "noite";
  return null;
}

export function noPeriodo(hora: string, periodo: Periodo | null): boolean {
  if (!periodo) return true;
  const m = minutosDe(hora);
  if (periodo === "manha") return m < 12 * 60;
  if (periodo === "tarde") return m >= 12 * 60 && m < 18 * 60;
  return m >= 18 * 60;
}

/**
 * Data e hora que a IA mandou em ISO. Sem fuso, é Brasília. Com fuso (Z ou
 * ±hh:mm), vale o que veio. null = não deu para ler.
 */
export function lerDataHoraIso(valor: unknown): Date | null {
  const v = String(valor ?? "").trim();
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return null;
  const t = m[3] ? Date.parse(v.replace(" ", "T")) : instanteLocal(m[1], m[2]);
  return Number.isFinite(t) ? new Date(t) : null;
}

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "dia 15" sem mês: o próximo dia 15, deste mês se ainda não passou, senão
 *  do seguinte (31 em mês de 30 dias pula para o próximo mês que tem). */
export function proximoDiaDoMes(dia: number, hoje: string): string | null {
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return null;
  let ano = Number(hoje.slice(0, 4));
  let mes = Number(hoje.slice(5, 7));
  for (let i = 0; i < 12; i++) {
    const d = dataValida(ano, mes, dia);
    if (d && d >= hoje) return d;
    mes = mes === 12 ? 1 : mes + 1;
    if (mes === 1) ano++;
  }
  return null;
}

/**
 * O "quando" que o cliente disse em texto livre ("sábado de manhã",
 * "12/11 às 15h", "dia 15 às 14h", "20 de novembro", "amanhã 10h30"): o dia,
 * a hora e o período que der para tirar. Serve de reserva quando a IA não
 * mandou data_iso.
 */
export function lerQuando(texto: unknown, hoje: string): { data: string | null; hora: string | null; periodo: Periodo | null } {
  const v = semAcento(String(texto ?? ""));
  let data: string | null = null;
  const dm = v.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/);
  if (dm) data = lerDia(dm[1], hoje);
  if (!data) {
    const pm = v.match(new RegExp(`\\b(\\d{1,2}) de (${MESES.join("|")})\\b`));
    if (pm) data = lerDia(`${pm[1]}/${MESES.indexOf(pm[2]) + 1}`, hoje);
  }
  if (!data) {
    // Sem isto, "dia 15 às 14h" virava amanhã às 14h.
    const dd = v.match(/\bdia (\d{1,2})\b(?![:/])/);
    if (dd) data = proximoDiaDoMes(Number(dd[1]), hoje);
  }
  if (!data) {
    if (/\bdepois de amanha\b/.test(v)) data = somarDias(hoje, 2);
    else if (/\bamanha\b/.test(v)) data = somarDias(hoje, 1);
    else if (/\bhoje\b/.test(v)) data = hoje;
    else {
      const i = SEMANA.findIndex((d) => new RegExp(`\\b${d}`).test(v));
      if (i >= 0) data = somarDias(hoje, (i - diaDaSemana(hoje) + 7) % 7);
    }
  }
  let hora: string | null = null;
  const hm = v.match(/\b(\d{1,2})\s*(?:h|:)\s*(\d{2})?\b/) ?? v.match(/\bas (\d{1,2})\b/);
  if (hm) hora = lerHora(`${hm[1]}:${hm[2] ?? "00"}`);
  if (!hora && /meio-?dia/.test(v)) hora = "12:00";
  return { data, hora, periodo: lerPeriodo(v) };
}

// ── Pedido da IA ─────────────────────────────────────────────

const HORA_MS = 3600_000;
const HORA_DO_PERIODO = { manha: "09:00", tarde: "14:00", noite: "18:00" } as const;

/** Primeiro horário de visita do dia na configuração (ou 10h). */
function aberturaDoDia(config: ConfigAgenda | null, data: string): string {
  const d = config?.dias.find((x) => x.dia === diaDaSemana(data));
  return d?.ativo ? d.inicio : "10:00";
}

/**
 * O instante do pedido do cliente: a data_iso da IA (Brasília), senão o que
 * der para ler do "quando" em texto. Sem dia claro, fica no próximo dia de
 * visita, marcado como aproximado: a equipe combina.
 */
export function inicioDoPedido(
  input: { data_iso?: unknown; quando?: unknown },
  config: ConfigAgenda | null,
  agora: number = Date.now(),
): { inicio: Date; aproximado: boolean } {
  const iso = lerDataHoraIso(input.data_iso);
  if (iso && iso.getTime() > agora - HORA_MS) return { inicio: iso, aproximado: false };
  const hoje = hojeEmSaoPaulo(agora);
  const q = lerQuando(input.quando, hoje);
  if (q.data) {
    const hora = q.hora ?? (q.periodo ? HORA_DO_PERIODO[q.periodo] : aberturaDoDia(config, q.data));
    const inicio = new Date(instanteLocal(q.data, hora));
    if (inicio.getTime() > agora - HORA_MS) return { inicio, aproximado: !q.hora };
  }
  // A partir de amanhã: hoje a equipe não teria tempo de combinar.
  const amanha = instanteLocal(somarDias(hoje, 1), "00:00");
  const dia = (config ? proximosDiasAbertos(config, amanha, 1)[0] : null) ?? somarDias(hoje, 1);
  const hora = q.hora ?? (q.periodo ? HORA_DO_PERIODO[q.periodo] : aberturaDoDia(config, dia));
  return { inicio: new Date(instanteLocal(dia, hora)), aproximado: true };
}

// ── Horários livres ──────────────────────────────────────────

/** Intervalo ocupado, em ms desde 1970. */
export type Ocupacao = { inicio: number; fim: number };

export function ocupacoesDe(
  agendamentos: Array<{ inicio: Date | string; duracaoMin?: number | null; status: string }>,
  duracaoPadrao = CONFIG_PADRAO.duracaoMin,
): Ocupacao[] {
  return agendamentos
    .filter((a) => ocupaVaga(a.status))
    .map((a) => {
      const inicio = new Date(a.inicio).getTime();
      return { inicio, fim: inicio + (a.duracaoMin || duracaoPadrao) * MINUTO };
    })
    .filter((o) => Number.isFinite(o.inicio));
}

/**
 * Horários livres ("HH:MM") de um dia. Pura: recebe tudo pronto.
 *  - os horários andam de (duração + intervalo) a partir do início do dia, e
 *    a visita precisa TERMINAR até o fim do horário de visita;
 *  - livre = menos visitas sobrepostas do que a loja atende ao mesmo tempo;
 *  - hoje, só a partir de agora + antecedência.
 */
export function calcularHorariosLivres(p: {
  config: ConfigAgenda;
  data: string;
  agora: number;
  ocupacoes: Ocupacao[];
  duracaoMin?: number;
}): string[] {
  const dia = p.config.dias.find((d) => d.dia === diaDaSemana(p.data));
  if (!dia?.ativo) return [];
  const duracao = Math.max(15, p.duracaoMin ?? p.config.duracaoMin);
  const passo = duracao + Math.max(0, p.config.intervaloMin);
  const primeiro = p.agora + p.config.antecedenciaMin * MINUTO;
  const livres: string[] = [];
  for (let m = minutosDe(dia.inicio); m + duracao <= minutosDe(dia.fim); m += passo) {
    const hora = horaDe(m);
    const inicio = instanteLocal(p.data, hora);
    if (inicio < primeiro) continue;
    const fim = inicio + duracao * MINUTO;
    const sobrepostas = p.ocupacoes.filter((o) => o.inicio < fim && o.fim > inicio).length;
    if (sobrepostas < Math.max(1, p.config.simultaneas)) livres.push(hora);
  }
  return livres;
}

/** Próximos `quantos` dias com horário de visita, a partir de hoje (hoje só
 *  se ainda cabe uma visita). Teto de 8 semanas. */
export function proximosDiasAbertos(config: ConfigAgenda, agora: number, quantos: number): string[] {
  const hoje = hojeEmSaoPaulo(agora);
  const dias: string[] = [];
  for (let i = 0; i < 56 && dias.length < quantos; i++) {
    const data = somarDias(hoje, i);
    const d = config.dias.find((x) => x.dia === diaDaSemana(data));
    if (!d?.ativo || minutosDe(d.fim) <= minutosDe(d.inicio)) continue;
    if (i === 0 && instanteLocal(data, d.fim) - config.duracaoMin * MINUTO < agora + config.antecedenciaMin * MINUTO) continue;
    dias.push(data);
  }
  return dias;
}

/** Por que o horário não cabe na agenda: "fechado" (fora do dia ou do
 *  horário de visita) ou "lotado" (já tem as visitas ao mesmo tempo que a
 *  loja atende). null = cabe. */
export function conflitoDoHorario(p: {
  config: ConfigAgenda;
  inicio: Date;
  duracaoMin: number;
  ocupacoes: Ocupacao[];
}): "fechado" | "lotado" | null {
  const data = dataLocal(p.inicio);
  const dia = p.config.dias.find((d) => d.dia === diaDaSemana(data));
  if (!dia?.ativo) return "fechado";
  const m = minutosDe(horaLocal(p.inicio));
  if (m < minutosDe(dia.inicio) || m + p.duracaoMin > minutosDe(dia.fim)) return "fechado";
  const ini = p.inicio.getTime();
  const fim = ini + p.duracaoMin * MINUTO;
  const sobrepostas = p.ocupacoes.filter((o) => o.inicio < fim && o.fim > ini).length;
  return sobrepostas < Math.max(1, p.config.simultaneas) ? null : "lotado";
}

/** O horário cabe na agenda (dia de visita, dentro do horário, com vaga)? */
export function horarioCabe(p: { config: ConfigAgenda; inicio: Date; duracaoMin: number; ocupacoes: Ocupacao[] }): boolean {
  return conflitoDoHorario(p) === null;
}

/** Texto da ferramenta horarios_livres para a IA: um dia por linha, com a
 *  data em ISO para ela preencher o agendar_visita. */
export function horariosParaIa(porDia: Array<{ data: string; horas: string[] }>, periodo: Periodo | null, pedido?: string | null): string {
  const linhas = porDia
    .map(({ data, horas }) => ({ data, horas: horas.filter((h) => noPeriodo(h, periodo)).slice(0, 6) }))
    .filter((d) => d.horas.length > 0)
    .slice(0, 3)
    .map((d) => `- ${rotuloDoDia(d.data)} (${d.data}): ${d.horas.join(", ")}`);
  const cabecalho =
    pedido && !porDia.some((d) => d.data === pedido && d.horas.some((h) => noPeriodo(h, periodo)))
      ? `Sem horário livre em ${rotuloDoDia(pedido)}${periodo ? ` (${periodo === "manha" ? "manhã" : periodo})` : ""}.`
      : null;
  if (!linhas.length) {
    return [cabecalho, "Nenhum horário livre nos próximos dias. Pergunte o dia e o horário que o cliente prefere e agende como pedido: a equipe confirma."]
      .filter(Boolean)
      .join("\n");
  }
  return [
    cabecalho,
    "Horários livres (ofereça 2 ou 3; ao agendar, mande data_iso no formato AAAA-MM-DDTHH:mm):",
    ...linhas,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Lembrete da véspera ──────────────────────────────────────

export type DadosDoLembrete = {
  nome: string | null;
  tipo: string;
  inicio: Date;
  loja: string;
  veiculo?: string | null;
};

const primeiroNome = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "";

/** Texto livre do lembrete (janela de 24h aberta). */
export function textoDoLembrete(d: DadosDoLembrete): string {
  const nome = primeiroNome(d.nome);
  const oQue = d.tipo === "test_drive" ? "do seu test drive" : "da sua visita";
  const carro = d.veiculo?.trim() ? `, para ver o ${d.veiculo.trim()}` : "";
  return `Oi${nome ? `, ${nome}` : ""}! Passando para lembrar ${oQue} na ${d.loja} amanhã, ${rotuloDoDia(dataLocal(d.inicio))}, às ${horaLocal(d.inicio)}${carro}. Se precisar mudar o horário, é só responder aqui. 😊`;
}

/**
 * Variáveis do template de lembrete, sempre nesta ordem (a tela da
 * configuração mostra): {{1}} nome, {{2}} dia, {{3}} horário, {{4}} loja,
 * {{5}} carro. Nenhuma vai vazia: a Meta recusa o envio inteiro.
 */
export function variaveisDoLembrete(d: DadosDoLembrete): string[] {
  return [
    primeiroNome(d.nome) || "cliente",
    rotuloDoDia(dataLocal(d.inicio)),
    horaLocal(d.inicio),
    d.loja || "nossa loja",
    d.veiculo?.trim() || (d.tipo === "test_drive" ? "o test drive" : "a visita"),
  ];
}

// ── Validação do agendamento vindo da tela ───────────────────

export type EntradaAgendamento = {
  tipo?: TipoAgendamento;
  inicio?: Date;
  duracaoMin?: number;
  status?: StatusAgendamento;
  responsavel?: string | null;
  observacao?: string | null;
  veiculo?: string | null;
  veiculoId?: string | null;
  contatoNome?: string | null;
  contatoTelefone?: string | null;
  conversationId?: string | null;
};

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/**
 * Valida o que a tela mandou. `partial` = edição: só o que veio. Data e hora
 * chegam separadas ("AAAA-MM-DD" + "HH:MM", Brasília) ou como `inicio` ISO.
 */
export function validarAgendamento(
  input: Record<string, unknown>,
  partial = false,
): { data: EntradaAgendamento; errors: string[] } {
  const errors: string[] = [];
  const data: EntradaAgendamento = {};
  const has = (k: string) => !partial || Object.prototype.hasOwnProperty.call(input, k);
  const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  if (has("tipo")) {
    const t = txt(input.tipo, 20) || "visita";
    if (ehTipo(t)) data.tipo = t;
    else errors.push("Tipo deve ser visita ou test drive.");
  }

  if (has("data") || has("hora") || has("inicio")) {
    let inicio: Date | null = null;
    if (typeof input.inicio === "string" && input.inicio) inicio = lerDataHoraIso(input.inicio) ?? new Date(input.inicio);
    else {
      const dia = txt(input.data, 10);
      const hora = lerHora(input.hora);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dia) && hora) inicio = new Date(instanteLocal(dia, hora));
    }
    if (!inicio || Number.isNaN(inicio.getTime())) errors.push("Escolha o dia e o horário.");
    else data.inicio = inicio;
  }

  if (has("duracaoMin")) {
    const n = Math.round(Number(input.duracaoMin ?? 60));
    if (Number.isFinite(n) && n >= 15 && n <= 480) data.duracaoMin = n;
    else errors.push("Duração entre 15 e 480 minutos.");
  }

  if (has("status")) {
    const s = txt(input.status, 20) || "a_confirmar";
    if (ehStatus(s)) data.status = s;
    else errors.push("Status inválido.");
  }

  if (has("responsavel")) {
    const r = txt(input.responsavel, 200).toLowerCase();
    if (r && !/^[^\s@]+@[^\s@]+$/.test(r)) errors.push("Responsável inválido.");
    else data.responsavel = r || null;
  }

  if (has("observacao")) data.observacao = txt(input.observacao, 1000) || null;
  if (has("veiculo")) data.veiculo = txt(input.veiculo, 160) || null;
  if (has("veiculoId")) {
    const id = txt(input.veiculoId, 24);
    if (id && !OBJECT_ID.test(id)) errors.push("Carro inválido.");
    else data.veiculoId = id || null;
  }
  if (has("contatoNome")) data.contatoNome = txt(input.contatoNome, 120) || null;
  if (has("contatoTelefone")) data.contatoTelefone = txt(input.contatoTelefone, 30) || null;
  if (has("conversationId")) {
    const id = txt(input.conversationId, 24);
    if (id && !OBJECT_ID.test(id)) errors.push("Conversa inválida.");
    else data.conversationId = id || null;
  }

  return { data, errors };
}
