"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** "gradient" — CTA protagonista (ej. First Impression / Login) — azul→violeta, reservado para el único CTA dominante de una pantalla, nunca decorativo en cascada. */
  variant?: "primary" | "ghost" | "gradient";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] px-6 text-sm font-medium tracking-tight transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40",
          variant === "primary" &&
            "bg-accent text-white shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset,0_8px_24px_-8px_var(--accent-glow)] hover:brightness-110 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_10px_32px_-6px_var(--accent-glow)] active:brightness-95",
          variant === "gradient" &&
            "bg-[image:var(--accent-gradient)] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_10px_32px_-10px_var(--accent-glow)] hover:brightness-110 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.1)_inset,0_14px_40px_-8px_var(--accent-glow)] active:brightness-95",
          variant === "ghost" &&
            "border border-border-default bg-white/[0.02] text-text-primary hover:bg-white/[0.05] hover:border-border-strong",
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
