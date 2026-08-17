"use client";

import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** "default" = superficie de contenido normal. "elevated" = modal/popover/hover state — un tono más claro + sombra más marcada. */
  surface?: "default" | "elevated";
  /** Halo de acento sutil en el borde — reservado para el elemento protagonista de una pantalla (ej. Ask Guardian CTA), nunca decorativo en cascada. */
  glow?: boolean;
}

/**
 * Primitivo de card compartido (Checkpoint 9A) — reemplaza los
 * `rounded-[var(--radius-lg)] border border-border-subtle bg-white/[0.015] p-6`
 * copiados a mano en cada pantalla. Un solo lugar para padding/borde/sombra,
 * consistentes en todo el producto.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, surface = "default", glow = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-[var(--radius-lg)] border p-6 transition-shadow duration-[var(--duration-base)]",
          surface === "default" && "border-border-subtle bg-white/[0.015] shadow-[var(--shadow-elevation-1)]",
          surface === "elevated" && "border-border-default bg-bg-elevated shadow-[var(--shadow-elevation-2)]",
          glow && "border-accent/30 shadow-[0_0_0_1px_rgba(62,123,250,0.08)_inset,var(--shadow-elevation-1)]",
          className,
        )}
        {...props}
      />
    );
  },
);
Card.displayName = "Card";
