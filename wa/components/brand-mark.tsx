// Símbolo da CNV (o mesmo do favicon), inline para seguir o tema: o traço usa
// a cor de marca e o fundo some no claro.

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill="currentColor" opacity="0.08" />
      <path
        d="M20 40c6 6 18 6 24 0M18 30l6-10c1.5-2.5 4-4 7-4h2c3 0 5.5 1.5 7 4l6 10"
        fill="none"
        stroke="var(--color-brand-500)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="24" cy="38" r="3.5" fill="var(--color-brand-500)" />
      <circle cx="40" cy="38" r="3.5" fill="var(--color-brand-500)" />
    </svg>
  );
}
