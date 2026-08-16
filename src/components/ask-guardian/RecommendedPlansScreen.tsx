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
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";
import type { EvaluatedScenario, GoalSimulationResult } from "@/lib/types";

export function RecommendedPlansScreen({
  result,
  onChoosePlan,
  onBack,
}: {
  result: GoalSimulationResult;
  onChoosePlan: (scenario: EvaluatedScenario) => void;
  onBack: () => void;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const { kind, candidates } = result.outcome;
  const deadlineLabel = resolveGoalDeadlineLabel(result.goal, DEFAULT_OPERATIONS_CALENDAR);
  const topCandidates = candidates.slice(0, 3);
  const whyView = buildWhyThisPlanView(result, DEFAULT_OPERATIONS_CALENDAR);
  const baselineView = buildBaselineView(result.baseline);
  const contextNote = buildContextNote(result.scenarios);

  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-6 py-14">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-tertiary">
          {buildOutcomeHeadline(kind)}
        </p>
        <p className="mt-2 max-w-md text-sm text-text-secondary">
          {result.scenarios.length} scenarios evaluated for {result.goal.quantity.toLocaleString("es-AR")}{" "}
          {result.goal.productName}
          {result.goal.client ? ` · ${result.goal.client}` : ""}
        </p>
      </div>

      <Guardian state={kind === "fully_viable" ? "success" : "alert"} size={72} message={buildOutcomeGuardianMessage(result)} />

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
        Back to Command Center
      </Button>

      {showWhy && whyView && <WhyThisPlanModal view={whyView} onClose={() => setShowWhy(false)} />}
    </div>
  );
}
