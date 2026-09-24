// Janela de trabalho da campanha.
//
// A Vercel roda em UTC; o horário que importa é o de Brasília. Por isso a
// comparação é feita com o relógio do fuso da campanha, nunca com o do
// servidor — senão o disparo "das 9h" sai às 6h.

export type SendWindow = {
  send_start?: string | null; // "09:00" ou "09:00:00"
  send_end?: string | null;
  send_days?: number[] | null; // 0 = domingo … 6 = sábado
  timezone?: string | null;
};

function minutesOf(time: string | null | undefined, fallback: number): number {
  if (!time) return fallback;
  const [h, m] = time.split(":");
  const hours = Number(h);
  const minutes = Number(m ?? 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return hours * 60 + minutes;
}

/** Minuto do dia e dia da semana no fuso indicado. */
function nowIn(timeZone: string, at: Date): { minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  // "24" aparece à meia-noite em algumas plataformas com hour12:false.
  const hour = Number(get("hour")) % 24;
  return {
    minute: hour * 60 + Number(get("minute")),
    weekday: weekdays[get("weekday")] ?? 0,
  };
}

export function isWithinSendWindow(window: SendWindow, at: Date = new Date()): boolean {
  const timeZone = window.timezone || "America/Sao_Paulo";
  const days = window.send_days?.length ? window.send_days : [1, 2, 3, 4, 5];

  let clock: { minute: number; weekday: number };
  try {
    clock = nowIn(timeZone, at);
  } catch {
    // Fuso inválido não pode virar disparo fora de hora: na dúvida, não envia.
    return false;
  }

  if (!days.includes(clock.weekday)) return false;

  const start = minutesOf(window.send_start, 9 * 60);
  const end = minutesOf(window.send_end, 18 * 60);

  // Janela que cruza a meia-noite (ex.: 20:00–02:00) — rara, mas não pode
  // simplesmente nunca abrir.
  if (end <= start) return clock.minute >= start || clock.minute < end;
  return clock.minute >= start && clock.minute < end;
}

/** Texto curto para log e para a tela. */
export function describeWindow(window: SendWindow): string {
  const names = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const days = (window.send_days?.length ? window.send_days : [1, 2, 3, 4, 5])
    .slice()
    .sort((a, b) => a - b)
    .map((d) => names[d] ?? "?")
    .join(", ");
  const cut = (t?: string | null) => (t ?? "").slice(0, 5);
  return `${days} · ${cut(window.send_start) || "09:00"}–${cut(window.send_end) || "18:00"}`;
}
