"use client";

import { useState } from "react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { PlanCard } from "./PlanCard";
import { BaselineCard } from "./BaselineCard";
import { WhyThisPlanModal } from "./WhyThisPlanModal";
import {
  buildPlanCardView,
  buildWhyThisPlanView,
  buildBaselineView,
  buildOutcomeHeadline,
  buildOutcomeGuardianMessage,
  buildContextNote,
  resolveGoalDeadlineLabel,
} from "@/lib/view/simulation-view-model";
import { buildOperationalImpactView } from "@/lib/view/disruption-view-model";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";
import type { EvaluatedScenario, GoalSimulationResult, MachineUnavailableDisruption, OperationalModel } from "@/lib/types";

/** Todo lo que RecommendedPlansScreen necesita para mostrar el bloque Before/After — agrupado en un solo prop opcional. */
export interface RecommendedPlansDisruptionContext {
  model: OperationalModel;
  disruptedModel: OperationalModel;
  disruption: MachineUnavailableDisruption;
  resourceName: string;
  beforeResult: GoalSimulationResult;
}

export function RecommendedPlansScreen({
  result,
  disruptionContext = null,
  onChoosePlan,
  onBack,
}: {
  result: GoalSimulationResult;
  /** Presente solo cuando este resultado viene de una Re-Simulation (Checkpoint 6) — null en la simulación normal. */
  disruptionContext?: RecommendedPlansDisruptionContext | null;
  onChoosePlan: (scenario: EvaluatedScenario) => void;
  onBack: () => void;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const { kind, candidates } = result.outcome;
  const deadlineLabel = resolveGoalDeadlineLabel(result.goal, DEFAULT_OPERATIONS_CALENDAR);
  const topCandidates = candidates.slice(0, 3);
  const disruptionLabel = disruptionContext ? `${disruptionContext.resourceName} no disponible` : null;
  const whyView = buildWhyThisPlanView(result, DEFAULT_OPERATIONS_CALENDAR, disruptionLabel);
  const baselineView = buildBaselineView(result.baseline);
  const contextNote = buildContextNote(result.scenarios);
  const impactView = disruptionContext
    ? buildOperationalImpactView(
        disruptionContext.model,
        disruptionContext.disruptedModel,
        disruptionContext.disruption,
        disruptionContext.resourceName,
        disruptionContext.beforeResult,
        result,
      )
    : null;

  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-6 py-14">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-tertiary">
          {buildOutcomeHeadline(kind)}
        </p>
        <p className="mt-2 max-w-md text-sm text-text-secondary">
          {result.scenarios.length} escenarios evaluados para {result.goal.quantity.toLocaleString("es-AR")}{" "}
          {result.goal.productName}
          {result.goal.client ? ` · ${result.goal.client}` : ""}
        </p>
        {disruptionLabel && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-risk-medium/30 bg-risk-medium-soft px-3 py-1 text-[11px] font-medium text-risk-medium">
            Disrupción activa — {disruptionLabel}
          </p>
        )}
      </div>

      <Guardian
        state={kind === "fully_viable" ? "success" : "alert"}
        size={72}
        message={buildOutcomeGuardianMessage(result, disruptionContext?.resourceName ?? null)}
      />

      {impactView && (
        <div className="w-full max-w-2xl rounded-[var(--radius-md)] border border-border-subtle bg-white/[0.015] px-6 py-5">
          <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
            Impacto operacional
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.06em] text-text-tertiary">
                  <th className="pb-2 font-medium" />
                  <th className="pb-2 font-medium">Antes</th>
                  <th className="pb-2 font-medium">Después</th>
                </tr>
              </thead>
              <tbody>
                {impactView.rows.map((row) => (
                  <tr key={row.label} className="border-t border-border-subtle">
                    <td className="py-2 pr-4 text-text-secondary">{row.label}</td>
                    <td className="py-2 pr-4 text-text-tertiary">{row.before}</td>
                    <td className="py-2 font-medium text-text-primary">{row.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-text-secondary">
            <span className="font-semibold text-text-tertiary">Guardian — </span>
            {impactView.narrative}
          </p>
        </div>
      )}

      <BaselineCard view={baselineView} />

      {contextNote && <p className="max-w-md text-center text-[11px] text-text-disabled">{contextNote}</p>}

      {topCandidates.length > 0 ? (
        <div className="grid w-full max-w-4xl grid-cols-1 gap-5 md:grid-cols-3">
          {topCandidates.map((scenario, index) => {
            const view = buildPlanCardView(scenario, index, deadlineLabel, kind);
            return (
              <div key={scenario.config.id} className={index === 0 && view.badgeLabel ? "md:col-span-3" : ""}>
                <PlanCard
                  view={view}
                  onWhyThisPlan={index === 0 && whyView ? () => setShowWhy(true) : undefined}
                  whyThisPlanLabel={whyView?.ctaLabel}
                  onChoose={() => onChoosePlan(scenario)}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-text-tertiary">
          No hay ninguna configuración de recursos disponible para este producto en el Twin actual.
        </p>
      )}

      <Button variant="ghost" onClick={onBack}>
        Volver al Centro de Operaciones
      </Button>

      {showWhy && whyView && <WhyThisPlanModal view={whyView} onClose={() => setShowWhy(false)} />}
    </div>
  );
}
