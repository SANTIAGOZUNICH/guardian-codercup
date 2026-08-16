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
import { DisruptionScreen } from "@/components/ask-guardian/DisruptionScreen";
import { RecommendedPlansScreen } from "@/components/ask-guardian/RecommendedPlansScreen";
import { detectConstraints } from "@/lib/engine/constraint-detection";
import { simulateGoal } from "@/lib/engine/simulation-engine";
import { applyDisruption } from "@/lib/engine/disruption";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";
import { formatDisplayDate } from "@/lib/view/constraint-view-model";
import { resolveChosenPlanPrefix } from "@/lib/view/simulation-view-model";
import type {
  EvaluatedScenario,
  Goal,
  GoalSimulationResult,
  LastSimulation,
  MachineUnavailableDisruption,
  OperationalModel,
} from "@/lib/types";

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
  | "disruption"
  | "simulating"
  | "plans";

export function GuardianApp() {
  const [session, setSession] = useState<CompanySession | null>(null);
  const [phase, setPhase] = useState<Phase>("login");
  const [model, setModel] = useState<OperationalModel | null>(null);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  /** Disrupción activa (Checkpoint 6) — un único machine_unavailable a la vez, aplicada sobre `goal`. */
  const [disruption, setDisruption] = useState<MachineUnavailableDisruption | null>(null);
  const [disruptionResourceName, setDisruptionResourceName] = useState<string | null>(null);
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
        activeGoal={goal}
        onGoalReady={(g) => {
          setGoal(g);
          // Un Goal nuevo arranca de un Twin limpio — cualquier disrupción anterior queda atrás.
          setDisruption(null);
          setDisruptionResourceName(null);
          setPhase("simulating");
        }}
        onDisruptionReady={(d, name) => {
          setDisruption(d);
          setDisruptionResourceName(name);
          setPhase("disruption");
        }}
        onBack={() => setPhase("command-center")}
      />
    );
  }

  if (phase === "disruption" && goal && disruption) {
    const disruptedModel = applyDisruption(model, disruption);
    return (
      <DisruptionScreen
        model={model}
        disruptedModel={disruptedModel}
        disruption={disruption}
        resourceName={disruptionResourceName ?? disruption.resourceId}
        goal={goal}
        calendar={DEFAULT_OPERATIONS_CALENDAR}
        snapshotAt={snapshotAt}
        onReSimulate={() => setPhase("simulating")}
        onBack={() => setPhase("command-center")}
      />
    );
  }

  if (phase === "simulating" && goal) {
    // Misma pantalla para simulation y resimulation — el único cambio es qué Twin evalúa.
    const activeModel = disruption ? applyDisruption(model, disruption) : model;
    return (
      <SimulatingScreen
        model={activeModel}
        goal={goal}
        snapshotAt={snapshotAt}
        mode={disruption ? "resimulation" : "simulation"}
        disruptionLabel={disruption && disruptionResourceName ? `${disruptionResourceName} unavailable` : undefined}
        onDone={() => setPhase("plans")}
      />
    );
  }

  if (phase === "plans" && goal) {
    // Recalcula (síncrono, barato) en vez de guardar el resultado completo en estado —
    // mismo patrón que orderConstraints arriba.
    const activeModel = disruption ? applyDisruption(model, disruption) : model;
    const result: GoalSimulationResult = simulateGoal(activeModel, goal, DEFAULT_OPERATIONS_CALENDAR, snapshotAt);
    const disruptionContext =
      disruption && disruptionResourceName
        ? {
            model,
            disruptedModel: activeModel,
            disruption,
            resourceName: disruptionResourceName,
            beforeResult: simulateGoal(model, goal, DEFAULT_OPERATIONS_CALENDAR, snapshotAt),
          }
        : null;
    return (
      <RecommendedPlansScreen
        result={result}
        disruptionContext={disruptionContext}
        onChoosePlan={(scenario: EvaluatedScenario) => {
          // Índice dentro de outcome.candidates — el mismo conjunto y orden que ve el usuario en pantalla,
          // no result.ranked completo (que incluye escenarios fuera del outcome mostrado).
          const index = result.outcome.candidates.indexOf(scenario);
          const rankLabel = index === 0 ? "A" : index === 1 ? "B" : "C";
          const prefix = resolveChosenPlanPrefix(result.outcome.kind);
          setLastSimulation({
            goalSummary: `${goal.quantity.toLocaleString("es-AR")} ${goal.productName}`,
            chosenPlanLabel: `${prefix} Plan ${rankLabel}`,
            completionLabel: scenario.result.completionAt ? formatDisplayDate(scenario.result.completionAt) : "—",
            disruptionLabel: disruption && disruptionResourceName ? `${disruptionResourceName} unavailable` : null,
          });
          setPhase("command-center");
        }}
        onBack={() => setPhase("command-center")}
      />
    );
  }

  return null;
}
