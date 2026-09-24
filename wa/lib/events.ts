// Vocabulário dos eventos que o sistema emite para fora (webhooks). Sem banco:
// este arquivo roda também no browser (tela de Configurações).

export type EventType =
  | "conversa.criada"
  | "conversa.atribuida"
  | "conversa.transferida"
  | "conversa.resolvida"
  | "mensagem.recebida"
  | "mensagem.enviada"
  | "cadastro.criado"
  | "pagamento.gerado"
  | "negocio.etapa_alterada"
  | "contato.optout"
  | "teste.ping";

export const EVENT_TYPES: Array<{ id: EventType; label: string; hint: string }> = [
  { id: "conversa.criada", label: "Conversa criada", hint: "contato novo escreveu ou foi abordado" },
  { id: "conversa.atribuida", label: "Conversa assumida", hint: "um humano assumiu o atendimento" },
  {
    id: "conversa.transferida",
    label: "Transferida pela IA",
    hint: "a IA pediu um humano (motivo no payload)",
  },
  { id: "conversa.resolvida", label: "Conversa encerrada", hint: "pela IA ou pelo atendente" },
  { id: "mensagem.recebida", label: "Mensagem recebida", hint: "cada mensagem do cliente" },
  { id: "mensagem.enviada", label: "Mensagem enviada", hint: "IA, humano, template ou cadência" },
  {
    id: "cadastro.criado",
    label: "Cadastro criado",
    hint: "a IA criou a conta do lojista (teste de 24h ativo)",
  },
  {
    id: "pagamento.gerado",
    label: "Pagamento gerado",
    hint: "PIX ou link de assinatura emitido para o cliente",
  },
  {
    id: "negocio.etapa_alterada",
    label: "Etapa alterada",
    hint: "no pipeline: abordado → conversa → … → assinante",
  },
  { id: "contato.optout", label: "Opt-out", hint: "pediu para não receber mensagens" },
];

export function isEventType(v: unknown): v is EventType {
  return typeof v === "string" && (EVENT_TYPES.some((e) => e.id === v) || v === "teste.ping");
}
