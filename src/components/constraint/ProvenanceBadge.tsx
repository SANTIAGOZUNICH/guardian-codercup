import { cn } from "@/lib/cn";

export type Provenance = "company_data" | "reference" | "calculated";

const LABEL: Record<Provenance, string> = {
  company_data: "Company data",
  reference: "Reference",
  calculated: "Calculated",
};

/**
 * Badge discreto de procedencia de un dato — no convierte la pantalla en una
 * auditoría técnica, solo se usa en 2-3 valores clave (ver Checkpoint 3, punto 9).
 */
export function ProvenanceBadge({ kind }: { kind: Provenance }) {
  return (
    <span
      className={cn(
        "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.05em]",
        kind === "company_data" && "border-accent/30 text-accent-bright",
        kind === "reference" && "border-border-default text-text-tertiary",
        kind === "calculated" && "border-border-default text-text-secondary",
      )}
    >
      {LABEL[kind]}
    </span>
  );
}
