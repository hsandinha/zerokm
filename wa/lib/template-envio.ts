// O que um template pede além das variáveis do corpo, e a checagem antes de
// enviar. Template com imagem no cabeçalho, {{1}} no cabeçalho ou link
// dinâmico no botão falhava em 100% dos envios: a Meta recusa a mensagem
// inteira quando falta qualquer um desses parâmetros. Aqui a falta vira um
// erro claro ANTES da viagem.

import {
  headerDeMidia,
  tipoDoHeader,
  type FormaDoTemplate,
  type TemplateButtonUrlParam,
  type TemplateSendExtras,
} from "@wa/lib/meta";
import { renderTemplateBody } from "@wa/lib/campaign-params";

export class TemplateIncompletoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateIncompletoError";
  }
}

const NOME_DA_MIDIA: Record<"IMAGE" | "VIDEO" | "DOCUMENT", string> = {
  IMAGE: "imagem",
  VIDEO: "vídeo",
  DOCUMENT: "documento",
};

export function nomeDaMidiaDoHeader(format: "IMAGE" | "VIDEO" | "DOCUMENT"): string {
  return NOME_DA_MIDIA[format];
}

export type MidiaDoEnvio = {
  link: string;
  tipo: "image" | "video" | "document";
  filename?: string | null;
};

/**
 * Monta header e botões do envio. Lança TemplateIncompletoError com o motivo
 * em português quando falta algo que a Meta exigiria.
 */
export function extrasDoEnvio(
  forma: FormaDoTemplate,
  input: {
    headerTexto?: string | null;
    midia?: MidiaDoEnvio | null;
    /** Final da URL de cada botão dinâmico, pelo índice do botão. */
    botoes?: TemplateButtonUrlParam[] | null;
    clientRef?: string | null;
  } = {},
): TemplateSendExtras {
  const extras: TemplateSendExtras = {};
  if (input.clientRef) extras.clientRef = input.clientRef;

  if (forma.headerFormat === "LOCATION") {
    throw new TemplateIncompletoError("Template com localização no cabeçalho ainda não é suportado aqui.");
  }
  if (headerDeMidia(forma.headerFormat)) {
    const nome = NOME_DA_MIDIA[forma.headerFormat];
    if (!input.midia?.link) {
      throw new TemplateIncompletoError(`Este template tem ${nome} no cabeçalho: anexe o arquivo.`);
    }
    if (input.midia.tipo !== tipoDoHeader(forma.headerFormat)) {
      throw new TemplateIncompletoError(`O cabeçalho deste template pede ${nome}: troque o arquivo.`);
    }
    extras.headerParams = [
      { type: input.midia.tipo, link: input.midia.link, filename: input.midia.filename ?? null },
    ];
  } else if (forma.headerFormat === "TEXT" && forma.headerVars > 0) {
    const texto = input.headerTexto?.trim();
    if (!texto) throw new TemplateIncompletoError("Preencha a variável do cabeçalho do template.");
    extras.headerParams = [{ type: "text", text: texto }];
  }

  if (forma.botoesUrl.length > 0) {
    const porIndice = new Map((input.botoes ?? []).map((b) => [Number(b.index), String(b.value ?? "").trim()]));
    extras.buttonUrlParams = forma.botoesUrl.map((b) => {
      const value = porIndice.get(b.index);
      if (!value) {
        throw new TemplateIncompletoError(`Preencha o final do link do botão "${b.text}".`);
      }
      return { index: b.index, value };
    });
  }
  return extras;
}

/** O texto que a pessoa recebeu: cabeçalho de texto (em negrito, como o
 *  WhatsApp mostra) e o corpo, com as variáveis trocadas. É o que a Central
 *  exibe e o que a IA lê como a própria fala anterior. */
export function textoDoTemplate(
  forma: FormaDoTemplate,
  bodyParams: string[],
  headerTexto?: string | null,
): string {
  const corpo = renderTemplateBody(forma.body, bodyParams);
  if (forma.headerFormat === "TEXT" && forma.headerText) {
    const titulo = forma.headerText.replace(/\{\{1\}\}/g, headerTexto?.trim() || "{{1}}");
    return `*${titulo}*\n${corpo}`;
  }
  if (headerDeMidia(forma.headerFormat)) {
    return `[${NOME_DA_MIDIA[forma.headerFormat]}]\n${corpo}`;
  }
  return corpo;
}
