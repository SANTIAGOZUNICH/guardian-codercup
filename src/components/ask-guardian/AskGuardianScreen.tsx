"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, ArrowLeft } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { parseGoalText } from "@/lib/engine/goal-parser";
import { isDisruptionIntent, parseDisruptionText, type DisruptionCandidate } from "@/lib/engine/disruption-parser";
import { buildResourceSelectionMessage, formatDisruptionCandidateLabel } from "@/lib/view/disruption-view-model";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";
import type { Goal, MachineUnavailableDisruption, OperationalModel } from "@/lib/types";

const CHIPS = ["Can we deliver earlier?", "Simulate a production goal", "Check available capacity"];

const EXAMPLE_PLACEHOLDER = "Necesito producir 30.000 shampoos para TCL antes del viernes.";

function errorMessage(kind: "unknown_product" | "missing_quantity" | "missing_deadline", companyName: string): string {
  switch (kind) {
    case "unknown_product":
      return `No encontré ese producto dentro del Operational Twin de ${companyName}.`;
    case "missing_quantity":
      return "No pude identificar una cantidad. Probá indicando un número, por ejemplo: 30.000 unidades.";
    case "missing_deadline":
      return "No pude identificar una fecha límite. Probá con \"hoy\", \"mañana\", un día de la semana, o \"la próxima semana\".";
  }
}

function disruptionErrorMessage(kind: "unknown_resource_type"): string {
  switch (kind) {
    case "unknown_resource_type":
      return 'No encontré esa máquina en el Operational Twin. Probá nombrando el tipo de recurso, por ejemplo "llenadora".';
  }
}

export function AskGuardianScreen({
  model,
  companyName,
  snapshotAt,
  activeGoal,
  onGoalReady,
  onDisruptionReady,
  onBack,
}: {
  model: OperationalModel;
  companyName: string;
  snapshotAt: string;
  /** Goal ya simulado en esta sesión, si lo hay — habilita interpretar preguntas de disrupción sobre ese objetivo. */
  activeGoal: Goal | null;
  onGoalReady: (goal: Goal) => void;
  onDisruptionReady: (disruption: MachineUnavailableDisruption, resourceName: string) => void;
  onBack: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [selection, setSelection] = useState<{ candidates: DisruptionCandidate[]; unitsUnavailable: number } | null>(null);

  function handleSubmit() {
    if (!text.trim()) return;

    if (isDisruptionIntent(text)) {
      if (!activeGoal) {
        setError("Necesito un objetivo activo antes de simular una disrupción. Contame primero qué querés producir.");
        return;
      }
      const result = parseDisruptionText(text, { model });
      if (!result.ok) {
        setError(disruptionErrorMessage(result.error.kind));
        return;
      }
      setError(null);
      if (result.status === "needs_selection") {
        setSelection({ candidates: result.candidates, unitsUnavailable: result.unitsUnavailable });
        return;
      }
      onDisruptionReady(result.disruption, result.resourceName);
      return;
    }

    const result = parseGoalText(text, { model, snapshotAt, calendar: DEFAULT_OPERATIONS_CALENDAR });
    if (!result.ok) {
      setError(errorMessage(result.error.kind, companyName));
      return;
    }
    setError(null);
    setSelection(null);
    onGoalReady(result.goal);
  }

  function chooseCandidate(candidate: DisruptionCandidate) {
    if (!selection) return;
    onDisruptionReady(
      { type: "machine_unavailable", resourceId: candidate.resourceId, unitsUnavailable: selection.unitsUnavailable },
      candidate.name,
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-tertiary">
          Ask Guardian About the Future
        </p>
        <p className="mt-2 text-sm text-text-secondary">Describe an operational goal or hypothetical scenario.</p>
      </div>

      <Guardian
        state={selection ? "alert" : focused || text ? "listening" : "idle"}
        size={100}
        message={selection ? buildResourceSelectionMessage(selection.candidates) : undefined}
      />

      {selection ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-wrap justify-center gap-4"
        >
          {selection.candidates.map((candidate) => (
            <button
              key={candidate.resourceId}
              onClick={() => chooseCandidate(candidate)}
              className="glass-panel flex min-w-[160px] flex-col items-center gap-1 rounded-[var(--radius-lg)] p-6 transition-colors hover:border-border-strong"
            >
              <p className="text-sm font-semibold text-text-primary">{candidate.name}</p>
              <p className="text-xs text-text-tertiary">{formatDisruptionCandidateLabel(candidate)}</p>
            </button>
          ))}
        </motion.div>
      ) : (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-xl"
      >
        <div className="glass-panel flex items-end gap-3 rounded-[var(--radius-lg)] p-5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={EXAMPLE_PLACEHOLDER}
            rows={2}
            className="flex-1 resize-none bg-transparent text-[15px] text-text-primary outline-none placeholder:text-text-disabled"
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            aria-label="Enviar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-30"
          >
            <ArrowUp size={18} />
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-[var(--radius-sm)] border border-risk-high/30 bg-risk-high-soft px-4 py-3 text-sm text-risk-high">
            Guardian: {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setText(chip === "Simulate a production goal" ? EXAMPLE_PLACEHOLDER : chip)}
              className="rounded-full border border-border-default bg-white/[0.02] px-4 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:bg-white/[0.05]"
            >
              {chip}
            </button>
          ))}
        </div>
      </motion.div>
      )}

      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft size={15} />
        Back to Command Center
      </Button>
    </div>
  );
}
