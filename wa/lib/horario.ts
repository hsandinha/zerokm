// Horário de atendimento da loja: dias da semana, faixas de horário e datas
// fechadas (feriados, férias coletivas). Puro, sem banco: roda na tela de
// Configuração e no servidor (aviso fora do horário, fila da equipe).
//
// O horário vale para a EQUIPE. A IA continua respondendo 24h; o que muda
// fora do horário é o que se promete ao cliente ("a equipe volta amanhã às
// 8h", nunca "em instantes") e quando a fila começa a contar para alguém.
//
// Fuso: America/Sao_Paulo, fixo em UTC-3 (o Brasil não tem horário de verão
// desde 2019), o mesmo atalho de wa/lib/dates.ts.

export type FaixaHorario = { abre: string; fecha: string };
/** 0 = domingo … 6 = sábado. Sem faixas = fechado o dia todo. */
export type DiaHorario = { dia: number; faixas: FaixaHorario[] };
/** Data fechada (feriado, inventário, férias): "2026-12-25". */
export type DataFechada = { data: string; nome?: string };

export type HorarioLoja = {
  /** Desligado = atendimento sem horário (como sempre foi). */
  ativo: boolean;
  dias: DiaHorario[];
  feriados: DataFechada[];
  /** Mensagem automática fora do horário. Vazio = a padrão. */
  mensagem: string;
  /** No máximo uma mensagem automática por conversa a cada N horas. */
  intervaloHoras: number;
};

export const DIAS_DA_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export const MAX_FAIXAS_POR_DIA = 3;
export const MAX_DATAS_FECHADAS = 60;
export const INTERVALO_PADRAO_HORAS = 12;

/** Marcadores da mensagem: {{horario}} (resumo da semana) e {{volta}}
 *  ("amanhã a partir das 8h"). */
export const MENSAGEM_FORA_PADRAO =
  "Olá! Recebemos a sua mensagem. Nosso horário de atendimento é {{horario}}. Nossa equipe responde {{volta}}.";

/** Junto da transferência da IA fora do horário: a IA acabou de dizer que um
 *  vendedor assume, e este aviso diz quando. */
export const AVISO_TRANSFERENCIA_FORA =
  "Nossa equipe está fora do horário agora e volta {{volta}}. A sua conversa já está com eles.";

const OFFSET_MS = -3 * 3600_000;
const DIA_MS = 86400_000;

/** Padrão de loja de carro: segunda a sexta 8h às 18h, sábado 8h às 13h. */
export function horarioPadrao(): HorarioLoja {
  return {
    ativo: false,
    dias: Array.from({ length: 7 }, (_, dia) => ({
      dia,
      faixas:
        dia === 0 ? [] : dia === 6 ? [{ abre: "08:00", fecha: "13:00" }] : [{ abre: "08:00", fecha: "18:00" }],
    })),
    feriados: [],
    mensagem: "",
    intervaloHoras: INTERVALO_PADRAO_HORAS,
  };
}

/** "9:00", "09:00:00" e "0900" viram "09:00"; inválido vira null. */
export function hhmm(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const m = valor.trim().match(/^(\d{1,2}):?(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function minutos(valor: string): number {
  const [h, m] = valor.split(":").map(Number);
  return h * 60 + m;
}

/** "08:00" vira "8h"; "08:30" vira "8h30" (como se fala no WhatsApp). */
export function horaFalada(valor: string): string {
  const t = hhmm(valor);
  if (!t) return "";
  const [h, m] = t.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

function dataValida(valor: unknown): string | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor ? null : valor;
}

/**
 * Completa e saneia o que veio do banco ou da tela: sete dias, faixas válidas
 * em ordem, datas sem repetição. Faixa com o fim antes do início é descartada
 * aqui; a tela recusa antes (validarHorario) para o gestor ver o erro.
 */
export function normalizarHorario(raw: unknown): HorarioLoja {
  const padrao = horarioPadrao();
  if (!raw || typeof raw !== "object") return padrao;
  const r = raw as Partial<Record<keyof HorarioLoja, unknown>>;
  const diasRaw = Array.isArray(r.dias) ? (r.dias as Array<Partial<DiaHorario>>) : null;
  const porDia = new Map<number, Partial<DiaHorario>>();
  for (const d of diasRaw ?? []) if (d && Number.isInteger(d.dia)) porDia.set(Number(d.dia), d);

  const dias = Array.from({ length: 7 }, (_, dia) => {
    if (!diasRaw) return padrao.dias[dia];
    const faixas = (Array.isArray(porDia.get(dia)?.faixas) ? porDia.get(dia)!.faixas! : [])
      .map((f) => ({ abre: hhmm(f?.abre), fecha: hhmm(f?.fecha) }))
      .filter((f): f is FaixaHorario => Boolean(f.abre && f.fecha) && minutos(f.abre!) < minutos(f.fecha!))
      .sort((a, b) => minutos(a.abre) - minutos(b.abre))
      .slice(0, MAX_FAIXAS_POR_DIA);
    return { dia, faixas };
  });

  const vistas = new Set<string>();
  const feriados: DataFechada[] = [];
  for (const f of Array.isArray(r.feriados) ? (r.feriados as Array<Partial<DataFechada>>) : []) {
    const data = dataValida(f?.data);
    if (!data || vistas.has(data)) continue;
    vistas.add(data);
    const nome = typeof f?.nome === "string" ? f.nome.trim().slice(0, 60) : "";
    feriados.push(nome ? { data, nome } : { data });
  }
  feriados.sort((a, b) => a.data.localeCompare(b.data));

  const intervalo = Number(r.intervaloHoras);
  return {
    ativo: r.ativo === true,
    dias,
    feriados: feriados.slice(0, MAX_DATAS_FECHADAS),
    mensagem: typeof r.mensagem === "string" ? r.mensagem.trim().slice(0, 1000) : "",
    intervaloHoras:
      Number.isFinite(intervalo) && intervalo >= 1 ? Math.min(Math.round(intervalo), 168) : INTERVALO_PADRAO_HORAS,
  };
}

/** Erro para mostrar ao gestor antes de salvar (null = tudo certo). */
export function validarHorario(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return "Horário inválido.";
  const r = raw as { dias?: unknown; feriados?: unknown };
  for (const d of Array.isArray(r.dias) ? (r.dias as Array<Partial<DiaHorario>>) : []) {
    const nome = DIAS_DA_SEMANA[Number(d?.dia)] ?? "Dia";
    const faixas = Array.isArray(d?.faixas) ? d!.faixas! : [];
    if (faixas.length > MAX_FAIXAS_POR_DIA) return `${nome}: no máximo ${MAX_FAIXAS_POR_DIA} faixas.`;
    const validas: FaixaHorario[] = [];
    for (const f of faixas) {
      const abre = hhmm(f?.abre);
      const fecha = hhmm(f?.fecha);
      if (!abre || !fecha) return `${nome}: horário inválido.`;
      if (minutos(abre) >= minutos(fecha)) return `${nome}: o fim (${fecha}) tem que ser depois do início (${abre}).`;
      validas.push({ abre, fecha });
    }
    validas.sort((a, b) => minutos(a.abre) - minutos(b.abre));
    for (let i = 1; i < validas.length; i++) {
      if (minutos(validas[i].abre) < minutos(validas[i - 1].fecha)) return `${nome}: as faixas se sobrepõem.`;
    }
  }
  for (const f of Array.isArray(r.feriados) ? (r.feriados as Array<Partial<DataFechada>>) : []) {
    if (!dataValida(f?.data)) return "Data fechada inválida.";
  }
  return null;
}

/** "Seg a Sex 8h às 18h, Sáb 8h às 13h, Dom fechado". */
export function resumoDoHorario(h: HorarioLoja): string {
  const chave = (d: DiaHorario) => d.faixas.map((f) => `${f.abre}-${f.fecha}`).join("|") || "fechado";
  const faixasTexto = (d: DiaHorario) =>
    d.faixas.map((f) => `${horaFalada(f.abre)} às ${horaFalada(f.fecha)}`).join(" e ");
  // Segunda primeiro: é como se lê a semana de uma loja.
  const ordem = [1, 2, 3, 4, 5, 6, 0].map((i) => h.dias[i]);
  const partes: string[] = [];
  let inicio = 0;
  for (let i = 1; i <= ordem.length; i++) {
    if (i < ordem.length && chave(ordem[i]) === chave(ordem[inicio])) continue;
    const de = ordem[inicio];
    const ate = ordem[i - 1];
    const rotulo =
      inicio === i - 1
        ? DIAS_CURTOS[de.dia]
        : i - 1 - inicio === 1
          ? `${DIAS_CURTOS[de.dia]} e ${DIAS_CURTOS[ate.dia]}`
          : `${DIAS_CURTOS[de.dia]} a ${DIAS_CURTOS[ate.dia]}`;
    partes.push(de.faixas.length ? `${rotulo} ${faixasTexto(de)}` : `${rotulo} fechado`);
    inicio = i;
  }
  return partes.join(", ");
}

export type EstadoDoHorario = {
  aberto: boolean;
  /** "hoje às 13h", "amanhã a partir das 8h", "segunda-feira a partir das 8h",
   *  "em 02/01 a partir das 8h". Vazio quando aberto ou sem dia aberto. */
  quandoVolta: string;
  /** Próxima abertura (null quando aberto ou sem dia aberto). */
  proximaAbertura: Date | null;
};

/** A loja está atendendo agora? E, se não, quando volta. */
export function estadoDoHorario(h: HorarioLoja | null | undefined, agora: Date = new Date()): EstadoDoHorario {
  if (!h?.ativo) return { aberto: true, quandoVolta: "", proximaAbertura: null };
  const fechadas = new Set(h.feriados.map((f) => f.data));
  const local = new Date(agora.getTime() + OFFSET_MS);
  const meiaNoite = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const minAgora = local.getUTCHours() * 60 + local.getUTCMinutes();

  const doDia = (offset: number) => {
    const t = meiaNoite + offset * DIA_MS;
    const data = new Date(t).toISOString().slice(0, 10);
    const dia = new Date(t).getUTCDay();
    return { t, data, dia, faixas: fechadas.has(data) ? [] : (h.dias[dia]?.faixas ?? []) };
  };

  const hoje = doDia(0);
  if (hoje.faixas.some((f) => minAgora >= minutos(f.abre) && minAgora < minutos(f.fecha))) {
    return { aberto: true, quandoVolta: "", proximaAbertura: null };
  }

  // Ainda abre hoje (antes da primeira faixa ou no intervalo do almoço).
  const maisTarde = hoje.faixas.find((f) => minutos(f.abre) > minAgora);
  if (maisTarde) {
    return {
      aberto: false,
      quandoVolta: `hoje às ${horaFalada(maisTarde.abre)}`,
      proximaAbertura: new Date(hoje.t + minutos(maisTarde.abre) * 60_000 - OFFSET_MS),
    };
  }

  // Próximo dia que abre. Duas semanas cobrem um recesso de fim de ano.
  for (let i = 1; i <= 21; i++) {
    const d = doDia(i);
    const primeira = d.faixas[0];
    if (!primeira) continue;
    const hora = horaFalada(primeira.abre);
    const quando =
      i === 1
        ? `amanhã a partir das ${hora}`
        : i <= 6
          ? `${DIAS_DA_SEMANA[d.dia].toLowerCase()} a partir das ${hora}`
          : `em ${d.data.slice(8, 10)}/${d.data.slice(5, 7)} a partir das ${hora}`;
    return {
      aberto: false,
      quandoVolta: quando,
      proximaAbertura: new Date(d.t + minutos(primeira.abre) * 60_000 - OFFSET_MS),
    };
  }
  return { aberto: false, quandoVolta: "", proximaAbertura: null };
}

function preencher(modelo: string, h: HorarioLoja, agora: Date): string {
  const estado = estadoDoHorario(h, agora);
  const volta = estado.quandoVolta || "assim que possível";
  return modelo
    .replace(/\{\{\s*horario\s*\}\}/gi, resumoDoHorario(h))
    .replace(/\{\{\s*volta\s*\}\}/gi, volta)
    .trim();
}

/** Mensagem automática fora do horário, com os marcadores trocados. */
export function textoForaDoHorario(h: HorarioLoja, agora: Date = new Date()): string {
  return preencher(h.mensagem?.trim() || MENSAGEM_FORA_PADRAO, h, agora);
}

/** Aviso que acompanha a transferência da IA quando a equipe não está. */
export function avisoDeTransferenciaFora(h: HorarioLoja, agora: Date = new Date()): string {
  return preencher(AVISO_TRANSFERENCIA_FORA, h, agora);
}
