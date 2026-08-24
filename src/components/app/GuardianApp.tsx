"use client";

import { useState } from "react";
import { LoginScreen, type LoginPayload } from "@/components/login/LoginScreen";
import { IntakeScreen } from "@/components/intake/IntakeScreen";
import { GuidedSetupScreen } from "@/components/guided-setup/GuidedSetupScreen";
import { emptyGuidedSetupV2Answers, scheduleToOperationsCalendar, type GuidedSetupV2Answers, type ScheduleAnswerV2 } from "@/lib/model/guided-setup-v2";
import { CompanyNameProvider } from "@/lib/context/CompanyNameContext";
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
import type { OperationSummaryV2 } from "@/lib/model/buildModelInputsFromGuidedSetupV2";
import { formatNaive } from "@/lib/engine/evaluate-scenario";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";
import { formatDisplayDate } from "@/lib/view/constraint-view-model";
import { resolveChosenPlanPrefix } from "@/lib/view/simulation-view-model";
import { withScenarioPresentation } from "@/lib/view/ask-guardian-view-model";
import type {
  EvaluatedScenario,
  Goal,
  GoalSimulationResult,
  LastSimulation,
  MachineUnavailableDisruption,
  OperationalModel,
  Presentation,
  TwinCompleteness,
} from "@/lib/types";

export type CompanySession = {
  companyName: string;
  industry: string;
};

type Phase =
  | "login"
  | "intake"
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
  const [operationsCalendar, setOperationsCalendar] = useState(DEFAULT_OPERATIONS_CALENDAR);
  /** Solo presente cuando el Twin vino de Guided Setup (Checkpoint 7) — null en el path de Excel. */
  const [twinCompleteness, setTwinCompleteness] = useState<TwinCompleteness | null>(null);
  const [operationSummary, setOperationSummary] = useState<OperationSummaryV2 | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [simulationResult, setSimulationResult] = useState<GoalSimulationResult | null>(null);
  const [scenarioPresentation, setScenarioPresentation] = useState<Presentation | null>(null);
  /** Disrupción activa (Checkpoint 6) — un único machine_unavailable a la vez, aplicada sobre `goal`. */
  const [disruption, setDisruption] = useState<MachineUnavailableDisruption | null>(null);
  const [disruptionResourceName, setDisruptionResourceName] = useState<string | null>(null);
  const [lastSimulation, setLastSimulation] = useState<LastSimulation | null>(null);
  const [askGuardianInitialText, setAskGuardianInitialText] = useState("");
  /** Lo que Guardian ya entendió por texto libre en Pantalla 2 (Intake) — Guided Setup arranca desde ahí, nunca pide de nuevo lo ya contado. */
  const [guidedSetupInitialAnswers, setGuidedSetupInitialAnswers] = useState<GuidedSetupV2Answers>(emptyGuidedSetupV2Answers());

  function handleLogin(payload: LoginPayload) {
    setSession({ companyName: payload.companyName, industry: payload.industry });
    setPhase("intake");
  }

  // Envuelto en una función (no un componente nuevo) para poder wrappear el resultado una sola vez con
  // CompanyNameProvider más abajo, sin tocar cada `return` individual del if-chain existente.
  function renderPhase(): React.ReactNode {
  if (phase === "login" || !session) {
    return <LoginScreen onSubmit={handleLogin} />;
  }

  if (phase === "intake") {
    return (
      <IntakeScreen
        companyName={session.companyName}
        industry={session.industry}
        onModelReady={(m, snapshot) => {
          setModel(m);
          setSnapshotAt(snapshot);
          setTwinCompleteness(null);
          setOperationSummary(null);
          setPhase("building");
        }}
        onStartGuidedSetup={(initialAnswers) => {
          setGuidedSetupInitialAnswers(initialAnswers);
          setPhase("guided-setup");
        }}
      />
    );
  }

  if (phase === "guided-setup") {
    return (
      <GuidedSetupScreen
        companyName={session.companyName}
        industry={session.industry}
        initialAnswers={guidedSetupInitialAnswers}
        onBack={() => setPhase("intake")}
        onComplete={(input: RawModelInput, completeness: TwinCompleteness, schedule: ScheduleAnswerV2, summary: OperationSummaryV2) => {
          const m = buildOperationalModel(input);
          setModel(m);
          setSnapshotAt(formatNaive(new Date()));
          setTwinCompleteness(completeness);
          setOperationSummary(summary);
          setOperationsCalendar(scheduleToOperationsCalendar(schedule, DEFAULT_OPERATIONS_CALENDAR.timezone));
          setPhase("building");
        }}
      />
    );
  }

  if (!model || !snapshotAt) return null;

  const orderConstraints = detectConstraints(model, operationsCalendar, snapshotAt);
  const scenarioModel = withScenarioPresentation(model, scenarioPresentation);

  if (phase === "building" || phase === "explore-twin") {
    return (
      <ModelBuildingScreen
        model={model}
        snapshotAt={snapshotAt}
        calendar={operationsCalendar}
        skipAnimation={phase === "explore-twin"}
        activeDisruption={disruption}
        twinCompleteness={twinCompleteness}
        operationSummary={operationSummary}
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
    const openAskGuardian = (text = "") => {
      setAskGuardianInitialText(text);
      setPhase("ask-guardian");
    };
    function handleNavigate(item: AppShellNavItem) {
      if (item === "command-center") return;
      if (item === "ask-guardian") return openAskGuardian();
      if (item === "operational-twin") return setPhase("explore-twin");
      if (item === "constraints") return setPhase("constraints");
      if (item === "simulations") return setPhase("plans");
    }
    return (
      <AppShell
        companyName={session.companyName}
        activeItem="command-center"
        showConstraints={lastSimulation?.disruptionLabel != null}
        showSimulations={lastSimulation !== null}
        onNavigate={handleNavigate}
      >
        <CommandCenter
          model={model}
          orderConstraints={orderConstraints}
          lastSimulation={lastSimulation}
          operationSummary={operationSummary}
          twinCompleteness={twinCompleteness}
          calendar={operationsCalendar}
          onViewConstraints={() => setPhase("constraints")}
          onExploreTwin={() => setPhase("explore-twin")}
          onAskGuardian={openAskGuardian}
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
        calendar={operationsCalendar}
        activeGoal={goal}
        initialText={askGuardianInitialText}
        operationSummary={operationSummary}
        twinCompleteness={twinCompleteness}
        onGoalReady={(g, newPresentation) => {
          setScenarioPresentation(newPresentation ?? null);
          setGoal(g);
          setSimulationResult(null);
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
    const disruptedModel = applyDisruption(scenarioModel, disruption);
    return (
      <DisruptionScreen
        model={scenarioModel}
        disruptedModel={disruptedModel}
        disruption={disruption}
        resourceName={disruptionResourceName ?? disruption.resourceId}
        goal={goal}
        calendar={operationsCalendar}
        snapshotAt={snapshotAt}
        onReSimulate={() => { setSimulationResult(null); setPhase("simulating"); }}
        onBack={() => setPhase("command-center")}
      />
    );
  }

  if (phase === "simulating" && goal) {
    // Misma pantalla para simulation y resimulation — el único cambio es qué Twin evalúa.
    const activeModel = disruption ? applyDisruption(scenarioModel, disruption) : scenarioModel;
    return (
      <SimulatingScreen
        model={activeModel}
        goal={goal}
        snapshotAt={snapshotAt}
        calendar={operationsCalendar}
        mode={disruption ? "resimulation" : "simulation"}
        disruptionLabel={disruption && disruptionResourceName ? `${disruptionResourceName} no disponible` : undefined}
        onDone={(result) => { setSimulationResult(result); setPhase("plans"); }}
      />
    );
  }

  if (phase === "plans" && goal && simulationResult) {
    const activeModel = disruption ? applyDisruption(scenarioModel, disruption) : scenarioModel;
    const result = simulationResult;
    const disruptionContext =
      disruption && disruptionResourceName
        ? {
            model: scenarioModel,
            disruptedModel: activeModel,
            disruption,
            resourceName: disruptionResourceName,
            beforeResult: simulateGoal(scenarioModel, goal, operationsCalendar, snapshotAt),
          }
        : null;
    return (
      <RecommendedPlansScreen
        result={result}
        model={activeModel}
        calendar={operationsCalendar}
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

  return <CompanyNameProvider value={session?.companyName ?? null}>{renderPhase()}</CompanyNameProvider>;
}
