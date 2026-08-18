"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { simulateGoal } from "@/lib/engine/simulation-engine";
import { buildSimulatingSummary } from "@/lib/view/simulation-view-model";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";
import type { Goal, GoalSimulationResult, OperationalModel } from "@/lib/types";

const STEPS = [
  "Evaluando el objetivo operacional...",
  "Chequeando disponibilidad de materiales...",
  "Evaluando configuraciones de recursos...",
  "Identificando cuellos de botella...",
  "Comparando planes viables...",
];

const STEP_DELAY_MS = 380;

/**
 * El cálculo real (simulateGoal) es síncrono y rápido — la animación de
 * abajo es puro ritmo narrativo (2-4s), nunca un "fake loading" de 10s.
 * Los números finales son siempre los reales de `result`, jamás hardcodeados.
 */
export function SimulatingScreen({
  model,
  goal,
  snapshotAt,
  mode = "simulation",
  disruptionLabel,
  onDone,
}: {
  model: OperationalModel;
  goal: Goal;
  snapshotAt: string;
  /** "resimulation" reutiliza esta misma pantalla tras una Operational Disruption — nunca una animación distinta. */
  mode?: "simulation" | "resimulation";
  disruptionLabel?: string;
  onDone: (result: GoalSimulationResult) => void;
}) {
  const result = useMemo(
    () => simulateGoal(model, goal, DEFAULT_OPERATIONS_CALENDAR, snapshotAt),
    [model, goal, snapshotAt],
  );
  const summary = useMemo(() => buildSimulatingSummary(result), [result]);

  const [stepIndex, setStepIndex] = useState(0);
  const done = stepIndex >= STEPS.length;

  useEffect(() => {
    if (stepIndex >= STEPS.length) return;
    const t = setTimeout(() => setStepIndex((s) => s + 1), STEP_DELAY_MS);
    return () => clearTimeout(t);
  }, [stepIndex]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-tertiary">
        {mode === "resimulation" ? "Volviendo a simular futuros posibles" : "Simulando futuros posibles"}
      </p>
      {disruptionLabel && <p className="-mt-4 text-xs text-risk-medium">{disruptionLabel}</p>}

      <Guardian state="simulating" size={110} />

      <div className="flex min-h-[140px] w-full max-w-md flex-col items-center gap-2.5">
        {STEPS.slice(0, stepIndex).map((step, i) => (
          <motion.p
            key={step}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: i === stepIndex - 1 ? 1 : 0.35, y: 0 }}
            transition={{ duration: 0.35 }}
            className="text-sm text-text-secondary"
          >
            {step}
          </motion.p>
        ))}
      </div>

      {done && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-6"
        >
          <p className="text-sm font-medium text-text-primary">
            <span className="text-accent-bright">{summary.evaluated}</span> escenarios evaluados ·{" "}
            <span className="text-accent-bright">{summary.feasible}</span> operacionalmente viables ·{" "}
            <span className="text-accent-bright">{summary.meetDeadline}</span> cumplen el deadline
          </p>
          <Button onClick={() => onDone(result)}>Ver resultados</Button>
        </motion.div>
      )}
    </div>
  );
}
