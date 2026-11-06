// Automações da loja e follow-up da coluna do funil: o que cada uma é, os
// campos que dá para usar no texto e no template, o preenchimento e as regras
// de "pode mandar agora". Arquivo puro: serve à tela e aos workers
// (wa/lib/automacoes-servidor.ts e wa/lib/funil-followup.ts).

export type TipoAutomacao = "pos_atendimento" | "pos_venda" | "aniversario";
export const TIPOS_DE_AUTOMACAO: TipoAutomacao[] = ["pos_atendimento", "pos_venda", "aniversario"];

export type CampoAutomacao = "nome" | "nome_completo" | "loja" | "link_avaliacao";

export const CAMPOS: Record<CampoAutomacao, { rotulo: string; exemplo: string }> = {
  nome: { rotulo: "Primeiro nome", exemplo: "Ana" },
  nome_completo: { rotulo: "Nome completo", exemplo: "Ana Souza" },
  loja: { rotulo: "Nome da loja", exemplo: "Auto Center" },
  link_avaliacao: { rotulo: "Link da avaliação", exemplo: "https://g.page/r/..." },
};

/** Variável de template nunca pode ir vazia (a Meta recusa a mensagem): sem
 *  o dado, vai isto no lugar. No texto livre o campo vazio só some. */
export const SUBSTITUTO: Record<CampoAutomacao, string> = {
  nome: "cliente",
  nome_completo: "cliente",
  loja: "nossa loja",
  link_avaliacao: "o nosso perfil no Google",
};

export type InfoDoTipo = {
  titulo: string;
  descricao: string;
  /** Rótulo e faixa do campo `espera` (null = não usa). */
  espera: { rotulo: string; unidade: "horas" | "dias"; padrao: number; min: number; max: number } | null;
  textoPadrao: string;
  campos: CampoAutomacao[];
};

export const INFO: Record<TipoAutomacao, InfoDoTipo> = {
  pos_atendimento: {
    titulo: "Pós-atendimento",
    descricao:
      "Depois que a conversa é encerrada na Central (ou pela IA): agradece e pede a avaliação no Google. Uma vez por atendimento.",
    espera: { rotulo: "Depois de encerrada (horas)", unidade: "horas", padrao: 2, min: 1, max: 168 },
    textoPadrao:
      "Oi, {{nome}}! Obrigado por falar com a {{loja}}. Se puder, conta pra gente como foi o atendimento: {{link_avaliacao}}",
    campos: ["nome", "nome_completo", "loja", "link_avaliacao"],
  },
  pos_venda: {
    titulo: "Pós-venda",
    descricao:
      "Alguns dias depois de a conversa ir para venda fechada: pergunta como está o carro e se precisa de alguma coisa. Uma vez por venda.",
    espera: { rotulo: "Depois da venda (dias)", unidade: "dias", padrao: 7, min: 1, max: 90 },
    textoPadrao:
      "Oi, {{nome}}! Aqui é da {{loja}}. Passando para saber como está o carro novo. Se precisar de qualquer coisa, é só responder por aqui.",
    campos: ["nome", "nome_completo", "loja"],
  },
  aniversario: {
    titulo: "Aniversário",
    descricao:
      "No dia do aniversário, de manhã. Usa a data de aniversário da ficha do contato. Uma vez por ano.",
    espera: null,
    textoPadrao: "Feliz aniversário, {{nome}}! 🎉 Toda a equipe da {{loja}} deseja um dia incrível para você.",
    campos: ["nome", "nome_completo", "loja"],
  },
};

/** Horas da manhã em que o aniversário pode sair. */
export const HORAS_DO_ANIVERSARIO = [8, 9, 10, 11];

/** Nada automático sai fora deste horário (Brasília): ninguém quer mensagem
 *  de loja de madrugada. */
export const HORARIO_PERMITIDO = { de: 8, ate: 21 };

export const HORA_MS = 3600_000;
export const DIA_MS = 24 * HORA_MS;
/** Não manda texto livre nos últimos minutos da janela de 24h da Meta. */
export const MARGEM_JANELA_MS = 10 * 60_000;
/** Duas mensagens automáticas (follow-up, automação) não saem para a mesma
 *  conversa com menos que isto entre elas. */
export const INTERVALO_ENTRE_AUTOMATICAS_MS = 12 * HORA_MS;

export type DadosDaMensagem = Partial<Record<CampoAutomacao, string | null>>;

export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

/** Texto livre: {{campo}} vira o valor; campo vazio some e a pontuação em
 *  volta é arrumada. Campo desconhecido fica como está (para a pessoa ver). */
export function preencherTexto(texto: string, dados: DadosDaMensagem): string {
  return texto
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (inteiro, nome: string) => {
      const chave = nome.toLowerCase() as CampoAutomacao;
      if (!(chave in CAMPOS)) return inteiro;
      return (dados[chave] ?? "").trim();
    })
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .replace(/([,;:])(?=[,.!?;:])/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Valores do template, na ordem das variáveis do corpo. Nunca vazio. */
export function parametrosDoModelo(campos: string[], quantidade: number, dados: DadosDaMensagem): string[] {
  return Array.from({ length: Math.max(0, quantidade) }, (_, i) => {
    const campo = (campos[i] && campos[i] in CAMPOS ? campos[i] : "nome") as CampoAutomacao;
    const valor = (dados[campo] ?? "").trim();
    return valor || SUBSTITUTO[campo];
  });
}

/** Data e hora de agora em Brasília (o servidor roda em UTC). */
export function agoraEmBrasilia(agora = new Date()): { ano: number; mes: number; dia: number; hora: number; minutos: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(agora)
      .map((x) => [x.type, x.value]),
  );
  const hora = Number(p.hour);
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora,
    minutos: hora * 60 + Number(p.minute),
  };
}

export function horarioPermitido(agora = new Date()): boolean {
  const { minutos } = agoraEmBrasilia(agora);
  return minutos >= HORARIO_PERMITIDO.de * 60 && minutos < HORARIO_PERMITIDO.ate * 60;
}

export function anoBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

/** Quem faz aniversário hoje: o dia de hoje e, em ano que não é bissexto, o
 *  29/02 comemora no 28/02. */
export function diasDeAniversarioDe(hoje: { ano: number; mes: number; dia: number }): Array<{ mes: number; dia: number }> {
  const dias = [{ mes: hoje.mes, dia: hoje.dia }];
  if (hoje.mes === 2 && hoje.dia === 28 && !anoBissexto(hoje.ano)) dias.push({ mes: 2, dia: 29 });
  return dias;
}

/** A janela de 24h da Meta está aberta agora, com margem? (o texto livre só
 *  sai assim; fora dela, só template aprovado). */
export function janelaAberta(lastInboundAt: Date | string | null | undefined, agora = Date.now()): boolean {
  if (!lastInboundAt) return false;
  return agora + MARGEM_JANELA_MS - new Date(lastInboundAt).getTime() < DIA_MS;
}

/** Outra mensagem automática saiu para esta conversa há pouco? */
export function automaticaRecente(ultimoAutomaticoAt: Date | string | null | undefined, agora = Date.now()): boolean {
  if (!ultimoAutomaticoAt) return false;
  return agora - new Date(ultimoAutomaticoAt).getTime() < INTERVALO_ENTRE_AUTOMATICAS_MS;
}

// ── Pós-atendimento: o que conta como atendimento ────────────

/** Um pedido de avaliação por conversa neste prazo. O "obrigado" do cliente
 *  ao pedido reabre a conversa, ela é encerrada de novo e, sem isto, o pedido
 *  sairia outra vez a cada encerramento. */
export const INTERVALO_DA_AVALIACAO_MS = 30 * DIA_MS;
/** O cliente precisa ter escrito até 7 dias antes do encerramento: conversa
 *  antiga encerrada agora (limpeza da fila, encerrar em lote) não é
 *  atendimento e não pede avaliação. */
export const ATENDIMENTO_RECENTE_MS = 7 * DIA_MS;
/** Sem mensagem do cliente nas 24h antes de uma automação, o que ele escreveu
 *  depois foi resposta a ela (o "obrigado" do aniversário). */
const SILENCIO_ANTES_DA_AUTOMACAO_MS = DIA_MS;

const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : null);

/**
 * Por que esta conversa encerrada não recebe o pós-atendimento (null =
 * recebe). Pura: o servidor lê as datas e passa prontas.
 */
export function motivoParaNaoAvaliar(
  p: {
    closedAt: Date | string;
    lastInboundAt: Date | string;
    /** Último pedido de avaliação que saiu para esta conversa. */
    ultimaAvaliacaoEm?: Date | string | null;
    /** Última automação (pós-atendimento, pós-venda, aniversário) que saiu
     *  para ela ANTES da última mensagem do cliente. */
    ultimaAutomacaoEm?: Date | string | null;
    /** Última mensagem do cliente antes dessa automação. */
    clienteAntesDaAutomacaoEm?: Date | string | null;
  },
  agora = Date.now(),
): string | null {
  const fechada = ms(p.closedAt)!;
  const cliente = ms(p.lastInboundAt)!;
  if (fechada - cliente > ATENDIMENTO_RECENTE_MS) return "o cliente não escrevia havia mais de 7 dias quando a conversa foi encerrada";
  const avaliacao = ms(p.ultimaAvaliacaoEm);
  if (avaliacao !== null && agora - avaliacao < INTERVALO_DA_AVALIACAO_MS) {
    return "já recebeu o pedido de avaliação há menos de 30 dias";
  }
  const automacao = ms(p.ultimaAutomacaoEm);
  if (automacao !== null && automacao < cliente && automacao >= fechada - ATENDIMENTO_RECENTE_MS) {
    const antes = ms(p.clienteAntesDaAutomacaoEm);
    if (antes === null || automacao - antes >= SILENCIO_ANTES_DA_AUTOMACAO_MS) {
      return "o cliente só respondeu a uma mensagem automática";
    }
  }
  return null;
}

// ── Configuração de uma automação ────────────────────────────

export type AutomacaoConfig = {
  tipo: TipoAutomacao;
  ativa: boolean;
  espera: number;
  hora: number;
  texto: string;
  linkAvaliacao: string | null;
  template: string | null;
  templateIdioma: string;
  templateVars: CampoAutomacao[];
};

export function automacaoPadrao(tipo: TipoAutomacao): AutomacaoConfig {
  return {
    tipo,
    ativa: false,
    espera: INFO[tipo].espera?.padrao ?? 0,
    hora: 9,
    texto: INFO[tipo].textoPadrao,
    linkAvaliacao: null,
    template: null,
    templateIdioma: "pt_BR",
    templateVars: [],
  };
}

function inteiro(v: unknown, padrao: number, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function camposValidos(v: unknown, permitidos: CampoAutomacao[]): CampoAutomacao[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 10)
    .map((c) => (typeof c === "string" && permitidos.includes(c as CampoAutomacao) ? (c as CampoAutomacao) : "nome"));
}

function nomeDeTemplate(v: unknown): string | null {
  const t = texto(v, 512);
  return t && /^[a-z0-9_]+$/.test(t) ? t : null;
}

function idioma(v: unknown): string {
  const t = texto(v, 15);
  return /^[a-z]{2,3}(_[A-Z]{2})?$/.test(t) ? t : "pt_BR";
}

/** Confere o que a tela mandou. `erro` explica o que falta para ligar. */
export function normalizarAutomacao(
  tipo: TipoAutomacao,
  input: Record<string, unknown>,
): { config: AutomacaoConfig; erro: string | null } {
  const info = INFO[tipo];
  const link = texto(input.linkAvaliacao, 500);
  const config: AutomacaoConfig = {
    tipo,
    ativa: input.ativa === true,
    espera: info.espera ? inteiro(input.espera, info.espera.padrao, info.espera.min, info.espera.max) : 0,
    hora: HORAS_DO_ANIVERSARIO.includes(Number(input.hora)) ? Number(input.hora) : 9,
    texto: texto(input.texto, 1000),
    linkAvaliacao: link || null,
    template: nomeDeTemplate(input.template),
    templateIdioma: idioma(input.templateIdioma),
    templateVars: camposValidos(input.templateVars, info.campos),
  };
  let erro: string | null = null;
  if (link && !/^https?:\/\/\S+$/i.test(link)) erro = "O link da avaliação precisa começar com https://";
  else if (config.ativa && !config.texto) erro = "Escreva o texto da mensagem.";
  else if (config.ativa && /\{\{\s*link_avaliacao\s*\}\}/i.test(config.texto) && !link) {
    erro = "A mensagem usa o link da avaliação: informe o link do Google.";
  } else if (config.ativa && config.templateVars.includes("link_avaliacao") && !link) {
    erro = "O template usa o link da avaliação: informe o link do Google.";
  }
  return { config, erro };
}

// ── Follow-up da coluna do funil ─────────────────────────────

export type FollowupConfig = {
  ativo: boolean;
  horas: number;
  maximo: number;
  modo: "ia" | "texto";
  texto: string;
  template: string | null;
  templateIdioma: string;
  templateVars: CampoAutomacao[];
};

export const CAMPOS_DO_FOLLOWUP: CampoAutomacao[] = ["nome", "nome_completo", "loja"];

export const FOLLOWUP_PADRAO: FollowupConfig = {
  ativo: false,
  horas: 24,
  maximo: 1,
  modo: "texto",
  texto: "Oi, {{nome}}! Conseguiu ver a nossa última mensagem? Se tiver qualquer dúvida, é só responder por aqui.",
  template: null,
  templateIdioma: "pt_BR",
  templateVars: [],
};

/** Conversas paradas há mais que isto (além do prazo) não recebem follow-up:
 *  ligar a regra numa coluna cheia de cartões antigos não vira um disparo. */
export const PISO_DO_FOLLOWUP_MS = 30 * DIA_MS;

export function normalizarFollowup(input: Record<string, unknown> | null | undefined): {
  config: FollowupConfig;
  erro: string | null;
} {
  const i = input ?? {};
  const config: FollowupConfig = {
    ativo: i.ativo === true,
    horas: inteiro(i.horas, FOLLOWUP_PADRAO.horas, 1, 720),
    maximo: inteiro(i.maximo, FOLLOWUP_PADRAO.maximo, 1, 10),
    modo: i.modo === "ia" ? "ia" : "texto",
    // Coluna que nunca foi configurada abre com o texto de exemplo; o que a
    // pessoa apagou de propósito ("") fica vazio.
    texto: i.texto === undefined || i.texto === null ? FOLLOWUP_PADRAO.texto : texto(i.texto, 1000),
    template: nomeDeTemplate(i.template),
    templateIdioma: idioma(i.templateIdioma),
    templateVars: camposValidos(i.templateVars, CAMPOS_DO_FOLLOWUP),
  };
  let erro: string | null = null;
  if (config.ativo) {
    if (config.modo === "texto" && !config.texto) erro = "Escreva o texto do follow-up.";
    // Com 24h ou mais de espera a janela já fechou (a última mensagem é sempre
    // tão recente quanto a última do cliente): sem template, nada sairia.
    else if (config.horas >= 24 && !config.template) {
      erro = "Com 24 horas ou mais sem resposta a janela do WhatsApp já fechou: escolha um template aprovado.";
    }
  }
  return { config, erro };
}

/** Toques já dados nesta coluna: em outra coluna, a contagem recomeça. */
export function toquesNaColuna(
  conv: { followupCount?: number | null; followupColunaId?: unknown },
  colunaId: string,
): number {
  if (!conv.followupColunaId || String(conv.followupColunaId) !== colunaId) return 0;
  return Math.max(0, conv.followupCount ?? 0);
}

/**
 * A conversa deve receber o follow-up desta coluna agora? Follow-up é para
 * quem parou de responder a NÓS: se o cliente falou por último, a equipe é
 * que deve a resposta; conversa encerrada ou esperando a equipe também não.
 */
export function motivoParaNaoTocar(
  conv: {
    status: string;
    lastMessageAt?: Date | string | null;
    lastInboundAt?: Date | string | null;
    followupCount?: number | null;
    followupColunaId?: unknown;
    followupLastAt?: Date | string | null;
    ultimoAutomaticoAt?: Date | string | null;
  },
  cfg: Pick<FollowupConfig, "horas" | "maximo">,
  colunaId: string,
  agora = Date.now(),
): string | null {
  if (conv.status === "closed") return "conversa encerrada";
  if (conv.status === "waiting_human") return "esperando a equipe";
  const ultima = conv.lastMessageAt ? new Date(conv.lastMessageAt).getTime() : 0;
  if (!ultima) return "sem mensagem";
  const dele = conv.lastInboundAt ? new Date(conv.lastInboundAt).getTime() : 0;
  if (dele && dele >= ultima - 1000) return "o cliente falou por último";
  if (toquesNaColuna(conv, colunaId) >= cfg.maximo) return "máximo de toques";
  const ultimoToque = conv.followupLastAt ? new Date(conv.followupLastAt).getTime() : 0;
  if (agora - Math.max(ultima, ultimoToque) < cfg.horas * HORA_MS) return "ainda no prazo";
  if (agora - ultima > cfg.horas * HORA_MS + PISO_DO_FOLLOWUP_MS) return "parada há tempo demais";
  // A última automática foi o próprio toque anterior: o prazo da coluna é que
  // manda (follow-up de 4 em 4 horas não espera as 12h entre automáticas).
  const ultimaAutomatica = conv.ultimoAutomaticoAt ? new Date(conv.ultimoAutomaticoAt).getTime() : 0;
  const foiOToque = ultimoToque > 0 && Math.abs(ultimaAutomatica - ultimoToque) < 15 * 60_000;
  if (!foiOToque && automaticaRecente(conv.ultimoAutomaticoAt, agora)) return "outra mensagem automática saiu há pouco";
  return null;
}
