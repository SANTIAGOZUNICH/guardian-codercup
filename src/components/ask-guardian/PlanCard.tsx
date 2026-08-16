"use client";

import { Check, X } from "lucide-react";
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
  onChoose,
}: {
  view: PlanCardView;
  onWhyThisPlan?: () => void;
  onChoose: () => void;
}) {
  if (!view.recommended) {
    // Compact — sin llenar de métricas.
    return (
      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border-subtle bg-white/[0.015] p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text-primary">Plan {view.rankLabel}</span>
          {view.deadlineMet ? (
            <Check size={14} className="text-risk-low" />
          ) : (
            <X size={14} className="text-risk-high" />
          )}
        </div>
        <p className="text-sm text-text-secondary">{view.completionLabel}</p>
        <p className="text-xs text-text-tertiary">
          Bottleneck: {view.bottleneckProcess} · {view.bottleneckHoursLabel}
        </p>
        <button
          onClick={onChoose}
          className="mt-1 rounded-[var(--radius-sm)] border border-border-default py-2 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
        >
          Choose this plan
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border-2 border-accent/40 bg-[linear-gradient(160deg,var(--accent-soft),transparent_55%)] p-7",
        "shadow-[0_0_60px_-16px_var(--accent-glow)]",
      )}
    >
      <div className="mb-6 flex items-center justify-between">
        <p className="text-lg font-semibold tracking-tight text-text-primary">
          Plan {view.rankLabel} <span className="text-accent-bright">— Recommended</span>
        </p>
        {view.deadlineMet ? (
          <span className="flex items-center gap-1 rounded-full border border-risk-low/40 bg-risk-low-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-risk-low">
            <Check size={11} /> Deadline met
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full border border-risk-high/40 bg-risk-high-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-risk-high">
            <X size={11} /> Deadline missed
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <Fact label="Completion" value={view.completionLabel} />
        <Fact label="Deadline" value={view.deadlineLabel} />
        <Fact label="Materials" value={view.materialsAvailable ? "Available" : "Missing"} ok={view.materialsAvailable} />
        <Fact label="Resources" value={view.resourcesLabel} />
        <Fact label="Bottleneck" value={`${view.bottleneckProcess} · ${view.bottleneckHoursLabel}`} />
      </div>

      {view.contentionLabel && (
        <p className="mt-5 text-xs text-text-tertiary">Existing-order contention: {view.contentionLabel}</p>
      )}
      <p className="mt-2 text-xs text-text-tertiary">Trade-off: {view.tradeOffLabel}</p>

      <div className="mt-6 flex gap-3">
        <button onClick={onChoose} className="flex-1 rounded-[var(--radius-md)] bg-accent py-3 text-sm font-medium text-white transition-opacity hover:opacity-90">
          Choose this plan
        </button>
        {onWhyThisPlan && (
          <button
            onClick={onWhyThisPlan}
            className="rounded-[var(--radius-md)] border border-border-default px-5 py-3 text-sm font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            Why this plan?
          </button>
        )}
      </div>
    </div>
  );
}
