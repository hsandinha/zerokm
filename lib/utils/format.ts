export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2
  });
}

export function formatDate(date: string | Date): string {
  const instance = typeof date === "string" ? new Date(date) : date;
  return instance.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

export function formatDateTime(date: string | Date): string {
  const instance = typeof date === "string" ? new Date(date) : date;
  return instance.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function calculateMargin(sitePrice: number, salePrice: number): number {
  return sitePrice - salePrice;
}

export function percentage(partial: number, total: number): number {
  if (!total) {
    return 0;
  }
  return Math.round((partial / total) * 1000) / 10;
}

