import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * El único micro-label uppercase-tracked del sistema (Checkpoint 9A). Regla:
 * a lo sumo uno por bloque visual — si dos aparecen pegados, el segundo debe
 * bajar a texto normal-case, nunca apilar dos SectionLabel seguidos.
 */
export function SectionLabel({ children, className, icon }: { children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <p className={cn("flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-tertiary", className)}>
      {icon}
      {children}
    </p>
  );
}
