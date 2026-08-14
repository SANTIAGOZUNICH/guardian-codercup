"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export interface LoginPayload {
  email: string;
  password: string;
  companyName: string;
  industry: string;
}

const INDUSTRIES = [
  { id: "cosmeticos", label: "Cosméticos", enabled: true },
  { id: "alimentos", label: "Alimentos", enabled: false },
  { id: "textil", label: "Textil", enabled: false },
];

export function LoginScreen({ onSubmit }: { onSubmit: (payload: LoginPayload) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("Laboratorio Genus");
  const [industry, setIndustry] = useState("cosmeticos");

  const canSubmit = email.trim().length > 3 && password.length > 0 && companyName.trim().length > 0;

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="relative mb-6 h-14 w-14">
            <div className="absolute inset-0 animate-pulse-soft rounded-full bg-accent/20 blur-xl" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-accent/40 bg-[radial-gradient(circle_at_30%_30%,var(--accent-bright),var(--accent-dim))] shadow-[0_0_40px_-8px_var(--accent-glow)]">
              <div className="h-3 w-3 rounded-full bg-white/90" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">GUARDIAN</h1>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-text-secondary">
            Build a digital model of your company.
            <br />
            Then simulate the future.
          </p>
        </div>

        <form
          className="glass-panel flex flex-col gap-5 rounded-[var(--radius-lg)] p-8"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            onSubmit({ email, password, companyName, industry });
          }}
        >
          <Input
            label="Email"
            type="email"
            placeholder="vos@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <Input
            label="Contraseña"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <Input
            label="Empresa"
            type="text"
            placeholder="Laboratorio Genus"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
          />

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Rubro
            </span>
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  disabled={!opt.enabled}
                  onClick={() => setIndustry(opt.id)}
                  title={opt.enabled ? undefined : "Próximamente"}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200",
                    industry === opt.id && opt.enabled
                      ? "border-accent/50 bg-accent-soft text-accent-bright"
                      : "border-border-default bg-white/[0.02] text-text-secondary",
                    !opt.enabled && "cursor-not-allowed opacity-40",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" disabled={!canSubmit} className="mt-3 w-full">
            Ingresar
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
