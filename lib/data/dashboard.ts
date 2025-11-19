import { getVehicles } from "@/lib/data/vehicles";
import { percentage } from "@/lib/utils/format";

export type StockHealth = {
  updated: number;
  stale: number;
  expired: number;
};

export function getStockHealth(): StockHealth {
  const vehicles = getVehicles();
  const stale = vehicles.filter(v => v.flags?.stale).length;
  const updated = vehicles.length - stale;

  return {
    updated,
    stale,
    expired: 0
  };
}

export function getStockHealthSemaphore(): {
  status: "verde" | "amarelo" | "vermelho";
  label: string;
  detail: string;
} {
  const vehicles = getVehicles();
  const total = vehicles.length;
  const stale = vehicles.filter(v => v.flags?.stale).length;
  const upToDatePct = percentage(total - stale, total);

  if (upToDatePct >= 80) {
    return {
      status: "verde",
      label: "Estoque saudável",
      detail: `${upToDatePct}% dos veículos atualizados nos últimos 7 dias.`
    };
  }

  if (upToDatePct >= 55) {
    return {
      status: "amarelo",
      label: "Atenção",
      detail: `${upToDatePct}% atualizados. Recomendado acionar fornecedores inativos.`
    };
  }

  return {
    status: "vermelho",
    label: "Crítico",
    detail: `${upToDatePct}% atualizados. Necessário mutirão de atualização.`
  };
}

export function getFunnelMetrics() {
  return [
    { stage: "Visualizações", value: 1280 },
    { stage: "Leads", value: 340 },
    { stage: "Propostas", value: 112 },
    { stage: "Vendas", value: 36 }
  ];
}

export function getInactivityAlerts() {
  return [
    {
      supplier: "Best Distribuidora",
      since: "2025-10-10T08:00:00Z",
      vehicles: 24,
      action: "Entrar em contato"
    },
    {
      supplier: "Athena Motors",
      since: "2025-10-09T15:21:00Z",
      vehicles: 12,
      action: "Verificar atualização de tabela"
    }
  ];
}

