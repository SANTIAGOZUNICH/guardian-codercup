"use client";

import { useState } from "react";
import { LoginScreen, type LoginPayload } from "@/components/login/LoginScreen";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { EntryChoiceScreen } from "@/components/upload/EntryChoiceScreen";
import { UploadScreen } from "@/components/upload/UploadScreen";
import { GuidedSetupScreen } from "@/components/guided-setup/GuidedSetupScreen";
import { ModelBuildingScreen } from "@/components/model/ModelBuildingScreen";
import { ConstraintScreen } from "@/components/constraint/ConstraintScreen";
import { CommandCenter } from "@/components/command-center/CommandCenter";
import { AppShell, type AppShellNavItem } from "@/components/shell/AppShell";
import { AskGuardianScreen } from "@/components/ask-guardian/AskGuardianScreen";
import { SimulatingScreen } from "@/components/ask-guardian/SimulatingScreen";
import { DisruptionScreen } from "@/components/ask-guardian/DisruptionScreen";
import { RecommendedPlansScreen } from "@/components/ask-guardian/RecommendedPlansScreen";
import { detectConstraints } from "@/lib/engine/constraint-detection";
import { simulateGoal } from "@/lib/engine/simulation-engine";
import { applyDisruption } from "@/lib/engine/disruption";
import { buildOperationalModel, type RawModelInput } from "@/lib/model/buildOperationalModel";
import { formatNaive } from "@/lib/engine/evaluate-scenario";
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
  TwinCompleteness,
} from "@/lib/types";

export type CompanySession = {
  companyName: string;
  industry: string;
};

type Phase =
  | "login"
  | "greeting"
  | "entry-choice"
  | "upload"
  | "guided-setup"
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
  /** Solo presente cuando el Twin vino de Guided Setup (Checkpoint 7) — null en el path de Excel. */
  const [twinCompleteness, setTwinCompleteness] = useState<TwinCompleteness | null>(null);
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
    return <OnboardingScreen companyName={session.companyName} onContinue={() => setPhase("entry-choice")} />;
  }

  if (phase === "entry-choice") {
    return (
      <EntryChoiceScreen
        companyName={session.companyName}
        onChooseUpload={() => setPhase("upload")}
        onChooseGuidedSetup={() => setPhase("guided-setup")}
      />
    );
  }

  if (phase === "upload") {
    return (
      <UploadScreen
        companyName={session.companyName}
        industry={session.industry}
        onModelReady={(m, snapshot) => {
          setModel(m);
          setSnapshotAt(snapshot);
          setTwinCompleteness(null);
          setPhase("building");
        }}
      />
    );
  }

  if (phase === "guided-setup") {
    return (
      <GuidedSetupScreen
        companyName={session.companyName}
        industry={session.industry}
        onBack={() => setPhase("entry-choice")}
        onComplete={(input: RawModelInput, completeness: TwinCompleteness) => {
          const m = buildOperationalModel(input);
          setModel(m);
          setSnapshotAt(formatNaive(new Date()));
          setTwinCompleteness(completeness);
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
        activeDisruption={disruption}
        twinCompleteness={twinCompleteness}
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
    const totalConstraints = orderConstraints.reduce((sum, oc) => sum + oc.constraints.length, 0);
    function handleNavigate(item: AppShellNavItem) {
      if (item === "command-center") return;
      if (item === "ask-guardian") return setPhase("ask-guardian");
      if (item === "operational-twin") return setPhase("explore-twin");
      if (item === "constraints") return setPhase("constraints");
      if (item === "simulations") return setPhase("plans");
    }
    return (
      <AppShell
        companyName={session.companyName}
        activeItem="command-center"
        showConstraints={totalConstraints > 0}
        showSimulations={lastSimulation !== null}
        onNavigate={handleNavigate}
      >
        <CommandCenter
          model={model}
          orderConstraints={orderConstraints}
          lastSimulation={lastSimulation}
          onViewConstraints={() => setPhase("constraints")}
          onExploreTwin={() => setPhase("explore-twin")}
          onAskGuardian={() => setPhase("ask-guardian")}
        />
      </AppShell>
    );
  }

  if (phase === "ask-guardian") {
    return (
      <AskGuardianScreen
        model={model}
        companyName={session.companyName}
        snapshotAt={snapshotAt}
        activeGoal={goal}
        onGoalReady={(g, newPresentation) => {
          if (newPresentation) {
            // El usuario declaró (o aceptó de referencia) un gramaje nuevo durante la conversación —
            // se suma al Twin de la sesión, nunca se pierde ni se pide de nuevo (Product Contract V1).
            setModel((prev) => (prev ? { ...prev, presentations: [...prev.presentations, newPresentation] } : prev));
          }
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
        disruptionLabel={disruption && disruptionResourceName ? `${disruptionResourceName} no disponible` : undefined}
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
            chosenPlanLabel: `Plan ${rankLabel} · ${prefix}`,
            completionLabel: scenario.result.completionAt ? formatDisplayDate(scenario.result.completionAt) : "—",
            disruptionLabel: disruption && disruptionResourceName ? `${disruptionResourceName} no disponible` : null,
            capacityFeasible: scenario.result.capacityFeasible,
            deadlineMet: scenario.result.deadlineMet,
            materialsFeasible: scenario.result.materialsFeasible,
          });
          setPhase("command-center");
        }}
        onBack={() => setPhase("command-center")}
      />
    );
  }

  return null;
}
