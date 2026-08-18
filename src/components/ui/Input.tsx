"use client";

import { InputHTMLAttributes, ReactNode, forwardRef } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Ícono decorativo a la izquierda (ej. Mail, Lock) — nunca interactivo, solo contexto visual. */
  icon?: ReactNode;
  /** Elemento interactivo a la derecha (ej. toggle de mostrar/ocultar contraseña). */
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, id, icon, trailing, ...props }, ref) => {
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-2">
        <label
          htmlFor={inputId}
          className="text-xs font-medium uppercase tracking-[0.08em] text-text-tertiary"
        >
          {label}
        </label>
        <div className="relative flex items-center">
          {icon && (
            <span className="pointer-events-none absolute left-4 flex h-4 w-4 items-center justify-center text-text-tertiary">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "h-12 w-full rounded-[var(--radius-sm)] border border-border-default bg-white/[0.025] px-4 text-[15px] text-text-primary placeholder:text-text-disabled outline-none transition-all duration-200",
              "focus:border-accent focus:bg-white/[0.04] focus:shadow-[0_0_0_3px_var(--accent-soft)]",
              icon && "pl-11",
              trailing && "pr-11",
              className,
            )}
            {...props}
          />
          {trailing && <span className="absolute right-3.5 flex h-6 w-6 items-center justify-center">{trailing}</span>}
        </div>
      </div>
    );
  },
);
Input.displayName = "Input";
