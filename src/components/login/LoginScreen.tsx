"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export interface LoginPayload {
  email: string;
  password: string;
  companyName: string;
  /** GUARDIAN V1 es exclusivamente para laboratorios cosméticos — nunca se le pregunta el rubro al usuario. */
  industry: "cosmeticos";
}

export function LoginScreen({ onSubmit }: { onSubmit: (payload: LoginPayload) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");

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
            Construí un modelo de tu laboratorio.
            <br />
            Después preguntale qué podría pasar.
          </p>
        </div>

        <form
          className="glass-panel flex flex-col gap-5 rounded-[var(--radius-lg)] p-8"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            onSubmit({ email, password, companyName, industry: "cosmeticos" });
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
            label="Laboratorio"
            type="text"
            placeholder="Ej: Laboratorio Cosmético del Sur"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
          />

          <Button type="submit" disabled={!canSubmit} className="mt-3 w-full">
            Ingresar
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
