"use client";

import { motion } from "framer-motion";
import { ArrowRight, Compass } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { NodeGraphV2 } from "@/components/model/NodeGraphV2";
import { cn } from "@/lib/cn";
import { useMotionSafe } from "@/lib/useMotionSafe";
import type { LastSimulation, OperationalModel, OrderConstraints } from "@/lib/types";
import { buildActiveConstraintSummary, selectHeroMetrics } from "@/lib/view/command-center-view-model";
import { buildTwinGraph } from "@/lib/view/twin-graph-view-model";

const SEVERITY_STYLE = {
  critical: "border-risk-high/40 bg-risk-high-soft text-risk-high",
  high: "border-risk-medium/40 bg-risk-medium-soft text-risk-medium",
} as const;

/**
 * ============================================================================
 * Command Center — pantalla hero de GUARDIAN (Checkpoint 9A)
 * ============================================================================
 * Adaptativa por diseño: `selectHeroMetrics` decide qué métricas mostrar
 * (nunca "0 Orders" para un Twin de Guided Setup), y el bloque Active
 * Constraint solo ocupa espacio cuando existe una restricción real —
 * ver `buildActiveConstraintSummary`. El grafo (NodeGraphV2/buildTwinGraph)
 * se reutiliza tal cual: acá solo cambia cómo se enmarca, nunca su semántica.
 */
export function CommandCenter({
  model,
  orderConstraints,
  lastSimulation,
  onViewConstraints,
  onExploreTwin,
  onAskGuardian,
}: {
  model: OperationalModel;
  orderConstraints: OrderConstraints[];
  lastSimulation: LastSimulation | null;
  onViewConstraints: () => void;
  onExploreTwin: () => void;
  onAskGuardian: () => void;
}) {
  const activeConstraint = buildActiveConstraintSummary(model, orderConstraints);
  const graph = buildTwinGraph(model, orderConstraints);
  const metrics = selectHeroMetrics(model, orderConstraints);
  const hasConstraint = activeConstraint !== null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* HERO — Operational Twin: la representación viva de la empresa, nunca "un diagrama metido en una card" */}
      <Card
        className="relative cursor-pointer overflow-hidden transition-colors duration-[var(--duration-base)] hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        onClick={onExploreTwin}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onExploreTwin()}
      >
        <div className="mb-1 flex items-center justify-between">
          <SectionLabel icon={<Compass size={13} />}>Operational Twin</SectionLabel>
          <span className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-accent-bright">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-bright animate-pulse-soft" />
            Active
          </span>
        </div>

        <div className="relative flex items-center justify-center px-2 py-3">
          <div className="mx-auto w-full max-w-[640px]">
            <NodeGraphV2 nodes={graph.nodes} edges={graph.edges} phase={graph.totalPhases} />
          </div>
          <div className="pointer-events-none absolute bottom-1 right-2 sm:right-6">
            <Guardian state="idle" size={60} />
          </div>
        </div>
      </Card>

      {/* METRICS — solo lo que el Twin realmente conoce, nunca un grid fijo con casilleros vacíos */}
      {metrics.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-14 gap-y-4 px-1">
          {metrics.map((m) => (
            <Stat key={m.label} label={m.label} value={m.value} tone={m.tone} />
          ))}
        </div>
      )}

      {/* ACTIVE CONSTRAINT (solo si existe) + ASK GUARDIAN */}
      <div className={cn("grid gap-5", hasConstraint ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]" : "grid-cols-1")}>
        {hasConstraint && activeConstraint && (
          <Card className="flex flex-col justify-between">
            <div>
              <SectionLabel>Active Constraint</SectionLabel>
              <div className="mt-4 mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">{activeConstraint.orderId}</span>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em]",
                    SEVERITY_STYLE[activeConstraint.severity],
                  )}
                >
                  {activeConstraint.severity}
                </span>
              </div>
              <p className="mb-3 text-sm text-text-secondary">
                {activeConstraint.client} · {activeConstraint.productName}
              </p>
              <ul className="mb-4 flex flex-col gap-1.5">
                {activeConstraint.kindLabels.map((label) => (
                  <li key={label} className="flex items-center gap-2 text-xs text-text-tertiary">
                    <span className="h-1 w-1 rounded-full bg-text-tertiary" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
            <Button variant="ghost" onClick={onViewConstraints} className="w-full justify-center">
              View constraints
            </Button>
          </Card>
        )}

        <AskGuardianCta onClick={onAskGuardian} />
      </div>

      {lastSimulation && (
        <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-border-subtle bg-white/[0.015] px-5 py-4">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
              Last Simulation
              {lastSimulation.disruptionLabel && (
                <span className="rounded-full border border-risk-medium/30 bg-risk-medium-soft px-2 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-risk-medium">
                  ⚠ {lastSimulation.disruptionLabel}
                </span>
              )}
            </p>
            <p className="mt-1 text-sm text-text-primary">{lastSimulation.goalSummary}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-accent-bright">{lastSimulation.chosenPlanLabel}</p>
            <p className="text-xs text-text-tertiary">Expected completion: {lastSimulation.completionLabel}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** CTA protagonista — se siente como una zona de entrada real, no un botón chico perdido entre otros. */
function AskGuardianCta({ onClick }: { onClick: () => void }) {
  const motionSafe = useMotionSafe();
  return (
    <motion.button
      onClick={onClick}
      whileHover={motionSafe ? { scale: 1.004 } : undefined}
      className="group flex flex-col justify-between rounded-[var(--radius-lg)] border border-accent/25 bg-[linear-gradient(135deg,var(--accent-soft),transparent_60%)] p-7 text-left shadow-[var(--shadow-elevation-1)] transition-shadow duration-[var(--duration-base)] hover:shadow-[0_0_60px_-14px_var(--accent-glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <SectionLabel className="text-accent-bright/80">Ask Guardian</SectionLabel>
      <p className="mt-4 text-xl font-medium tracking-tight text-text-secondary">
        Ask anything about your operation<span className="text-text-disabled">...</span>
      </p>
      <span className="mt-6 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-accent-bright transition-transform duration-[var(--duration-base)] group-hover:translate-x-1">
        <ArrowRight size={17} />
      </span>
    </motion.button>
  );
}
