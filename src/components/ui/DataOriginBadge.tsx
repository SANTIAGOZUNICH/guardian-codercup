import { cn } from "@/lib/cn";
import type { DataProvenance } from "@/lib/types";

/**
 * ============================================================================
 * Data Origin visual language (Visual Checkpoint A)
 * ============================================================================
 * Un único componente para las 4 categorías de `DataProvenance` (ver
 * types.ts) — nunca colores distintos por pantalla para el mismo concepto.
 * `reference_estimate` usa el mismo ámbar que el resto del sistema de riesgo
 * ("warning", nunca "error") — es intencional: una estimación no es un dato
 * roto, pero sí algo que vale la pena distinguir visualmente de un dato duro.
 * "user_provided" (Ask Guardian / Guided Setup, texto libre del usuario)
 * comparte el estilo neutro de company_data — ambos son "la empresa lo dijo",
 * solo cambia el canal por el que entró.
 */
const STYLE: Record<DataProvenance, { dot: string; classes: string; label: string }> = {
  company_data: { dot: "bg-accent-bright", classes: "border-accent/30 bg-accent-soft text-accent-bright", label: "Dato de tu empresa" },
  user_provided: { dot: "bg-accent-bright", classes: "border-accent/30 bg-accent-soft text-accent-bright", label: "Dato de tu empresa" },
  reference_estimate: {
    dot: "bg-risk-medium",
    classes: "border-risk-medium/30 bg-risk-medium-soft text-risk-medium",
    label: "Valor de referencia",
  },
  calculated: {
    dot: "bg-[#9b8cff]",
    classes: "border-[#9b8cff]/25 bg-[#9b8cff]/10 text-[#b3a8ff]",
    label: "Calculado",
  },
};

const NOT_EVALUATED = {
  dot: "bg-text-disabled",
  classes: "border-border-default bg-white/[0.03] text-text-tertiary",
  label: "No evaluado",
};

export function DataOriginBadge({ origin, className }: { origin: DataProvenance | "not_evaluated"; className?: string }) {
  const style = origin === "not_evaluated" ? NOT_EVALUATED : STYLE[origin];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]",
        style.classes,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      {style.label}
    </span>
  );
}
