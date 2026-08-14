"use client";

import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, id, ...props }, ref) => {
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-2">
        <label
          htmlFor={inputId}
          className="text-xs font-medium uppercase tracking-[0.08em] text-text-tertiary"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "h-12 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.025] px-4 text-[15px] text-text-primary placeholder:text-text-disabled outline-none transition-all duration-200",
            "focus:border-accent focus:bg-white/[0.04] focus:shadow-[0_0_0_3px_var(--accent-soft)]",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
Input.displayName = "Input";
