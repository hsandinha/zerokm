export type MarginRule = {
  id: string;
  model: string;
  version: string;
  minMargin: number;
  targetMargin: number;
  maxMargin: number;
  lastUpdate: string;
  updatedBy: string;
};

export type AutomationRule = {
  id: string;
  name: string;
  description: string;
  value: string;
  status: "ativo" | "rascunho";
};

const marginRules: MarginRule[] = [
  {
    id: "mr-1",
    model: "ARGO DRIVE 1.0",
    version: "MT",
    minMargin: 10000,
    targetMargin: 12000,
    maxMargin: 18000,
    lastUpdate: "2025-10-18T08:12:00Z",
    updatedBy: "Marcelo Gomes"
  },
  {
    id: "mr-2",
    model: "CRONOS DRIVE 1.3",
    version: "AT",
    minMargin: 9000,
    targetMargin: 11500,
    maxMargin: 16000,
    lastUpdate: "2025-10-16T15:40:00Z",
    updatedBy: "Ana Paula"
  }
];

const automations: AutomationRule[] = [
  {
    id: "ar-1",
    name: "Expirar veículos sem atualização",
    description: "Remove automaticamente do catálogo após X dias sem atualização.",
    value: "Desativar após 14 dias",
    status: "ativo"
  },
  {
    id: "ar-2",
    name: "Alerta de margem negativa",
    description: "Notificar mesa caso margem fique abaixo de zero por mais de 30 minutos.",
    value: "Notificar via WhatsApp + Email",
    status: "ativo"
  },
  {
    id: "ar-3",
    name: "Relatório semanal de IA (futuro)",
    description: "Coletar insights de concorrentes via monitoramento automatizado.",
    value: "Backlog - aguardando Fase 2",
    status: "rascunho"
  }
];

export function getMarginRules(): MarginRule[] {
  return marginRules;
}

export function getAutomationRules(): AutomationRule[] {
  return automations;
}

