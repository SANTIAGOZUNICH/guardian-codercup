"use client";

import type { ReactNode } from "react";
import { Gauge, MessageCircle, Compass, AlertTriangle, Play } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { cn } from "@/lib/cn";

export type AppShellNavItem = "command-center" | "ask-guardian" | "operational-twin" | "constraints" | "simulations";

/**
 * ============================================================================
 * AppShell — sidebar + topbar persistente (Checkpoint 9A)
 * ============================================================================
 * "GUARDIAN muestra solamente lo que sabe" también aplica a la navegación:
 * Constraints y Simulations solo aparecen cuando `showConstraints`/
 * `showSimulations` son true (decidido por el caller con datos reales, nunca
 * por diseño). Command Center / Ask Guardian / Operational Twin son la base
 * siempre visible.
 *
 * Envuelve SOLO la fase Command Center en GuardianApp — el resto de las
 * pantallas (Guided Setup, Ask Guardian, Constraints, etc.) siguen
 * exactamente como estaban, sin este shell, hasta su propio checkpoint
 * visual.
 */
export function AppShell({
  companyName,
  activeItem,
  showConstraints,
  showSimulations,
  onNavigate,
  children,
}: {
  companyName: string;
  activeItem: AppShellNavItem;
  showConstraints: boolean;
  showSimulations: boolean;
  onNavigate: (item: AppShellNavItem) => void;
  children: ReactNode;
}) {
  const navItems: { key: AppShellNavItem; label: string; icon: ReactNode; visible: boolean }[] = [
    { key: "command-center", label: "Centro de Operaciones", icon: <Gauge size={17} />, visible: true },
    { key: "ask-guardian", label: "Preguntale a Guardian", icon: <MessageCircle size={17} />, visible: true },
    { key: "operational-twin", label: "Modelo Operacional", icon: <Compass size={17} />, visible: true },
    { key: "constraints", label: "Restricciones", icon: <AlertTriangle size={17} />, visible: showConstraints },
    { key: "simulations", label: "Simulaciones", icon: <Play size={17} />, visible: showSimulations },
  ];

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <aside className="flex shrink-0 items-center justify-between gap-4 border-b border-border-subtle bg-bg-sidebar px-4 py-3 backdrop-blur-xl lg:w-60 lg:flex-col lg:items-stretch lg:justify-start lg:gap-8 lg:border-b-0 lg:border-r lg:px-5 lg:py-7">
        <button
          type="button"
          onClick={() => onNavigate("command-center")}
          className="flex items-center gap-3 text-left"
          aria-label="Ir al Centro de Operaciones"
        >
          <Guardian state="idle" size={30} className="gap-0" />
          <span className="text-sm font-semibold tracking-[0.08em] text-text-primary">GUARDIAN</span>
        </button>

        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {navItems
            .filter((item) => item.visible)
            .map((item) => {
              const active = item.key === activeItem;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onNavigate(item.key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-[var(--radius-sm)] border-b-2 px-3 py-2 text-xs font-medium transition-all duration-[var(--duration-fast)] lg:border-b-0 lg:border-l-2 lg:py-2.5 lg:text-sm",
                    active
                      ? "border-accent bg-bg-sidebar-active text-accent-bright"
                      : "border-transparent text-text-secondary hover:bg-white/[0.03] hover:text-text-primary",
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border-subtle bg-bg-base/80 px-4 py-3.5 backdrop-blur-xl sm:px-6 lg:px-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-text-primary">{companyName}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-tertiary">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-bright animate-pulse-soft" />
              Modelo Operacional · <span className="text-accent-bright">ACTIVO</span>
            </p>
          </div>
          <Guardian state="idle" size={44} className="gap-0" />
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
