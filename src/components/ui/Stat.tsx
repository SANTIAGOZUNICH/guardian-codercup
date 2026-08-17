import { cn } from "@/lib/cn";

export type StatTone = "normal" | "warning" | "danger";

/**
 * Número + label — primitivo compartido (Checkpoint 9A, promovido desde el
 * `Stat` local que vivía solo en CommandCenter). El valor SIEMPRE viene de
 * datos reales del caller — este componente nunca decide qué mostrar.
 */
export function Stat({ label, value, tone = "normal" }: { label: string; value: number; tone?: StatTone }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={cn(
          "text-[28px] font-semibold leading-none tabular-nums tracking-tight",
          tone === "normal" && "text-text-primary",
          tone === "warning" && "text-risk-medium",
          tone === "danger" && "text-risk-high",
        )}
      >
        {value.toLocaleString("es-AR")}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">{label}</span>
    </div>
  );
}
