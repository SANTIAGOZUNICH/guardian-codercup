"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, ArrowLeft } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { InterpretationCard } from "@/components/nlu/InterpretationCard";
import { parseGoalText } from "@/lib/engine/goal-parser";
import { isDisruptionIntent, parseDisruptionText, type DisruptionCandidate } from "@/lib/engine/disruption-parser";
import { buildResourceSelectionMessage, formatDisruptionCandidateLabel } from "@/lib/view/disruption-view-model";
import { interpretWithAI } from "@/lib/nlu/client";
import { buildBlockedMessage, isBlockedStatus, needsConfirmationCard, AI_UNAVAILABLE_MESSAGE } from "@/lib/nlu/interpretation-view-model";
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
  const [aiPending, setAiPending] = useState(false);
  /** Interpretación de la IA a medio confirmar — nunca se aplica sin este paso (Etapa 5). */
  const [aiConfirm, setAiConfirm] = useState<{ interpretedText: string; wasDisruption: boolean } | null>(null);

  function applyResolvedText(resolvedText: string, wasDisruption: boolean) {
    // Se cierra la card de confirmación en TODOS los casos, incluso si la
    // validación determinística falla después — si no, un texto corregido
    // por la IA que el parser determinístico igual no reconoce (ej. un
    // sinónimo de producto que el Twin no tiene) deja la card visible para
    // siempre, tapando el mensaje de error y sin ninguna forma de avanzar.
    setAiConfirm(null);
    setText(resolvedText);
    if (wasDisruption) {
      if (!activeGoal) {
        setError("Necesito un objetivo activo antes de simular una disrupción. Contame primero qué querés producir.");
        return;
      }
      const result = parseDisruptionText(resolvedText, { model });
      if (!result.ok) {
        setError(disruptionErrorMessage(result.error.kind));
        return;
      }
      if (result.status === "needs_selection") {
        setSelection({ candidates: result.candidates, unitsUnavailable: result.unitsUnavailable });
        return;
      }
      onDisruptionReady(result.disruption, result.resourceName);
      return;
    }

    const result = parseGoalText(resolvedText, { model, snapshotAt, calendar: DEFAULT_OPERATIONS_CALENDAR });
    if (!result.ok) {
      setError(errorMessage(result.error.kind, companyName));
      return;
    }
    setSelection(null);
    onGoalReady(result.goal);
  }

  async function tryAiInterpretation(rawText: string, wasDisruption: boolean) {
    setAiPending(true);
    const ai = await interpretWithAI({ text: rawText, context: "ask_guardian" });
    setAiPending(false);

    if (!ai.ok) {
      setError(AI_UNAVAILABLE_MESSAGE);
      return;
    }
    const r = ai.response;
    if (isBlockedStatus(r.status)) {
      setError(buildBlockedMessage(r));
      return;
    }
    // El pre-chequeo determinístico de intent (isDisruptionIntent) puede
    // fallar sobre texto con errores que la IA sí resuelve (ej. "se ME
    // rompe" no matchea "\bse rompe\b"). Cuando la IA da un intent propio,
    // manda por sobre el pre-chequeo — si no, el texto termina validado
    // contra el parser equivocado (goal en vez de disruption o viceversa)
    // y el usuario ve un error que no tiene nada que ver con lo que pidió.
    const resolvedWasDisruption = r.intent === "machine_unavailable" ? true : r.intent === "production_goal" ? false : wasDisruption;
    if (needsConfirmationCard(r)) {
      setAiConfirm({ interpretedText: r.interpretedText, wasDisruption: resolvedWasDisruption });
      return;
    }
    // status === "understood": la IA no necesitó corregir nada visible, se aplica directo —
    // pero SIEMPRE a través del mismo parser determinístico (validado contra el Twin real).
    applyResolvedText(r.interpretedText, resolvedWasDisruption);
  }

  async function handleSubmit() {
    if (!text.trim()) return;
    setError(null);
    setAiConfirm(null);

    const wasDisruption = isDisruptionIntent(text);

    if (wasDisruption) {
      if (!activeGoal) {
        setError("Necesito un objetivo activo antes de simular una disrupción. Contame primero qué querés producir.");
        return;
      }
      const result = parseDisruptionText(text, { model });
      if (result.ok) {
        setError(null);
        if (result.status === "needs_selection") {
          setSelection({ candidates: result.candidates, unitsUnavailable: result.unitsUnavailable });
          return;
        }
        onDisruptionReady(result.disruption, result.resourceName);
        return;
      }
      await tryAiInterpretation(text, true);
      return;
    }

    const result = parseGoalText(text, { model, snapshotAt, calendar: DEFAULT_OPERATIONS_CALENDAR });
    if (result.ok) {
      setError(null);
      setSelection(null);
      onGoalReady(result.goal);
      return;
    }
    await tryAiInterpretation(text, false);
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
        state={selection ? "alert" : aiPending ? "analyzing" : focused || text ? "listening" : "idle"}
        size={100}
        message={selection ? buildResourceSelectionMessage(selection.candidates) : aiPending ? "Estoy interpretando lo que escribiste..." : undefined}
      />

      {aiConfirm ? (
        <InterpretationCard
          interpretedText={aiConfirm.interpretedText}
          onConfirm={() => applyResolvedText(aiConfirm.interpretedText, aiConfirm.wasDisruption)}
          onEdit={() => {
            setText(aiConfirm.interpretedText);
            setAiConfirm(null);
          }}
        />
      ) : selection ? (
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
            autoComplete="off"
            spellCheck={false}
            disabled={aiPending}
            className="flex-1 resize-none bg-transparent text-[15px] text-text-primary outline-none placeholder:text-text-disabled disabled:opacity-50"
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || aiPending}
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
