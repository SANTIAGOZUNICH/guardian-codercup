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
import { askCosmeticKnowledge } from "@/lib/nlu/knowledge-client";
import { classifyOperationalQuery, answerOperationalQuery } from "@/lib/engine/operational-query";
import { detectConstraints } from "@/lib/engine/constraint-detection";
import { resolveOrderPresentation } from "@/lib/model/presentation";
import { extractGramsPerUnit, isUnsureAboutGrams } from "@/lib/engine/presentation-parser";
import type { DataOrigin, Goal, MachineUnavailableDisruption, OperationalModel, OperationsCalendar, Presentation } from "@/lib/types";

const CHIPS = ["¿Llegamos antes?", "Simular un objetivo de producción", "Ver capacidad disponible"];

const EXAMPLE_PLACEHOLDER = "Necesito producir 30.000 shampoos para el viernes.";

const OFF_TOPIC_MESSAGE =
  "Esa pregunta queda fuera de lo que analiza GUARDIAN. Puedo ayudarte con producción, capacidad, procesos y consultas relacionadas con cosmética.";

function errorMessage(kind: "unknown_product" | "missing_quantity" | "missing_deadline", companyName: string): string {
  switch (kind) {
    case "unknown_product":
      return `No encontré ese producto dentro del Modelo Operacional de ${companyName}.`;
    case "missing_quantity":
      return "No pude identificar una cantidad. Probá indicando un número, por ejemplo: 30.000 unidades.";
    case "missing_deadline":
      return "No pude identificar una fecha límite. Probá con \"hoy\", \"mañana\", un día de la semana, o \"la próxima semana\".";
  }
}

function disruptionErrorMessage(kind: "unknown_resource_type"): string {
  switch (kind) {
    case "unknown_resource_type":
      return 'No encontré esa máquina en el Modelo Operacional. Probá nombrando el tipo de recurso, por ejemplo "llenadora".';
  }
}

/** Resolución pendiente de gramos/presentación para un Goal ya identificado (producto/cantidad/fecha), antes de poder simular. */
type PendingGrams =
  | { mode: "ask"; goal: Goal }
  | { mode: "choose"; goal: Goal; candidates: Presentation[] };

export function AskGuardianScreen({
  model,
  companyName,
  snapshotAt,
  calendar,
  activeGoal,
  initialText = "",
  onGoalReady,
  onDisruptionReady,
  onBack,
}: {
  model: OperationalModel;
  companyName: string;
  snapshotAt: string;
  calendar: OperationsCalendar;
  /** Goal ya simulado en esta sesión, si lo hay — habilita interpretar preguntas de disrupción sobre ese objetivo. */
  activeGoal: Goal | null;
  initialText?: string;
  onGoalReady: (goal: Goal, newPresentation?: Presentation) => void;
  onDisruptionReady: (disruption: MachineUnavailableDisruption, resourceName: string) => void;
  onBack: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [selection, setSelection] = useState<{ candidates: DisruptionCandidate[]; unitsUnavailable: number } | null>(null);
  const [aiPending, setAiPending] = useState(false);
  /** Interpretación de la IA a medio confirmar — nunca se aplica sin este paso (Etapa 5). */
  const [aiConfirm, setAiConfirm] = useState<{ interpretedText: string; wasDisruption: boolean } | null>(null);
  /** Goal ya identificado (producto/cantidad/fecha) pero sin gramaje resuelto — ver Product Contract, "Ask Guardian — Goals". */
  const [pendingGrams, setPendingGrams] = useState<PendingGrams | null>(null);
  const [gramsDraft, setGramsDraft] = useState("");
  const [gramsUnsure, setGramsUnsure] = useState(false);
  /** Respuesta de conocimiento cosmético mostrada como mensaje de Guardian — nunca modifica el Twin. */
  const [knowledgeAnswer, setKnowledgeAnswer] = useState<string | null>(null);

  function resetTransientState() {
    setError(null);
    setAiConfirm(null);
    setPendingGrams(null);
    setKnowledgeAnswer(null);
  }

  /** Punto único de entrada para un Goal ya estructurado (producto/cantidad/fecha) — decide si hace falta preguntar gramaje antes de poder simular. */
  function proceedWithGoal(goal: Goal) {
    const resolution = resolveOrderPresentation({ id: "goal-check", client: "—", productId: goal.productId, quantity: goal.quantity, deliveryDate: goal.deadline, priority: "normal" }, model);
    if (resolution.ok) {
      onGoalReady({ ...goal, presentationId: resolution.presentation.id });
      return;
    }
    setSelection(null);
    setKnowledgeAnswer(null);
    if (resolution.reason === "ambiguous") {
      setPendingGrams({ mode: "choose", goal, candidates: resolution.candidates });
    } else {
      setPendingGrams({ mode: "ask", goal });
    }
  }

  function chooseGramsPresentation(goal: Goal, presentation: Presentation) {
    setPendingGrams(null);
    onGoalReady({ ...goal, presentationId: presentation.id });
  }

  function submitGramsAnswer() {
    if (!pendingGrams || pendingGrams.mode !== "ask") return;
    if (isUnsureAboutGrams(gramsDraft)) {
      setGramsUnsure(true);
      return;
    }
    const value = extractGramsPerUnit(gramsDraft);
    if (value === null) return;
    applyGrams(pendingGrams.goal, value, "company_data");
  }

  function applyGrams(goal: Goal, grams: number, source: DataOrigin) {
    const presentation: Presentation = {
      id: `${goal.productId}-${grams}g`,
      productId: goal.productId,
      label: `${grams} g`,
      gramsPerUnit: { value: grams, source },
    };
    setPendingGrams(null);
    setGramsDraft("");
    setGramsUnsure(false);
    onGoalReady({ ...goal, presentationId: presentation.id }, presentation);
  }

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

    const result = parseGoalText(resolvedText, { model, snapshotAt, calendar });
    if (!result.ok) {
      setError(errorMessage(result.error.kind, companyName));
      return;
    }
    proceedWithGoal(result.goal);
  }

  /**
   * Intenta resolver como conocimiento cosmético. `fallback` decide qué
   * mostrar si NO es conocimiento cosmético (y la llamada respondió ok):
   * "off_topic" para el mensaje fijo fuera de alcance, o un mensaje propio
   * cuando quien llama ya tiene uno más específico (ej. "unsupported" — ver
   * tryAiInterpretation, un escenario operacional no soportado hoy es un
   * mensaje más útil que el genérico fuera de alcance).
   */
  async function tryKnowledgeOrOffTopic(rawText: string, fallback: string | "off_topic" = "off_topic") {
    setAiPending(true);
    const result = await askCosmeticKnowledge(rawText);
    setAiPending(false);
    if (!result.ok) {
      setError(AI_UNAVAILABLE_MESSAGE);
      return;
    }
    if (result.response.kind === "cosmetic_knowledge" && result.response.answer) {
      setKnowledgeAnswer(result.response.answer);
      return;
    }
    setError(fallback === "off_topic" ? OFF_TOPIC_MESSAGE : fallback);
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
      // "irrelevant"/"nonsense" significa "no es un objetivo ni una disrupción" —
      // pero puede seguir siendo una pregunta legítima de conocimiento cosmético
      // o, si no, genuinamente fuera de alcance. Nunca se muestra el mensaje
      // genérico de "irrelevante" sin antes chequear esto (categorías 3/4 del
      // Product Contract).
      if (r.status === "irrelevant" || r.status === "nonsense") {
        await tryKnowledgeOrOffTopic(rawText);
        return;
      }
      // "unsupported" también puede ser una pregunta de conocimiento mal
      // clasificada como escenario operacional (ej. "¿con qué activo puedo
      // reemplazar el ácido hialurónico?" — Gemini a veces lo lee como una
      // sustitución de materia prima). Se intenta conocimiento primero; si
      // realmente no es eso, se conserva el mensaje específico de
      // "unsupported" (más útil que el genérico fuera de alcance).
      if (r.status === "unsupported") {
        await tryKnowledgeOrOffTopic(rawText, buildBlockedMessage(r));
        return;
      }
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
    resetTransientState();

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

    const result = parseGoalText(text, { model, snapshotAt, calendar });
    if (result.ok) {
      setError(null);
      setSelection(null);
      proceedWithGoal(result.goal);
      return;
    }

    // Categoría 2 del Product Contract — consultas sobre la operación
    // ("¿cuál es mi cuello de botella?"), respondidas 100% con datos reales
    // del Twin, nunca por el LLM de conocimiento ni por el parser de goals.
    const queryKind = classifyOperationalQuery(text);
    if (queryKind) {
      const orderConstraints = detectConstraints(model, calendar, snapshotAt);
      setKnowledgeAnswer(answerOperationalQuery(queryKind, text, model, orderConstraints, null));
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

  const guardianState = pendingGrams
    ? "listening"
    : selection
      ? "alert"
      : aiPending
        ? "analyzing"
        : focused || text
          ? "listening"
          : "idle";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-tertiary">
          Preguntale a Guardian sobre el futuro
        </p>
        <p className="mt-2 text-sm text-text-secondary">Contame un objetivo o un escenario hipotético de tu operación.</p>
      </div>

      <Guardian
        state={guardianState}
        size={100}
        message={
          selection
            ? buildResourceSelectionMessage(selection.candidates)
            : pendingGrams
              ? `¿Cuántos gramos contiene cada unidad de ${pendingGrams.goal.productName}?`
              : aiPending
                ? "Estoy interpretando lo que escribiste..."
                : undefined
        }
      />

      {pendingGrams ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-md">
          {pendingGrams.mode === "choose" ? (
            <div className="flex flex-wrap justify-center gap-3">
              {pendingGrams.candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => chooseGramsPresentation(pendingGrams.goal, c)}
                  className="glass-panel flex min-w-[120px] flex-col items-center gap-1 rounded-[var(--radius-lg)] p-4 transition-colors hover:border-border-strong"
                >
                  <p className="text-sm font-semibold text-text-primary">{c.label}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="glass-panel flex flex-col gap-3 rounded-[var(--radius-lg)] p-5">
              <div className="flex items-center gap-2">
                <input
                  value={gramsDraft}
                  onChange={(e) => setGramsDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitGramsAnswer();
                    }
                  }}
                  placeholder="Ej: 200"
                  autoComplete="off"
                  className="h-11 flex-1 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 text-sm text-text-primary outline-none placeholder:text-text-disabled"
                />
                <Button type="button" onClick={submitGramsAnswer} disabled={!gramsDraft.trim()}>
                  Confirmar
                </Button>
              </div>
              {gramsUnsure && (
                <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-accent/25 bg-accent-soft/40 p-3">
                  <p className="text-xs text-text-secondary">
                    No hay problema. Podemos usar una presentación de referencia de <span className="text-accent-bright">50 g</span> para
                    obtener una primera estimación y cambiarla después.
                  </p>
                  <Button type="button" onClick={() => applyGrams(pendingGrams.goal, 50, "reference_estimate")}>
                    Usar 50 g como referencia
                  </Button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      ) : aiConfirm ? (
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

        {knowledgeAnswer && (
          <p className="mt-3 whitespace-pre-line rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-4 py-3 text-sm text-text-primary">
            Guardian: {knowledgeAnswer}
          </p>
        )}

        {error && (
          <p className="mt-3 whitespace-pre-line rounded-[var(--radius-sm)] border border-risk-high/30 bg-risk-high-soft px-4 py-3 text-sm text-risk-high">
            Guardian: {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setText(chip === "Simular un objetivo de producción" ? EXAMPLE_PLACEHOLDER : chip)}
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
        Volver al Centro de Operaciones
      </Button>
    </div>
  );
}
