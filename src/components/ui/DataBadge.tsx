import { cn } from "@/lib/cn";

/**
 * Distingue en toda la UI si un valor viene de datos cargados por la empresa
 * ("loaded") o es un valor de referencia declarado en src/data ("reference").
 * Nunca se debe presentar un valor "reference" con la etiqueta "loaded".
 */
export function DataBadge({ kind }: { kind: "loaded" | "reference" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]",
        kind === "loaded" &&
          "border-accent/30 bg-accent-soft text-accent-bright",
        kind === "reference" &&
          "border-border-default bg-white/[0.03] text-text-tertiary",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          kind === "loaded" ? "bg-accent-bright" : "bg-text-tertiary",
        )}
      />
      {kind === "loaded" ? "Dato cargado" : "Valor de referencia"}
    </span>
  );
}
