// Tradução dos códigos de erro da Meta.
//
// A lista de destinatários mostrava coisas como "130472: User's number is part
// of an experiment" — que não diz a quem opera se o problema é o número, o
// template, a conta ou nada disso. Cada código vira uma explicação e uma
// orientação sobre reenviar.

export type MetaErrorInfo = {
  titulo: string;
  explicacao: string;
  /** Reenviar resolve? */
  reenviar: "nao" | "depois" | "sim";
};

const CODIGOS: Record<string, MetaErrorInfo> = {
  "130472": {
    titulo: "Número em experimento da Meta",
    explicacao:
      "A Meta mantém um grupo de controle que não recebe mensagens de marketing, para medir o efeito delas. Este número caiu nesse grupo. Não é problema do seu número, do template nem do contato — e afeta só a categoria marketing.",
    reenviar: "nao",
  },
  "131049": {
    titulo: "Limite de marketing por pessoa",
    explicacao:
      "A Meta segurou a mensagem para não saturar quem já recebe muita mensagem de marketing. É por destinatário e temporário.",
    reenviar: "depois",
  },
  "131026": {
    titulo: "Mensagem não entregável",
    explicacao:
      "O número não tem WhatsApp, não aceita mensagens de empresa ou está inativo. Vale conferir o cadastro.",
    reenviar: "nao",
  },
  "131047": {
    titulo: "Fora da janela de 24 horas",
    explicacao:
      "Passou mais de 24h desde a última mensagem do cliente, então só template abre a conversa de novo.",
    reenviar: "sim",
  },
  "132000": {
    titulo: "Variáveis não batem com o template",
    explicacao:
      "A quantidade de variáveis enviadas é diferente da que o template espera. Revise o mapeamento na criação da campanha.",
    reenviar: "sim",
  },
  "132001": {
    titulo: "Template não encontrado",
    explicacao: "O template não existe neste WABA ou o idioma está diferente do cadastrado.",
    reenviar: "sim",
  },
  "132015": {
    titulo: "Template pausado",
    explicacao:
      "A Meta pausou este template por qualidade baixa — muita gente bloqueou ou denunciou. Ajuste o texto e crie uma versão nova.",
    reenviar: "nao",
  },
  "131031": {
    titulo: "Conta restrita",
    explicacao: "A conta do WhatsApp Business está bloqueada ou com restrição de envio.",
    reenviar: "nao",
  },
  "133010": {
    titulo: "Número não registrado",
    explicacao: "O número remetente não está registrado na Cloud API.",
    reenviar: "nao",
  },
  "80007": {
    titulo: "Limite de taxa",
    explicacao: "Envios rápidos demais. Aumente o intervalo entre mensagens na campanha.",
    reenviar: "depois",
  },
};

/** Extrai "130472" de "130472: User's number is part of an experiment". */
export function metaErrorInfo(erro: string | null | undefined): MetaErrorInfo | null {
  if (!erro) return null;
  const codigo = erro.match(/\b(\d{3,6})\b/)?.[1];
  return codigo ? (CODIGOS[codigo] ?? null) : null;
}

export const REENVIO_LABEL: Record<MetaErrorInfo["reenviar"], string> = {
  nao: "reenviar não resolve",
  depois: "pode tentar mais tarde",
  sim: "corrija e reenvie",
};
