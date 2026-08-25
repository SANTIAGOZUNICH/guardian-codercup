"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, CalendarClock, Cpu, Eye, EyeOff, Gauge, Lock, Mail, ShieldCheck, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Guardian } from "@/components/guardian/Guardian";
import { GuardianLogo } from "@/components/ui/GuardianLogo";
import { useMotionSafe } from "@/lib/useMotionSafe";

export interface LoginPayload {
  email: string;
  password: string;
  companyName: string;
  /** GUARDIAN V1 es exclusivamente para laboratorios cosméticos — nunca se le pregunta el rubro al usuario. */
  industry: "cosmeticos";
}

const BENEFITS = [
  { icon: Gauge, label: "Entendé tu capacidad real" },
  { icon: CalendarClock, label: "Simulá escenarios antes de que pasen" },
  { icon: ShieldCheck, label: "Tomá decisiones con confianza" },
];

export function LoginScreen({ onSubmit, onUseDemo }: { onSubmit: (payload: LoginPayload) => void; onUseDemo: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const motionSafe = useMotionSafe();

  const canSubmit = email.trim().length > 3 && password.length > 0 && companyName.trim().length > 0;

  function submit(values: { email: string; password: string; companyName: string }) {
    onSubmit({ ...values, industry: "cosmeticos" });
  }

  function handleUseDemo() {
    onUseDemo();
  }

  const rise = (delay = 0) =>
    motionSafe
      ? { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as const } }
      : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4, delay } };

  return (
    <div className="relative flex min-h-screen w-full flex-1 items-center justify-center overflow-hidden px-6 py-12 lg:px-14 xl:px-20">
      {/* Glow localizado detrás de Guardian — encima del backdrop ambiental global de <Scene>, nunca lo reemplaza */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[42%] h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-[130px] lg:left-[58%]"
        style={{ background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 grid w-full max-w-[1240px] grid-cols-1 items-center gap-14 lg:grid-cols-[1.1fr_0.85fr] lg:gap-10 xl:gap-16">
        {/* ============================== IZQUIERDA — Branding + Guardian ============================== */}
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <motion.div {...rise(0)} className="flex items-center gap-3">
            <GuardianLogo size={40} />
            <div>
              <p className="text-xl font-bold tracking-[0.08em] text-text-primary">GUARDIAN</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-accent-bright">Tu operación. Bajo control.</p>
            </div>
          </motion.div>

          <motion.h1
            {...rise(0.08)}
            className="mt-6 max-w-lg text-[32px] font-semibold leading-[1.2] tracking-tight text-text-primary xl:mt-8 xl:text-[42px] xl:leading-[1.15]"
          >
            Entendé tu operación.
            <br />
            <span className="text-text-secondary">Simulá lo que puede pasar.</span>
          </motion.h1>

          <motion.p {...rise(0.14)} className="mt-4 max-w-md text-[15px] leading-relaxed text-text-secondary">
            Guardian transforma los datos de tu laboratorio en decisiones más claras.
          </motion.p>

          <motion.div {...rise(0.2)} className="my-2 xl:my-4">
            <Guardian state="idle" size={300} variant="asset" />
          </motion.div>

          <motion.div {...rise(0.3)} className="flex w-full max-w-xs flex-col gap-2 sm:max-w-sm lg:max-w-none">
            {BENEFITS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center justify-center gap-3 lg:justify-start">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border-default bg-white/[0.03] text-accent-bright">
                  <Icon size={16} />
                </span>
                <span className="text-sm text-text-secondary">{label}</span>
              </div>
            ))}
          </motion.div>

          <motion.div {...rise(0.38)} className="mt-6 hidden items-center gap-3 text-xs text-text-tertiary lg:flex">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-accent-bright" />
              Tus datos quedan en tu sesión
            </span>
            <span aria-hidden className="h-3 w-px bg-border-default" />
            <span className="flex items-center gap-1.5">
              <Cpu size={13} className="text-accent-bright" />
              IA aplicada a tu operación
            </span>
          </motion.div>
        </div>

        {/* ============================== DERECHA — Panel de acceso ============================== */}
        <motion.div {...rise(0.16)} className="w-full max-w-md justify-self-center lg:justify-self-end">
          <div className="rounded-[var(--radius-xl)] border border-border-default bg-bg-elevated p-8 shadow-[var(--shadow-elevation-2)] xl:p-10">
            <div className="text-center">
              <p className="text-sm text-accent-bright">Bienvenido a</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-text-primary">GUARDIAN</p>
            </div>

            <div className="my-7 flex items-center gap-3">
              <span aria-hidden className="h-px flex-1 bg-border-default" />
              <GuardianLogo size={22} />
              <span aria-hidden className="h-px flex-1 bg-border-default" />
            </div>

            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!canSubmit) return;
                submit({ email, password, companyName });
              }}
            >
              <Input
                label="Email"
                type="email"
                placeholder="vos@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                icon={<Mail size={16} />}
                required
              />
              <Input
                label="Laboratorio"
                type="text"
                placeholder="Nombre de tu laboratorio"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                icon={<Building2 size={16} />}
                required
              />
              <Input
                label="Contraseña"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                icon={<Lock size={16} />}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="flex h-6 w-6 items-center justify-center text-text-tertiary transition-colors hover:text-text-secondary"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
                required
              />

              <Button type="submit" variant="gradient" disabled={!canSubmit} className="mt-2 w-full">
                Entrar
                <ArrowRight size={16} />
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <span aria-hidden className="h-px flex-1 bg-border-subtle" />
              <span className="text-[11px] text-text-disabled">o</span>
              <span aria-hidden className="h-px flex-1 bg-border-subtle" />
            </div>

            <Button type="button" variant="ghost" onClick={handleUseDemo} className="w-full">
              Usar demo
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
