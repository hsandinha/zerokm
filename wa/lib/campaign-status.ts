// Rótulos, tons e progresso de campanha — compartilhados entre lista e detalhe.

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  running: "Enviando",
  paused: "Pausada",
  completed: "Concluída",
  cancelled: "Cancelada",
  failed: "Falhou",
};

export const CAMPAIGN_STATUS_CLS: Record<string, string> = {
  draft: "bg-ink-100 text-ink-800",
  scheduled: "bg-sky-100 text-sky-700",
  running: "bg-brand-100 text-brand-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-brand-800/40 text-brand-800",
  cancelled: "bg-ink-100 text-muted",
  failed: "bg-red-100 text-red-600",
};

export function campaignProgress(c: {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
}): number {
  if (!c.total) return 0;
  return Math.min(100, Math.round(((c.sent + c.failed + c.skipped) / c.total) * 100));
}

// Preço por mensagem de template no Brasil (US$, tabela Meta jul/2025).
// Referência para estimativa — a Meta reajusta periodicamente.
export const META_RATE_USD: Record<string, number> = {
  MARKETING: 0.0625,
  UTILITY: 0.008,
  AUTHENTICATION: 0.0315,
};

export function estimateCostUsd(recipients: number, category?: string | null): number {
  return recipients * (META_RATE_USD[category ?? ""] ?? META_RATE_USD.MARKETING);
}
