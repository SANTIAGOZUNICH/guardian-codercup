"use client";

import { useState } from "react";
import { LoginScreen, type LoginPayload } from "@/components/login/LoginScreen";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { UploadScreen } from "@/components/upload/UploadScreen";
import { ModelBuildingScreen } from "@/components/model/ModelBuildingScreen";
import { ConstraintScreen } from "@/components/constraint/ConstraintScreen";
import { CommandCenter } from "@/components/command-center/CommandCenter";
import { AskGuardianScreen } from "@/components/ask-guardian/AskGuardianScreen";
import { SimulatingScreen } from "@/components/ask-guardian/SimulatingScreen";
import { RecommendedPlansScreen } from "@/components/ask-guardian/RecommendedPlansScreen";
import { detectConstraints } from "@/lib/engine/constraint-detection";
import { simulateGoal } from "@/lib/engine/simulation-engine";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";
import { formatDisplayDate } from "@/lib/view/constraint-view-model";
import type { EvaluatedScenario, Goal, GoalSimulationResult, LastSimulation, OperationalModel } from "@/lib/types";

export type CompanySession = {
  companyName: string;
  industry: string;
};

type Phase =
  | "login"
  | "greeting"
  | "upload"
  | "building"
  | "constraints"
  | "command-center"
  | "explore-twin"
  | "ask-guardian"
  | "simulating"
  | "plans";

export function GuardianApp() {
  const [session, setSession] = useState<CompanySession | null>(null);
  const [phase, setPhase] = useState<Phase>("login");
  const [model, setModel] = useState<OperationalModel | null>(null);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [lastSimulation, setLastSimulation] = useState<LastSimulation | null>(null);

  function handleLogin(payload: LoginPayload) {
    setSession({ companyName: payload.companyName, industry: payload.industry });
    setPhase("greeting");
  }

  if (phase === "login" || !session) {
    return <LoginScreen onSubmit={handleLogin} />;
  }

  if (phase === "greeting") {
    return <OnboardingScreen companyName={session.companyName} onContinue={() => setPhase("upload")} />;
  }

  if (phase === "upload") {
    return (
      <UploadScreen
        companyName={session.companyName}
        industry={session.industry}
        onModelReady={(m, snapshot) => {
          setModel(m);
          setSnapshotAt(snapshot);
          setPhase("building");
        }}
      />
    );
  }

  if (!model || !snapshotAt) return null;

  const orderConstraints = detectConstraints(model, DEFAULT_OPERATIONS_CALENDAR, snapshotAt);

  if (phase === "building" || phase === "explore-twin") {
    return (
      <ModelBuildingScreen
        model={model}
        snapshotAt={snapshotAt}
        skipAnimation={phase === "explore-twin"}
        onViewConstraints={() => setPhase("constraints")}
        onGoToCommandCenter={() => setPhase("command-center")}
      />
    );
  }

  if (phase === "constraints") {
    return (
      <ConstraintScreen
        model={model}
        orderConstraints={orderConstraints}
        onGoToCommandCenter={() => setPhase("command-center")}
      />
    );
  }

  if (phase === "command-center") {
    return (
      <CommandCenter
        model={model}
        orderConstraints={orderConstraints}
        lastSimulation={lastSimulation}
        onViewConstraints={() => setPhase("constraints")}
        onExploreTwin={() => setPhase("explore-twin")}
        onAskGuardian={() => setPhase("ask-guardian")}
      />
    );
  }

  if (phase === "ask-guardian") {
    return (
      <AskGuardianScreen
        model={model}
        companyName={session.companyName}
        snapshotAt={snapshotAt}
        onGoalReady={(g) => {
          setGoal(g);
          setPhase("simulating");
        }}
        onBack={() => setPhase("command-center")}
      />
    );
  }

  if (phase === "simulating" && goal) {
    return (
      <SimulatingScreen
        model={model}
        goal={goal}
        snapshotAt={snapshotAt}
        onDone={() => setPhase("plans")}
      />
    );
  }

  if (phase === "plans" && goal) {
    // Recalcula (síncrono, barato) en vez de guardar el resultado completo en estado —
    // mismo patrón que orderConstraints arriba.
    const result: GoalSimulationResult = simulateGoal(model, goal, DEFAULT_OPERATIONS_CALENDAR, snapshotAt);
    return (
      <RecommendedPlansScreen
        result={result}
        onChoosePlan={(scenario: EvaluatedScenario) => {
          setLastSimulation({
            goalSummary: `${goal.quantity.toLocaleString("es-AR")} ${goal.productName}`,
            chosenPlanLabel: `Plan ${result.ranked.indexOf(scenario) === 0 ? "A" : result.ranked.indexOf(scenario) === 1 ? "B" : "C"}`,
            completionLabel: scenario.result.completionAt ? formatDisplayDate(scenario.result.completionAt) : "—",
          });
          setPhase("command-center");
        }}
        onBack={() => setPhase("command-center")}
      />
    );
  }

  return null;
}
