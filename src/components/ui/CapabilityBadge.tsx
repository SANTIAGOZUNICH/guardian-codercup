import { cn } from "@/lib/cn";

/**
 * Estado binario "¿GUARDIAN tiene este tipo de dato conectado?" — usado por
 * bloques de capability como Material Intelligence (Visual Checkpoint A).
 * Deliberadamente separado de `DataOriginBadge`: esto responde "¿existe la
 * conexión?", no "¿de dónde vino un valor puntual?".
 */
export function CapabilityBadge({ connected, className }: { connected: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]",
        connected ? "border-accent/30 bg-accent-soft text-accent-bright" : "border-border-default bg-white/[0.03] text-text-tertiary",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-accent-bright" : "bg-text-disabled")} />
      {connected ? "Active" : "Not Connected"}
    </span>
  );
}
