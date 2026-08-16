"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import type { WhyThisPlanView } from "@/lib/view/simulation-view-model";

const PROVENANCE = [
  { label: "Quantity", source: "User goal" },
  { label: "Resource capacity", source: "Company data" },
  { label: "Batch duration", source: "Reference profile" },
  { label: "Completion", source: "Calculated" },
  { label: "Recommendation", source: "Deterministic ranking" },
];

export function WhyThisPlanModal({ view, onClose }: { view: WhyThisPlanView; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="glass-panel w-full max-w-lg rounded-[var(--radius-lg)] p-7"
      >
        <p className="text-lg font-semibold tracking-tight text-text-primary">{view.headline}</p>
        <p className="mt-1 text-xs text-text-tertiary">{view.narrativeIntro}</p>
        {view.disruptionLabel && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-risk-medium/30 bg-risk-medium-soft px-3 py-1 text-[11px] font-medium text-risk-medium">
            Active disruption — {view.disruptionLabel}
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Your goal</p>
            <p className="mt-1 text-sm text-text-primary">{view.goalSummary}</p>
            {view.clientLabel && <p className="text-xs text-text-tertiary">Client: {view.clientLabel}</p>}
            <p className="text-xs text-text-tertiary">Deadline: {view.deadlineLabel}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Evaluation</p>
            <p className="mt-1 text-sm text-text-primary">{view.evaluatedCount} scenarios evaluated</p>
            <p className="text-xs text-text-tertiary">{view.feasibleCount} physically feasible</p>
            <p className="text-xs text-text-tertiary">{view.meetDeadlineCount} meet deadline</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
            Recommendation — Plan {view.recommendedLabel}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {view.reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-2 text-sm text-text-secondary">
                <Check size={13} className="mt-0.5 shrink-0 text-risk-low" />
                {reason}
              </li>
            ))}
          </ul>
          {view.dominanceNote && (
            <p className="mt-3 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 py-2.5 text-xs leading-relaxed text-text-secondary">
              <span className="font-semibold text-text-tertiary">Guardian — </span>
              {view.dominanceNote}
            </p>
          )}
        </div>

        <div className="mt-6 flex gap-8">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Bottleneck</p>
            <p className="mt-1 text-sm text-text-primary">{view.bottleneckProcess}</p>
          </div>
          {view.materialBlockerLabel && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-risk-high">Material blocker</p>
              <p className="mt-1 text-sm text-text-primary">{view.materialBlockerLabel}</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border-subtle pt-4">
          {PROVENANCE.map((p) => (
            <span key={p.label} className="text-[10px] text-text-disabled">
              {p.label} — <span className="text-text-tertiary">{p.source}</span>
            </span>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-[var(--radius-md)] border border-border-default py-2.5 text-sm font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
        >
          Close
        </button>
      </motion.div>
    </div>
  );
}
