"use client";

import { motion } from "framer-motion";
import { ArrowRight, Compass } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { LastSimulation, OperationalModel, OrderConstraints } from "@/lib/types";
import {
  buildActiveConstraintSummary,
  buildOperationalHealth,
  buildTwinPreview,
} from "@/lib/view/command-center-view-model";
import { buildTwinGraph } from "@/lib/view/twin-graph-view-model";

const SEVERITY_STYLE = {
  critical: "border-risk-high/40 bg-risk-high-soft text-risk-high",
  high: "border-risk-medium/40 bg-risk-medium-soft text-risk-medium",
} as const;

const STATUS_DOT = {
  normal: "bg-accent-bright",
  warning: "bg-risk-medium",
  danger: "bg-risk-high",
  unavailable: "bg-text-disabled",
} as const;

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
  const health = buildOperationalHealth(model, orderConstraints);
  const activeConstraint = buildActiveConstraintSummary(model, orderConstraints);
  const graph = buildTwinGraph(model, orderConstraints);
  const twinPreview = buildTwinPreview(graph);

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="mb-10 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-tertiary">Guardian</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">{model.company.name}</h1>
            <p className="mt-1 text-sm text-text-secondary">Operational Twin · Active</p>
          </div>
          <Guardian state="idle" size={56} />
        </div>

        {/* Block 1 — Operational Health */}
        <div className="mb-6 grid grid-cols-2 gap-4 rounded-[var(--radius-lg)] border border-border-subtle bg-white/[0.015] p-6 sm:grid-cols-4">
          <Stat label="Orders" value={health.totalOrders} />
          <Stat label="Order(s) affected" value={health.affectedOrders} tone={health.affectedOrders > 0 ? "warning" : "normal"} />
          <Stat label="Constraints" value={health.totalConstraints} tone={health.totalConstraints > 0 ? "danger" : "normal"} />
          <Stat label="Processes" value={health.totalProcesses} />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Block 2 — Active Constraints */}
          <div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-border-subtle bg-white/[0.015] p-6">
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-text-tertiary">
                Active Constraints
              </p>
              {activeConstraint ? (
                <>
                  <div className="mb-2 flex items-center justify-between">
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
                </>
              ) : (
                <div className="mb-4">
                  <p className="text-sm font-medium text-risk-low">No active constraints</p>
                  <p className="mt-1 text-xs text-text-tertiary">Every loaded order is on track.</p>
                </div>
              )}
            </div>
            <Button variant="ghost" onClick={onViewConstraints} className="w-full justify-center">
              View constraints
            </Button>
          </div>

          {/* Block 3 — Operational Twin preview */}
          <div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-border-subtle bg-white/[0.015] p-6">
            <div>
              <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-text-tertiary">
                <Compass size={13} />
                Operational Twin
              </p>
              <div className="mb-4 flex flex-col gap-2.5">
                {twinPreview.map((layer) => (
                  <div key={layer.label} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-text-secondary">
                      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[layer.status])} />
                      {layer.label}
                    </span>
                    <span className="font-medium text-text-primary">{layer.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <Button variant="ghost" onClick={onExploreTwin} className="w-full justify-center">
              Explore Twin
            </Button>
          </div>
        </div>

        {/* Block 4 — Hero CTA */}
        <motion.button
          onClick={onAskGuardian}
          whileHover={{ scale: 1.005 }}
          className="w-full rounded-[var(--radius-lg)] border border-accent/30 bg-[linear-gradient(135deg,var(--accent-soft),transparent_60%)] p-8 text-left transition-shadow duration-200 hover:shadow-[0_0_60px_-12px_var(--accent-glow)]"
        >
          <p className="text-xl font-semibold tracking-tight text-text-primary">Ask Guardian About the Future</p>
          <p className="mt-1.5 text-sm text-text-secondary">Simulate an operational goal or hypothetical scenario.</p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-bright">
            Ask Guardian <ArrowRight size={15} />
          </span>
        </motion.button>

        {lastSimulation && (
          <div className="mt-6 flex items-center justify-between rounded-[var(--radius-md)] border border-border-subtle bg-white/[0.015] px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                Last Simulation
              </p>
              <p className="mt-1 text-sm text-text-primary">{lastSimulation.goalSummary}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-accent-bright">Recommended {lastSimulation.chosenPlanLabel}</p>
              <p className="text-xs text-text-tertiary">Expected completion: {lastSimulation.completionLabel}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "warning" | "danger" }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "normal" && "text-text-primary",
          tone === "warning" && "text-risk-medium",
          tone === "danger" && "text-risk-high",
        )}
      >
        {value}
      </span>
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-text-tertiary">{label}</span>
    </div>
  );
}
