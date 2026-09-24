// Normalização de telefone BR — usada em TODOS os pontos onde um número entra
// no sistema (webhook, importação de CSV, Pipedrive, nova conversa).
//
// Exportação de CRM vem suja e sem padrão: o mesmo arquivo traz
// "31975635430", "31 8635-2616", "5531 8635-2616", "(31) 99701-5123",
// "+55 31 97563-5430", "031 3333-4444", "31 3333-4444 ramal 22" e até dois
// números na mesma célula. Tudo isso precisa virar um único formato antes de
// chegar na Meta — número fora do padrão vira falha de envio, e falha de envio
// derruba a nota de qualidade.
//
// O outro motivo é o nono dígito: a Meta manda o wa_id de números BR antigos
// SEM ele (553184005308), enquanto as listas costumam tê-lo (5531984005308).
// Sem canonizar, o mesmo cliente vira DOIS contatos e a resposta da campanha
// cai numa conversa nova, sem o histórico do disparo.

export type PhoneKind = "movel" | "fixo" | "internacional";

export type PhoneParse = {
  /** Como veio no arquivo. */
  raw: string;
  /** +5531975635430 — null quando não dá para aproveitar. */
  e164: string | null;
  valid: boolean;
  kind: PhoneKind | null;
  /** Por que foi recusado, para mostrar na tela de importação. */
  reason?: string;
};

// DDDs que existem de fato. Sem esta checagem, "1" ou "00" viram DDD e o
// número passa como válido para morrer depois no envio.
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Corta no primeiro separador de "segundo número" ou ramal. Sem isto,
 * "3133334444 ramal 22" vira 313333444422 — um número que não existe.
 */
function primeiroTrecho(raw: string): string {
  return raw
    .split(/[,;/|]| ou | e |\bramal\b|\bramais\b|\br\.|\bext\b|\bx\b/i)[0]
    .trim();
}

export function parsePhoneBr(input: string | null | undefined): PhoneParse {
  const raw = (input ?? "").trim();
  if (!raw) return { raw, e164: null, valid: false, kind: null, reason: "vazio" };

  const trecho = primeiroTrecho(raw);
  const internacionalExplicito = /^\s*\+/.test(trecho);
  let digits = trecho.replace(/\D/g, "");

  if (!digits) return { raw, e164: null, valid: false, kind: null, reason: "sem dígitos" };

  // Número com DDI explícito que não é o Brasil: preserva como está. Prefixar
  // 55 num +1 americano criaria um número inexistente.
  if (internacionalExplicito && !digits.startsWith("55")) {
    const ok = digits.length >= 8 && digits.length <= 15;
    return {
      raw,
      e164: ok ? `+${digits}` : null,
      valid: ok,
      kind: ok ? "internacional" : null,
      reason: ok ? undefined : "DDI estrangeiro com tamanho inválido",
    };
  }

  // Prefixo de discagem nacional ("031", "0 31") e zeros à esquerda.
  digits = digits.replace(/^0+/, "");

  // A partir daqui é BR: normaliza para 55 + DDD + assinante.
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  } else if (digits.length === 10 || digits.length === 11) {
    // já está como DDD + assinante
  } else if (digits.startsWith("55") && digits.length > 13) {
    return { raw, e164: null, valid: false, kind: null, reason: "dígitos demais" };
  } else {
    return {
      raw,
      e164: null,
      valid: false,
      kind: null,
      reason: digits.length < 10 ? "curto demais (falta DDD?)" : "tamanho inválido",
    };
  }

  const ddd = Number(digits.slice(0, 2));
  if (!DDDS.has(ddd)) {
    return { raw, e164: null, valid: false, kind: null, reason: `DDD ${ddd} não existe` };
  }

  let assinante = digits.slice(2);

  // 8 dígitos: fixo começa em 2-5; celular antigo começa em 6-9 e ganha o nono.
  if (assinante.length === 8) {
    if (/^[6-9]/.test(assinante)) assinante = `9${assinante}`;
  } else if (assinante.length === 9) {
    // Celular de 9 dígitos tem que começar com 9.
    if (!assinante.startsWith("9")) {
      return { raw, e164: null, valid: false, kind: null, reason: "celular não começa com 9" };
    }
  } else {
    return { raw, e164: null, valid: false, kind: null, reason: "assinante com tamanho inválido" };
  }

  const kind: PhoneKind = assinante.length === 9 ? "movel" : "fixo";
  return { raw, e164: `+55${ddd}${assinante}`, valid: true, kind };
}

/** Dígitos canônicos (sem o +). Mantido para quem já usava. */
export function canonicalPhoneDigits(raw: string): string {
  const parsed = parsePhoneBr(raw);
  return parsed.e164 ? parsed.e164.slice(1) : raw.replace(/\D/g, "");
}

/** Formato de armazenamento dos contatos: +<dígitos canônicos>. */
export function canonicalPhone(raw: string): string {
  const parsed = parsePhoneBr(raw);
  return parsed.e164 ?? `+${raw.replace(/\D/g, "")}`;
}

/**
 * Serve para WhatsApp. Fixo entra como válido no cadastro, mas não recebe
 * mensagem — por isso é sinalizado separadamente na importação.
 */
export function isUsablePhone(raw: string | null | undefined): boolean {
  return parsePhoneBr(raw).valid;
}

/** Exibição amigável: +55 (31) 97563-5430 */
export function formatPhoneBr(e164: string): string {
  const d = e164.replace(/\D/g, "");
  if (!d.startsWith("55") || (d.length !== 12 && d.length !== 13)) return e164;
  const ddd = d.slice(2, 4);
  const n = d.slice(4);
  const meio = n.length === 9 ? `${n.slice(0, 5)}-${n.slice(5)}` : `${n.slice(0, 4)}-${n.slice(4)}`;
  return `+55 (${ddd}) ${meio}`;
}
