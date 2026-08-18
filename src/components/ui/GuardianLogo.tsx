/**
 * Marca hexagonal de GUARDIAN — hexágono + trazo abierto que sugiere una "G",
 * mismo lenguaje de gradiente azul→violeta que el CTA protagonista (First
 * Impression). Puramente decorativa, sin estado ni animación propia.
 */
export function GuardianLogo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" role="img" aria-label="GUARDIAN" className={className}>
      <defs>
        <linearGradient id="guardian-logo-gradient" x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--accent-bright)" />
          <stop offset="100%" stopColor="var(--accent-violet)" />
        </linearGradient>
      </defs>
      <path
        d="M24 2 L44 13 V35 L24 46 L4 35 V13 Z"
        fill="rgba(62,123,250,0.08)"
        stroke="url(#guardian-logo-gradient)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path d="M30 17 A10 10 0 1 0 32 30" fill="none" stroke="url(#guardian-logo-gradient)" strokeWidth={3.2} strokeLinecap="round" />
      <circle cx={32} cy={24} r={2.6} fill="var(--accent-bright)" />
    </svg>
  );
}
