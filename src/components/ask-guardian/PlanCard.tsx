"use client";

import { Check, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PlanCardView } from "@/lib/view/simulation-view-model";

function Fact({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
        {ok !== undefined && (ok ? <Check size={11} className="text-risk-low" /> : <X size={11} className="text-risk-high" />)}
        {label}
      </span>
      <span className="text-[15px] font-medium text-text-primary">{value}</span>
    </div>
  );
}

export function PlanCard({
  view,
  onWhyThisPlan,
  whyThisPlanLabel = "¿Por qué este plan?",
  onChoose,
}: {
  view: PlanCardView;
  onWhyThisPlan?: () => void;
  whyThisPlanLabel?: string;
  onChoose: () => void;
}) {
  const featured = view.badgeLabel !== null;

  if (!featured) {
    // Compact — sin llenar de métricas.
    return (
      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border-subtle bg-white/[0.015] p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text-primary">Plan {view.rankLabel}</span>
          {view.status === "deadline_missed" || view.status === "infeasible" ? (
            <X size={14} className="text-risk-high" />
          ) : (
            <Check size={14} className="text-risk-low" />
          )}
        </div>
        <p className="text-sm text-text-secondary">{view.completionLabel}</p>
        <p className="text-xs text-text-tertiary">
          Cuello de botella: {view.bottleneckProcess} · {view.bottleneckHoursLabel}
        </p>
        <button
          onClick={onChoose}
          className="mt-1 rounded-[var(--radius-sm)] border border-border-default py-2 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
        >
          Elegir este plan
        </button>
      </div>
    );
  }

  // "fully_viable" y "operationally_viable" comparten el mismo tono de confianza: ambos cumplen
  // capacidad+deadline realmente — la única diferencia es si los materiales están confirmados o
  // simplemente no evaluados (nunca mostrado como un problema, ver Materials Simulation Rule).
  const isConfident = view.status === "fully_viable" || view.status === "operationally_viable";
  const accentBorder = isConfident ? "border-accent/40" : "border-risk-medium/40";
  const accentGlow = isConfident ? "shadow-[0_0_60px_-16px_var(--accent-glow)]" : "shadow-[0_0_60px_-20px_rgba(224,166,64,0.35)]";
  const accentBg = isConfident
    ? "bg-[linear-gradient(160deg,var(--accent-soft),transparent_55%)]"
    : "bg-[linear-gradient(160deg,var(--risk-medium-soft),transparent_55%)]";

  return (
    <div className={cn("rounded-[var(--radius-lg)] border-2 p-7", accentBorder, accentGlow, accentBg)}>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-lg font-semibold tracking-tight text-text-primary">
          Plan {view.rankLabel}{" "}
          <span className={isConfident ? "text-accent-bright" : "text-risk-medium"}>— {view.badgeLabel}</span>
        </p>
        {isConfident ? (
          <span className="flex items-center gap-1 rounded-full border border-risk-low/40 bg-risk-low-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-risk-low">
            <Check size={11} /> Cumple el deadline
          </span>
        ) : view.status === "conditionally_viable" ? (
          <span className="flex items-center gap-1 rounded-full border border-risk-medium/40 bg-risk-medium-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-risk-medium">
            <AlertTriangle size={11} /> Materiales bloqueados
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full border border-risk-high/40 bg-risk-high-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-risk-high">
            <X size={11} /> No cumple el deadline
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <Fact label="Finalización" value={view.completionLabel} />
        <Fact label="Deadline" value={view.deadlineLabel} />
        {/* Materials Simulation Rule: ausencia de datos (not_evaluated) nunca se muestra — ni como "Faltan", ni de ninguna otra forma. */}
        {view.materialsStatus !== "not_evaluated" && (
          <Fact label="Materiales" value={view.materialsStatus === "pass" ? "Disponibles" : "Faltan"} ok={view.materialsStatus === "pass"} />
        )}
        <Fact label="Recursos" value={view.resourcesLabel} />
        <Fact label="Cuello de botella" value={`${view.bottleneckProcess} · ${view.bottleneckHoursLabel}`} />
      </div>

      {view.materialBlockerLabel && (
        <div className="mt-5 rounded-[var(--radius-sm)] border border-risk-high/25 bg-risk-high-soft px-4 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-risk-high">Bloqueo de materiales</span>
          <p className="text-sm text-text-primary">{view.materialBlockerLabel}</p>
        </div>
      )}
      <p className="mt-3 text-xs text-text-tertiary">Compromiso: {view.tradeOffLabel}</p>

      <div className="mt-6 flex gap-3">
        <button
          onClick={onChoose}
          className={cn(
            "flex-1 rounded-[var(--radius-md)] py-3 text-sm font-medium text-white transition-opacity hover:opacity-90",
            isConfident ? "bg-accent" : "bg-risk-medium",
          )}
        >
          Elegir este plan
        </button>
        {onWhyThisPlan && (
          <button
            onClick={onWhyThisPlan}
            className="rounded-[var(--radius-md)] border border-border-default px-5 py-3 text-sm font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            {whyThisPlanLabel}
          </button>
        )}
      </div>
    </div>
  );
}
