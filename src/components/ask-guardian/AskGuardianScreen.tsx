"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, CircleHelp, Pencil, Send, Sparkles } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { GuardianLogo } from "@/components/ui/GuardianLogo";
import { Button } from "@/components/ui/Button";
import { InterpretationCard } from "@/components/nlu/InterpretationCard";
import { parseGoalText } from "@/lib/engine/goal-parser";
import { isDisruptionIntent, parseDisruptionText, type DisruptionCandidate } from "@/lib/engine/disruption-parser";
import { formatDisruptionCandidateLabel } from "@/lib/view/disruption-view-model";
import { interpretWithAI } from "@/lib/nlu/client";
import { buildBlockedMessage, isBlockedStatus, needsConfirmationCard, AI_UNAVAILABLE_MESSAGE } from "@/lib/nlu/interpretation-view-model";
import { askCosmeticKnowledge } from "@/lib/nlu/knowledge-client";
import { classifyOperationalQuery, answerOperationalQuery } from "@/lib/engine/operational-query";
import { detectConstraints } from "@/lib/engine/constraint-detection";
import { resolveOrderPresentation } from "@/lib/model/presentation";
import { extractExplicitGramsPerUnit, extractGramsPerUnit, isUnsureAboutGrams } from "@/lib/engine/presentation-parser";
import type { OperationSummaryV2 } from "@/lib/model/buildModelInputsFromGuidedSetupV2";
import { buildAskModelContext, buildSupportedAskExamples, buildUnderstoodFields, correctGoalQuantity } from "@/lib/view/ask-guardian-view-model";
import type { DataOrigin, Goal, MachineUnavailableDisruption, OperationalModel, OperationsCalendar, Presentation, TwinCompleteness } from "@/lib/types";

const PLACEHOLDER = "¿Qué querés saber de tu operación?";
const OFF_TOPIC_MESSAGE = "Esa pregunta queda fuera de lo que analiza GUARDIAN. Puedo ayudarte con producción, capacidad, procesos y consultas relacionadas con cosmética.";

type PendingGrams = { mode: "ask"; goal: Goal } | { mode: "choose"; goal: Goal; candidates: Presentation[] };
type PreparedSimulation = { goal: Goal; presentation: Presentation; newPresentation: Presentation | null };

function goalError(kind: "unknown_product" | "missing_quantity" | "missing_deadline", companyName: string) {
  if (kind === "unknown_product") return `No encontré ese producto dentro del Modelo Operacional de ${companyName}.`;
  if (kind === "missing_quantity") return "No pude identificar una cantidad. Probá indicando qué querés producir y cuántas unidades.";
  return "No pude identificar una fecha límite. Probá con hoy, mañana, un día de la semana o la próxima semana.";
}

function createPresentation(goal: Goal, grams: number, source: DataOrigin): Presentation {
  return { id: `${goal.productId}-${grams}g`, productId: goal.productId, label: `${grams} g`, gramsPerUnit: { value: grams, source } };
}

export function AskGuardianScreen({ model, companyName, snapshotAt, calendar, activeGoal, initialText = "", featuredExample, operationSummary, twinCompleteness, onGoalReady, onDisruptionReady, onBack }: {
  model: OperationalModel;
  companyName: string;
  snapshotAt: string;
  calendar: OperationsCalendar;
  activeGoal: Goal | null;
  initialText?: string;
  featuredExample?: string;
  operationSummary: OperationSummaryV2 | null;
  twinCompleteness: TwinCompleteness | null;
  onGoalReady: (goal: Goal, newPresentation?: Presentation) => void;
  onDisruptionReady: (disruption: MachineUnavailableDisruption, resourceName: string) => void;
  onBack: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [aiPending, setAiPending] = useState(false);
  const [aiConfirm, setAiConfirm] = useState<{ interpretedText: string; wasDisruption: boolean } | null>(null);
  const [pendingGrams, setPendingGrams] = useState<PendingGrams | null>(null);
  const [gramsDraft, setGramsDraft] = useState("");
  const [gramsUnsure, setGramsUnsure] = useState(false);
  const [prepared, setPrepared] = useState<PreparedSimulation | null>(null);
  const [editingQuantity, setEditingQuantity] = useState(false);
  const [quantityDraft, setQuantityDraft] = useState("");
  const [selection, setSelection] = useState<{ candidates: DisruptionCandidate[]; unitsUnavailable: number } | null>(null);

  const contextItems = buildAskModelContext(model, operationSummary, twinCompleteness, calendar);
  const examples = buildSupportedAskExamples(model, featuredExample);

  function resetResult() {
    setError(null); setAnswer(null); setAiConfirm(null); setPendingGrams(null); setPrepared(null); setSelection(null);
  }

  function prepareWithPresentation(goal: Goal, presentation: Presentation, isNew: boolean) {
    setPendingGrams(null); setPrepared({ goal: { ...goal, presentationId: presentation.id }, presentation, newPresentation: isNew ? presentation : null });
    setQuantityDraft(String(goal.quantity)); setEditingQuantity(false); setGramsDraft(""); setGramsUnsure(false);
  }

  function proceedWithGoal(goal: Goal) {
    const explicitGrams = extractExplicitGramsPerUnit(goal.rawText);
    if (explicitGrams !== null) {
      prepareWithPresentation(goal, createPresentation(goal, explicitGrams, "company_data"), true);
      return;
    }
    const resolution = resolveOrderPresentation({ id: "goal-check", client: "—", productId: goal.productId, quantity: goal.quantity, deliveryDate: goal.deadline, priority: "normal" }, model);
    if (resolution.ok) {
      prepareWithPresentation(goal, resolution.presentation, false);
      return;
    }
    setPendingGrams(resolution.reason === "ambiguous" ? { mode: "choose", goal, candidates: resolution.candidates } : { mode: "ask", goal });
  }

  function applyGrams(goal: Goal, grams: number, source: DataOrigin) {
    prepareWithPresentation(goal, createPresentation(goal, grams, source), true);
  }

  function confirmGrams() {
    if (!pendingGrams || pendingGrams.mode !== "ask") return;
    if (isUnsureAboutGrams(gramsDraft)) { setGramsUnsure(true); return; }
    const grams = extractGramsPerUnit(gramsDraft);
    if (grams !== null) applyGrams(pendingGrams.goal, grams, "company_data");
  }

  function applyResolvedText(resolvedText: string, wasDisruption: boolean) {
    setAiConfirm(null); setText(resolvedText);
    if (wasDisruption) {
      if (!activeGoal) { setError("Necesito un objetivo activo antes de simular una disrupción. Contame primero qué querés producir."); return; }
      const result = parseDisruptionText(resolvedText, { model });
      if (!result.ok) { setError('No encontré esa máquina en el Modelo Operacional. Probá nombrando el recurso exacto.'); return; }
      if (result.status === "needs_selection") { setSelection({ candidates: result.candidates, unitsUnavailable: result.unitsUnavailable }); return; }
      onDisruptionReady(result.disruption, result.resourceName); return;
    }
    const result = parseGoalText(resolvedText, { model, snapshotAt, calendar });
    if (!result.ok) { setError(goalError(result.error.kind, companyName)); return; }
    proceedWithGoal(result.goal);
  }

  async function tryKnowledge(rawText: string, fallback: string | "off_topic" = "off_topic") {
    setAiPending(true); const result = await askCosmeticKnowledge(rawText); setAiPending(false);
    if (!result.ok) { setError(AI_UNAVAILABLE_MESSAGE); return; }
    if (result.response.kind === "cosmetic_knowledge" && result.response.answer) { setAnswer(result.response.answer); return; }
    setError(fallback === "off_topic" ? OFF_TOPIC_MESSAGE : fallback);
  }

  async function tryAi(rawText: string, wasDisruption: boolean) {
    setAiPending(true); const ai = await interpretWithAI({ text: rawText, context: "ask_guardian" }); setAiPending(false);
    if (!ai.ok) { setError(AI_UNAVAILABLE_MESSAGE); return; }
    const response = ai.response;
    if (isBlockedStatus(response.status)) {
      if (response.status === "irrelevant" || response.status === "nonsense") { await tryKnowledge(rawText); return; }
      if (response.status === "unsupported") { await tryKnowledge(rawText, buildBlockedMessage(response)); return; }
      setError(buildBlockedMessage(response)); return;
    }
    const resolvedDisruption = response.intent === "machine_unavailable" ? true : response.intent === "production_goal" ? false : wasDisruption;
    if (needsConfirmationCard(response)) { setAiConfirm({ interpretedText: response.interpretedText, wasDisruption: resolvedDisruption }); return; }
    applyResolvedText(response.interpretedText, resolvedDisruption);
  }

  async function submit() {
    const raw = text.trim(); if (!raw) return;
    resetResult();
    const disruptionIntent = isDisruptionIntent(raw);
    if (disruptionIntent) {
      if (!activeGoal) { setError("Necesito un objetivo activo antes de simular una disrupción. Contame primero qué querés producir."); return; }
      const result = parseDisruptionText(raw, { model });
      if (result.ok) {
        if (result.status === "needs_selection") setSelection({ candidates: result.candidates, unitsUnavailable: result.unitsUnavailable });
        else onDisruptionReady(result.disruption, result.resourceName);
        return;
      }
      await tryAi(raw, true); return;
    }
    const goalResult = parseGoalText(raw, { model, snapshotAt, calendar });
    if (goalResult.ok) { proceedWithGoal(goalResult.goal); return; }
    if (goalResult.error.kind === "missing_deadline") { setError(goalError("missing_deadline", companyName)); return; }
    const queryKind = classifyOperationalQuery(raw);
    if (queryKind) { setAnswer(answerOperationalQuery(queryKind, raw, model, detectConstraints(model, calendar, snapshotAt), twinCompleteness, operationSummary?.staffCount ?? null)); return; }
    await tryAi(raw, false);
  }

  function chooseCandidate(candidate: DisruptionCandidate) {
    if (!selection) return;
    onDisruptionReady({ type: "machine_unavailable", resourceId: candidate.resourceId, unitsUnavailable: selection.unitsUnavailable }, candidate.name);
  }

  function saveQuantity() {
    if (!prepared) return;
    const quantity = Number(quantityDraft.replace(/[.]/g, "").replace(",", "."));
    const corrected = correctGoalQuantity(prepared.goal, quantity);
    setPrepared({ ...prepared, goal: corrected }); setQuantityDraft(String(corrected.quantity)); setEditingQuantity(false);
  }

  const guardianState = aiPending ? "analyzing" : pendingGrams || focused || text ? "listening" : prepared ? "success" : "idle";
  const understood = prepared ? buildUnderstoodFields(prepared.goal, prepared.presentation) : pendingGrams ? buildUnderstoodFields(pendingGrams.goal, null) : [];

  return <div className="min-h-screen bg-bg-base text-text-primary">
    <header className="flex items-center justify-between border-b border-border-subtle px-5 py-4 sm:px-8"><GuardianLogo className="h-8 w-auto" /><div className="rounded-lg border border-border-default px-4 py-2 text-sm font-medium">{companyName}</div><button type="button" onClick={onBack} className="text-sm text-text-secondary hover:text-text-primary">Centro de Operaciones</button></header>
    <main className="mx-auto grid w-full max-w-[1480px] gap-5 px-5 py-6 lg:grid-cols-[220px_minmax(0,1fr)_290px] lg:px-8">
      <aside className="order-2 space-y-4 lg:order-1">
        <Guardian variant="asset" state={guardianState} size={180} message={aiPending ? "Entendiendo tu objetivo..." : pendingGrams ? "Me falta un dato para preparar la simulación." : undefined} />
        <div className="rounded-xl border border-border-subtle bg-white/[0.015] p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-bright">Ejemplos rápidos</p><div className="mt-3 space-y-2">{examples.map((example) => <button key={example} type="button" onClick={() => { resetResult(); setText(example); }} className="flex w-full items-center justify-between gap-2 rounded-lg border border-border-subtle px-3 py-2.5 text-left text-xs text-text-secondary hover:border-accent/40 hover:text-text-primary"><span>{example}</span><ArrowRight size={13} /></button>)}</div></div>
      </aside>

      <section className="order-1 min-w-0 lg:order-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-bright">Simulador conversacional</p><h1 className="mt-1 text-3xl font-semibold">Ask Guardian</h1><p className="mt-1 text-sm text-text-secondary">Preguntá sobre tu operación o prepará un escenario antes de simularlo.</p>
        <div className={`mt-5 rounded-xl border bg-white/[0.02] p-4 transition-shadow ${focused ? "border-accent shadow-[0_0_28px_var(--accent-soft)]" : "border-border-default"}`}><label className="sr-only" htmlFor="ask-input">¿Qué querés saber de tu operación?</label><textarea id="ask-input" value={text} onChange={(event) => setText(event.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder={PLACEHOLDER} rows={3} disabled={aiPending} className="w-full resize-none bg-transparent text-base outline-none placeholder:text-text-disabled disabled:opacity-60" /><div className="flex justify-end"><button type="button" onClick={() => void submit()} disabled={!text.trim() || aiPending} aria-label="Enviar consulta" className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white disabled:opacity-30"><Send size={17} /></button></div></div>
        {aiPending ? <p className="mt-3 text-sm text-accent-bright">Entendiendo tu objetivo...</p> : null}

        {pendingGrams ? <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-xl border border-accent/40 bg-accent-soft/30 p-5">
          <div className="flex items-center gap-2 text-accent-bright"><CircleHelp size={18} /><h2 className="font-semibold">Me falta un dato para simular esto</h2></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">{understood.map((field) => <div key={field.key} className="rounded-lg border border-border-subtle bg-bg-base/40 p-3"><p className="text-xs text-text-tertiary">{field.label}</p><p className="mt-1 text-sm font-medium">{field.value}</p></div>)}</div>
          {pendingGrams.mode === "choose" ? <div className="mt-4 flex flex-wrap gap-2">{pendingGrams.candidates.map((candidate) => <button key={candidate.id} type="button" onClick={() => prepareWithPresentation(pendingGrams.goal, candidate, false)} className="rounded-lg border border-accent/40 px-4 py-2 text-sm hover:bg-accent-soft">{candidate.label}</button>)}</div> : <div className="mt-4"><p className="text-sm font-medium">¿Cuántos gramos tiene cada unidad?</p><p className="mt-1 text-xs text-text-secondary">Necesito este dato para convertir la cantidad del escenario y calcular correctamente la producción.</p><div className="mt-3 flex max-w-md gap-2"><input aria-label="Gramaje por unidad" value={gramsDraft} onChange={(event) => setGramsDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); confirmGrams(); } }} placeholder="Ej: 200 g" className="min-w-0 flex-1 rounded-lg border border-border-default bg-bg-base px-3 py-2 text-sm outline-none focus:border-accent" /><Button type="button" onClick={confirmGrams} disabled={!gramsDraft.trim()}>Confirmar dato</Button></div>{gramsUnsure ? <div className="mt-3 rounded-lg border border-border-default p-3 text-xs text-text-secondary">Podés usar 50 g como referencia para esta primera estimación. <button type="button" onClick={() => applyGrams(pendingGrams.goal, 50, "reference_estimate")} className="ml-1 text-accent-bright">Usar referencia</button></div> : null}</div>}
        </motion.div> : null}

        {prepared ? <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-xl border border-risk-low/45 bg-risk-low-soft/30 p-5"><div className="flex items-center gap-2 text-risk-low"><Check size={19} /><h2 className="text-lg font-semibold">Entendí esto</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{buildUnderstoodFields(prepared.goal, prepared.presentation).map((field) => <div key={field.key} className="rounded-lg border border-border-subtle bg-bg-base/35 p-3"><p className="text-xs text-text-tertiary">{field.label}</p>{field.key === "quantity" && editingQuantity ? <div className="mt-1 flex gap-2"><input aria-label="Editar cantidad" value={quantityDraft} onChange={(event) => setQuantityDraft(event.target.value)} className="min-w-0 flex-1 rounded border border-border-default bg-bg-base px-2 py-1 text-sm" /><button type="button" onClick={saveQuantity} className="text-xs text-risk-low">Guardar</button></div> : <div className="mt-1 flex items-center justify-between gap-2"><p className="text-sm font-medium">{field.value}</p>{field.key === "quantity" ? <button type="button" aria-label="Editar cantidad" onClick={() => setEditingQuantity(true)} className="text-text-tertiary hover:text-text-primary"><Pencil size={14} /></button> : null}</div>}</div>)}</div><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={() => { setText(prepared.goal.rawText); setPrepared(null); }} className="text-sm text-text-secondary hover:text-text-primary">Editar consulta</button><Button type="button" onClick={() => onGoalReady(prepared.goal, prepared.newPresentation ?? undefined)} className="gap-2"><Sparkles size={16} />Simular escenario</Button></div></motion.div> : null}

        {answer ? <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-xl border border-accent/30 bg-accent-soft/20 p-5"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent-bright">Guardian responde</p><p className="mt-2 whitespace-pre-line text-sm text-text-primary">{answer}</p></motion.div> : null}
        {error ? <div className="mt-5 rounded-xl border border-risk-high/30 bg-risk-high-soft p-4 text-sm text-risk-high"><p>{error}</p><p className="mt-2 text-xs">Tu consulta sigue en el campo de arriba para que puedas corregirla.</p></div> : null}
        {aiConfirm ? <div className="mt-5"><InterpretationCard interpretedText={aiConfirm.interpretedText} onConfirm={() => applyResolvedText(aiConfirm.interpretedText, aiConfirm.wasDisruption)} onEdit={() => { setText(aiConfirm.interpretedText); setAiConfirm(null); }} /></div> : null}
        {selection ? <div className="mt-5 flex flex-wrap gap-3">{selection.candidates.map((candidate) => <button key={candidate.resourceId} type="button" onClick={() => chooseCandidate(candidate)} className="rounded-xl border border-border-default p-4 text-left hover:border-accent/40"><p className="text-sm font-semibold">{candidate.name}</p><p className="text-xs text-text-tertiary">{formatDisruptionCandidateLabel(candidate)}</p></button>)}</div> : null}
      </section>

      <aside className="order-3 rounded-xl border border-border-subtle bg-white/[0.015] p-5 lg:self-start"><h2 className="font-semibold">Contexto de tu modelo</h2><p className="mt-1 text-xs text-text-tertiary">Datos disponibles para interpretar y simular.</p><div className="mt-4 space-y-3">{contextItems.map((item) => <div key={item.label} className="flex items-start justify-between gap-3 border-b border-border-subtle pb-3 last:border-0"><p className="text-xs text-text-tertiary">{item.label}</p><p className={`text-right text-xs font-medium ${item.tone === "neutral" ? "text-text-secondary" : "text-text-primary"}`}>{item.value}</p></div>)}</div>{twinCompleteness?.missing.unsupportedProcesses.length ? <div className="mt-4 rounded-lg border border-border-default p-3"><p className="text-xs text-text-tertiary">Procesos declarados no simulables</p><p className="mt-1 text-xs text-text-secondary">{twinCompleteness.missing.unsupportedProcesses.join(", ")}</p></div> : null}</aside>
    </main>
    <footer className="border-t border-border-subtle px-5 py-4 sm:px-8"><button type="button" onClick={onBack} className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"><ArrowLeft size={15} />Volver al Centro de Operaciones</button></footer>
  </div>;
}
