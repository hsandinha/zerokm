export type AuditLog = {
  id: string;
  user: string;
  role: string;
  action: string;
  target: string;
  timestamp: string;
  details?: string;
};

const logs: AuditLog[] = [
  {
    id: "log-1",
    user: "Ana Paula",
    role: "Operadora Mesa",
    action: "Atualizou preço",
    target: "ARGO DRIVE 1.0 MT · ATAC.",
    timestamp: "2025-10-19T14:32:00Z",
    details: "Preço de venda alterado de R$ 82.900 para R$ 83.900."
  },
  {
    id: "log-2",
    user: "Marcelo Gomes",
    role: "Administrador",
    action: "Configurou margem",
    target: "Linha CRONOS 1.3",
    timestamp: "2025-10-18T09:12:00Z",
    details: "Margem mínima ajustada para R$ 9.500."
  },
  {
    id: "log-3",
    user: "Lorene Souza",
    role: "Consultora",
    action: "Exportou planilha",
    target: "Catálogo completo",
    timestamp: "2025-10-17T17:45:00Z",
    details: "Filtro aplicado: Pronta entrega · Sudeste."
  },
  {
    id: "log-4",
    user: "Kauê Martins",
    role: "Operador Mesa",
    action: "Visualizou fornecedor",
    target: "Ventura Motors",
    timestamp: "2025-10-17T11:05:00Z"
  }
];

export function getAuditLogs(): AuditLog[] {
  return logs;
}

