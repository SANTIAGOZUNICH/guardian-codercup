"use client";

import { useState } from "react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { PlanCard } from "./PlanCard";
import { WhyThisPlanModal } from "./WhyThisPlanModal";
import {
  buildPlanCardView,
  buildWhyThisPlanView,
  buildNoSolutionView,
  buildGoalGuardianMessage,
  goalIsUnsolved,
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
  const unsolved = goalIsUnsolved(result);
  const deadlineLabel = resolveGoalDeadlineLabel(result.goal, DEFAULT_OPERATIONS_CALENDAR);
  const topPlans = result.ranked.slice(0, 3);
  const whyView = buildWhyThisPlanView(result, DEFAULT_OPERATIONS_CALENDAR);
  const noSolutionView = unsolved ? buildNoSolutionView(result) : null;

  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-6 py-14">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-tertiary">
          {unsolved ? "No Plan Meets the Current Deadline" : "Recommended Plans"}
        </p>
        <p className="mt-2 max-w-md text-sm text-text-secondary">
          {result.scenarios.length} scenarios evaluated for {result.goal.quantity.toLocaleString("es-AR")}{" "}
          {result.goal.productName}
          {result.goal.client ? ` · ${result.goal.client}` : ""}
        </p>
      </div>

      <Guardian
        state={unsolved ? "alert" : "success"}
        size={72}
        message={unsolved ? noSolutionView?.guardianMessage : buildGoalGuardianMessage(result.goal)}
      />

      {unsolved && noSolutionView?.closestCompletionLabel && (
        <div className="w-full max-w-md rounded-[var(--radius-md)] border border-risk-medium/30 bg-risk-medium-soft px-5 py-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-risk-medium">
            Closest feasible alternative
          </p>
          <p className="mt-1 text-sm font-medium text-text-primary">
            Earliest completion: {noSolutionView.closestCompletionLabel}
          </p>
        </div>
      )}

      <div className="grid w-full max-w-4xl grid-cols-1 gap-5 md:grid-cols-3">
        {topPlans.map((scenario, index) => {
          const view = buildPlanCardView(scenario, index, deadlineLabel);
          const finalView = unsolved ? { ...view, recommended: false } : view;
          return (
            <div key={scenario.config.id} className={!unsolved && index === 0 ? "md:col-span-3" : ""}>
              <PlanCard
                view={finalView}
                onWhyThisPlan={!unsolved && index === 0 ? () => setShowWhy(true) : undefined}
                onChoose={() => onChoosePlan(scenario)}
              />
            </div>
          );
        })}
      </div>

      <Button variant="ghost" onClick={onBack}>
        Back to Command Center
      </Button>

      {showWhy && whyView && <WhyThisPlanModal view={whyView} onClose={() => setShowWhy(false)} />}
    </div>
  );
}
