"use client";

import { useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Plus, X } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { ProductsStepScreen } from "@/components/guided-setup/GuidedSetupProductsStep";
import { ProcessesStepScreen } from "@/components/guided-setup/GuidedSetupProcessesStep";
import { EquipmentStepScreen } from "@/components/guided-setup/GuidedSetupEquipmentStep";
import { CapacitiesStepScreen } from "@/components/guided-setup/GuidedSetupCapacitiesStep";
import {
  addEquipmentToProcess,
  emptyGuidedSetupV2Answers,
  formatScheduleProposal,
  remapEquipmentProcess,
  removeCapacityVariant as removeCapacityVariantV2,
  removeEquipment,
  renameEquipmentEntry,
  scheduleMentionToProposal,
  setCapacityVariant as setCapacityVariantV2,
  setEquipmentCapacity,
  suggestedSchedule,
  totalResolvedCount,
  GUIDED_SETUP_BLOCKS,
  type EquipmentEntryV2,
  type GuidedSetupBlock,
  type GuidedSetupV2Answers,
} from "@/lib/model/guided-setup-v2";
import { INTAKE_STEP_NUMBER, TOTAL_ONBOARDING_STEPS } from "@/lib/model/guided-setup-progress";
import { buildModelInputsFromGuidedSetupV2 } from "@/lib/model/buildModelInputsFromGuidedSetupV2";
import { normalizeProcessName } from "@/lib/model/buildModelInputsFromGuidedSetup";
import { findReferenceCandidates, resolveReferenceValue } from "@/lib/engine/reference-catalog";
import { REFERENCE_CATALOG } from "@/data/reference-catalog";
import type { RawModelInput } from "@/lib/model/buildOperationalModel";
import type { ReferenceCatalogEntry, ResourceProcess, TwinCompleteness } from "@/lib/types";

/**
 * ============================================================================
 * Guided Setup V2 (Checkpoint 9B.3)
 * ============================================================================
 * Dos modos, MISMO estado (`GuidedSetupV2Answers`) y MISMO motor:
 * - NOVICE: responde bloque por bloque, con "No lo sé" -> Reference Catalog.
 * - ADVANCED: describe toda la operación en un párrafo (arriba de todo) — la
 *   IA extrae lo que pueda y marca los bloques resueltos automáticamente;
 *   el usuario avanzado nunca es forzado a repetir lo que ya contó.
 * Reusa los mismos primitivos visuales que V1 (glass-panel, Button, chips) —
 * cero rediseño visual en este checkpoint.
 */

export function useAutofillSafeName(): string {
  return `gsv2-${useId().replace(/[:]/g, "")}`;
}

export const BATCH_PROCESS: ResourceProcess = "Elaboración"; // única etapa por lote soportada en este vertical slice

type StepV2 = "products" | "processes" | "equipment" | "capacities" | "batchTimes" | "staffing" | "schedule" | "materials" | "review";
const STEPS_V2: StepV2[] = ["products", "processes", "equipment", "capacities", "batchTimes", "staffing", "schedule", "materials", "review"];
const BLOCK_BY_STEP: Partial<Record<StepV2, GuidedSetupBlock>> = {
  products: "products",
  processes: "flow",
  equipment: "equipment",
  capacities: "capacities",
  batchTimes: "batchTimes",
  staffing: "staffing",
  schedule: "schedule",
};

export function EntryChip({ label, sublabel, onRemove }: { label: string; sublabel?: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border-default bg-white/[0.02] py-1.5 pl-3 pr-1.5 text-sm text-text-primary">
      {label}
      {sublabel && <span className="text-xs text-text-tertiary">{sublabel}</span>}
      <button type="button" onClick={onRemove} aria-label={`Quitar ${label}`} className="rounded-full p-0.5 text-text-tertiary hover:text-text-primary">
        <X size={12} />
      </button>
    </span>
  );
}

export function ResolvedBadge() {
  return <span className="rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-bright">Ya tengo esto</span>;
}

// ---------------------------------------------------------------------------
// Nota: el step "Equipos" (Pantalla 5) es un componente dedicado —
// `GuidedSetupEquipmentStep.tsx`, mismo patrón que Productos/Procesos. Agrupa
// por `answers.processesRaw` (Pantalla 4 es la fuente de verdad, nunca un
// catálogo fijo de 3 procesos) — ver `addEquipment`/`renameEquipment` más abajo.
// ---------------------------------------------------------------------------
// Reference offer — "No lo sé" -> catálogo, aceptación explícita.
// ---------------------------------------------------------------------------
export function ReferenceOffer({ candidate, onAccept }: { candidate: ReferenceCatalogEntry; onAccept: (value: number) => void }) {
  const value = resolveReferenceValue(candidate, "midpoint");
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius-sm)] border border-accent/25 bg-accent-soft/40 p-3">
      <p className="text-xs text-text-secondary">
        No hay problema. Puedo usar una referencia inicial para <span className="text-text-primary">{candidate.category}</span>: ≈{" "}
        <span className="text-accent-bright">
          {value} {candidate.unit}
        </span>
        . Después la reemplazamos por tu dato real.
      </p>
      <div className="flex gap-2">
        <Button type="button" onClick={() => onAccept(value)}>
          Usar referencia
        </Button>
      </div>
    </div>
  );
}

/**
 * Precisión progresiva (Product Contract): una vez que el equipo tiene una
 * velocidad general, se pregunta si eso cambia según producto/presentación
 * — SOLO si el usuario dice que sí se muestra el formulario de valores
 * específicos, nunca de entrada (progressive disclosure). "No" o no
 * responder nunca bloquea nada: la velocidad general ya es un dato válido.
 */
export function CapacityVariantsBlock({
  equipment,
  productsRaw,
  onSetVariant,
  onRemoveVariant,
}: {
  equipment: EquipmentEntryV2;
  productsRaw: string[];
  onSetVariant: (equipmentId: string, productName: string, value: number) => void;
  onRemoveVariant: (equipmentId: string, productName: string) => void;
}) {
  const [asked, setAsked] = useState(equipment.capacityVariants.length > 0);
  const [product, setProduct] = useState(productsRaw[0] ?? "");
  const [value, setValue] = useState("");
  const fieldName = useAutofillSafeName();

  if (productsRaw.length === 0) return null;

  if (!asked && equipment.capacityVariants.length === 0) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <p className="text-xs text-text-tertiary">¿Esa velocidad cambia mucho según el producto o la presentación?</p>
        <Button variant="ghost" type="button" onClick={() => setAsked(true)}>
          Sí, agregar valores específicos
        </Button>
        <span className="text-xs text-text-disabled">No cambia → usar como referencia general.</span>
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex flex-col gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-white/[0.015] p-2">
      <div className="flex flex-wrap gap-2">
        {equipment.capacityVariants.map((v) => (
          <EntryChip
            key={v.productName}
            label={v.productName}
            sublabel={`${v.value.value} ${equipment.capacityUnit || "u/h"}`}
            onRemove={() => onRemoveVariant(equipment.id, v.productName)}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          className="h-9 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-xs text-text-primary outline-none"
        >
          {productsRaw.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          name={fieldName}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="u/h"
          autoComplete="off"
          className="h-9 w-20 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-xs text-text-primary outline-none placeholder:text-text-disabled"
        />
        <Button
          variant="ghost"
          type="button"
          onClick={() => {
            const v = Number(value);
            if (!product || !Number.isFinite(v) || v <= 0) return;
            onSetVariant(equipment.id, product, v);
            setValue("");
          }}
        >
          Agregar
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nota: el step "Capacidades" (Pantalla 6) es un componente dedicado —
// `GuidedSetupCapacitiesStep.tsx`, mismo patrón que Productos/Procesos/Equipos.
// Adapta la unidad al tipo de proceso (kg/lote para Elaboración, u/h para
// procesos continuos) en vez de asumir u/h para todo — ver ese archivo.
// ---------------------------------------------------------------------------
// Nota: el step dedicado "Presentaciones" (gramos por unidad durante el
// setup) se eliminó del flujo — gramsPerUnit pertenece al pedido/escenario,
// no a la definición genérica de productos (ver sección 7/18 del Master
// Context). El dato sigue existiendo en el dominio (`answers.presentations`,
// poblado por `applyNluExtraction` cuando el usuario lo menciona en texto
// libre) y Ask Guardian lo sigue pidiendo antes de simular si hace falta.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Batch times — solo para el proceso de tipo lote (Elaboración).
// ---------------------------------------------------------------------------
function BatchTimesStep({
  hasBatchProcess,
  batchSize,
  hoursPerBatch,
  onSet,
}: {
  hasBatchProcess: boolean;
  batchSize: { value: number; source: string } | null;
  hoursPerBatch: { value: number; source: string } | null;
  onSet: (field: "batchSize" | "hoursPerBatch", value: number, source: "company_data" | "reference_estimate") => void;
}) {
  const [amountDraft, setAmountDraft] = useState("");
  const [hoursDraft, setHoursDraft] = useState("");
  const [declinedAmount, setDeclinedAmount] = useState(false);
  const [declinedHours, setDeclinedHours] = useState(false);

  if (!hasBatchProcess) {
    return <p className="text-sm text-text-secondary">Tu operación no tiene procesos por tanda declarados todavía — podés continuar.</p>;
  }

  const amountCandidates = findReferenceCandidates(REFERENCE_CATALOG, { category: "reactor", process: BATCH_PROCESS, parameter: "batchSize" });
  const hoursCandidates = findReferenceCandidates(REFERENCE_CATALOG, { category: "reactor", process: BATCH_PROCESS, parameter: "hoursPerBatch" });

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-text-secondary">¿Sabés cuánto elaboran aproximadamente por tanda? ¿Y cuánto tarda una tanda?</p>

      <div className="rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary">Cantidad por tanda (en kg)</p>
        {batchSize ? (
          <p className="mt-1 text-sm text-text-primary">
            {batchSize.value} kg <span className="text-xs text-text-tertiary">({batchSize.source === "company_data" ? "tu dato" : "referencia"})</span>
          </p>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <input value={amountDraft} onChange={(e) => setAmountDraft(e.target.value)} placeholder="kg" autoComplete="off" className="h-9 w-28 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled" />
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                const v = Number(amountDraft);
                if (!Number.isFinite(v) || v <= 0) return;
                onSet("batchSize", v, "company_data");
              }}
            >
              Ingresar
            </Button>
            <Button variant="ghost" type="button" onClick={() => setDeclinedAmount(true)}>
              No lo sé
            </Button>
          </div>
        )}
        {!batchSize && declinedAmount && amountCandidates.length > 0 && (
          <ReferenceOffer candidate={amountCandidates[0]} onAccept={(v) => onSet("batchSize", v, "reference_estimate")} />
        )}
      </div>

      <div className="rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary">Duración de una tanda</p>
        {hoursPerBatch ? (
          <p className="mt-1 text-sm text-text-primary">
            {hoursPerBatch.value} h <span className="text-xs text-text-tertiary">({hoursPerBatch.source === "company_data" ? "tu dato" : "referencia"})</span>
          </p>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <input value={hoursDraft} onChange={(e) => setHoursDraft(e.target.value)} placeholder="horas" autoComplete="off" className="h-9 w-28 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled" />
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                const v = Number(hoursDraft);
                if (!Number.isFinite(v) || v <= 0) return;
                onSet("hoursPerBatch", v, "company_data");
              }}
            >
              Ingresar
            </Button>
            <Button variant="ghost" type="button" onClick={() => setDeclinedHours(true)}>
              No lo sé
            </Button>
          </div>
        )}
        {!hoursPerBatch && declinedHours && hoursCandidates.length > 0 && (
          <ReferenceOffer candidate={hoursCandidates[0]} onAccept={(v) => onSet("hoursPerBatch", v, "reference_estimate")} />
        )}
      </div>
    </div>
  );
}

export function GuidedSetupScreen({
  companyName,
  industry,
  initialAnswers,
  onBack,
  onComplete,
}: {
  companyName: string;
  industry: string;
  /** Respuestas ya extraídas en Pantalla 2 (Intake) por texto libre — Guided Setup arranca desde ahí, nunca pide de nuevo lo que Guardian ya entendió. */
  initialAnswers?: GuidedSetupV2Answers;
  onBack: () => void;
  onComplete: (input: RawModelInput, completeness: TwinCompleteness) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS_V2[stepIndex];
  const [answers, setAnswers] = useState<GuidedSetupV2Answers>(initialAnswers ?? emptyGuidedSetupV2Answers());
  const staffingFieldName = useAutofillSafeName();
  const [productDraft, setProductDraft] = useState("");
  const [scheduleOverride, setScheduleOverride] = useState<{ days: string; start: string; end: string } | null>(null);

  const block = BLOCK_BY_STEP[step];
  const isResolvedFromFreeform = block ? answers.resolvedBlocks[block] : false;

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, STEPS_V2.length - 1));
  }
  function goBack() {
    if (stepIndex === 0) {
      onBack();
      return;
    }
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function markResolved(b: GuidedSetupBlock) {
    setAnswers((prev) => ({ ...prev, resolvedBlocks: { ...prev.resolvedBlocks, [b]: true } }));
  }

  function addProduct() {
    const v = productDraft.trim();
    if (!v) return;
    setAnswers((prev) => ({ ...prev, productsRaw: [...prev.productsRaw, v], resolvedBlocks: { ...prev.resolvedBlocks, products: true } }));
    setProductDraft("");
  }
  function removeProduct(i: number) {
    setAnswers((prev) => ({ ...prev, productsRaw: prev.productsRaw.filter((_, idx) => idx !== i) }));
  }

  function addProcess(name: string) {
    const v = name.trim();
    if (!v) return;
    setAnswers((prev) => ({ ...prev, processesRaw: [...prev.processesRaw, v], resolvedBlocks: { ...prev.resolvedBlocks, flow: true } }));
  }
  function removeProcess(i: number) {
    setAnswers((prev) => ({ ...prev, processesRaw: prev.processesRaw.filter((_, idx) => idx !== i) }));
  }
  function moveProcess(i: number, direction: -1 | 1) {
    setAnswers((prev) => {
      const j = i + direction;
      if (j < 0 || j >= prev.processesRaw.length) return prev;
      const next = [...prev.processesRaw];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...prev, processesRaw: next };
    });
  }
  function renameProcess(i: number, name: string) {
    const v = name.trim();
    if (!v) return;
    setAnswers((prev) => {
      const oldRaw = prev.processesRaw[i];
      return {
        ...prev,
        processesRaw: prev.processesRaw.map((p, idx) => (idx === i ? v : p)),
        // El equipo ya agrupado bajo el nombre viejo (Pantalla 5) se reasigna al nuevo — nunca queda huérfano.
        equipment: oldRaw !== undefined ? remapEquipmentProcess(prev.equipment, oldRaw, v) : prev.equipment,
      };
    });
  }

  function addEquipment(processRaw: string, name: string) {
    setAnswers((prev) => ({
      ...prev,
      equipment: addEquipmentToProcess(prev.equipment, processRaw, name),
      resolvedBlocks: { ...prev.resolvedBlocks, equipment: true },
    }));
  }
  function renameEquipment(id: string, name: string) {
    setAnswers((prev) => ({ ...prev, equipment: renameEquipmentEntry(prev.equipment, id, name) }));
  }
  function removeEquipmentEntry(id: string) {
    setAnswers((prev) => ({ ...prev, equipment: removeEquipment(prev.equipment, id) }));
  }

  function setCapacity(id: string, value: number, unit: string, source: "company_data" | "reference_estimate") {
    setAnswers((prev) => ({ ...prev, equipment: setEquipmentCapacity(prev.equipment, id, value, unit, source), resolvedBlocks: { ...prev.resolvedBlocks, capacities: true } }));
  }

  function setCapacityVariant(equipmentId: string, productName: string, value: number) {
    setAnswers((prev) => ({ ...prev, equipment: setCapacityVariantV2(prev.equipment, equipmentId, productName, value, "company_data") }));
  }

  function removeCapacityVariantEntry(equipmentId: string, productName: string) {
    setAnswers((prev) => ({ ...prev, equipment: removeCapacityVariantV2(prev.equipment, equipmentId, productName) }));
  }

  const batchProcessPresent = answers.equipment.some((e) => normalizeProcessName(e.processRaw) === BATCH_PROCESS);
  const batchEntry = answers.batchInfo.find((b) => b.process === BATCH_PROCESS) ?? null;

  function setBatchField(field: "batchSize" | "hoursPerBatch", value: number, source: "company_data" | "reference_estimate") {
    setAnswers((prev) => {
      const current = prev.batchInfo.find((b) => b.process === BATCH_PROCESS);
      const next = { process: BATCH_PROCESS, batchSize: current?.batchSize ?? null, batchUnit: current?.batchUnit ?? ("kg" as const), hoursPerBatch: current?.hoursPerBatch ?? null, [field]: { value, source } };
      const idx = prev.batchInfo.findIndex((b) => b.process === BATCH_PROCESS);
      const batchInfo = idx === -1 ? [...prev.batchInfo, next] : prev.batchInfo.map((b, i) => (i === idx ? next : b));
      return { ...prev, batchInfo, resolvedBlocks: { ...prev.resolvedBlocks, batchTimes: true } };
    });
  }

  /** Confirma EXACTAMENTE lo que está propuesto ahora mismo — si vino de una extracción, confirma esa; si no, confirma el default sugerido. Nunca reemplaza en silencio una propuesta ya extraída por el default genérico. */
  function confirmSuggestedSchedule() {
    setAnswers((prev) => ({
      ...prev,
      schedule: { ...(prev.schedule ?? suggestedSchedule()), confirmed: true },
      resolvedBlocks: { ...prev.resolvedBlocks, schedule: true },
    }));
  }

  const { input, completeness, summary } = useMemo(() => {
    if (step !== "review") return { input: null, completeness: null, summary: null };
    return buildModelInputsFromGuidedSetupV2(answers, { name: companyName, industry });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function handleBuildTwin() {
    const result = buildModelInputsFromGuidedSetupV2(answers, { name: companyName, industry });
    onComplete(result.input, result.completeness);
  }

  const questionLabel: Partial<Record<StepV2, string>> = {
    products: "Qué fabricás",
    batchTimes: "Tiempos de tanda",
    staffing: "Personal",
    schedule: "Horario",
    materials: "Materias primas (opcional)",
  };

  if (step === "products") {
    return (
      <div className="flex flex-1 items-start justify-center px-2 py-8 lg:items-center">
        <ProductsStepScreen
          currentStep={stepIndex + 1 + INTAKE_STEP_NUMBER}
          totalSteps={TOTAL_ONBOARDING_STEPS}
          productDraft={productDraft}
          onDraftChange={setProductDraft}
          onAdd={addProduct}
          onRemove={removeProduct}
          products={answers.productsRaw}
          isResolvedFromFreeform={isResolvedFromFreeform ?? false}
          canSkip={Boolean(block && !answers.resolvedBlocks[block])}
          onSkip={() => block && markResolved(block)}
          goBack={goBack}
          goNext={goNext}
        />
      </div>
    );
  }

  if (step === "processes") {
    return (
      <div className="flex flex-1 items-start justify-center px-2 py-8 lg:items-center">
        <ProcessesStepScreen
          currentStep={stepIndex + 1 + INTAKE_STEP_NUMBER}
          totalSteps={TOTAL_ONBOARDING_STEPS}
          processes={answers.processesRaw}
          onAdd={addProcess}
          onRemove={removeProcess}
          onMove={moveProcess}
          onRename={renameProcess}
          isResolvedFromFreeform={isResolvedFromFreeform ?? false}
          canSkip={Boolean(block && !answers.resolvedBlocks[block])}
          onSkip={() => block && markResolved(block)}
          goBack={goBack}
          goNext={goNext}
        />
      </div>
    );
  }

  if (step === "equipment") {
    return (
      <div className="flex flex-1 items-start justify-center px-2 py-8 lg:items-center">
        <EquipmentStepScreen
          currentStep={stepIndex + 1 + INTAKE_STEP_NUMBER}
          totalSteps={TOTAL_ONBOARDING_STEPS}
          processesRaw={answers.processesRaw}
          equipment={answers.equipment}
          onAdd={addEquipment}
          onRemove={removeEquipmentEntry}
          onRename={renameEquipment}
          isResolvedFromFreeform={isResolvedFromFreeform ?? false}
          canSkip={Boolean(block && !answers.resolvedBlocks[block])}
          onSkip={() => block && markResolved(block)}
          goBack={goBack}
          goNext={goNext}
        />
      </div>
    );
  }

  if (step === "capacities") {
    return (
      <div className="flex flex-1 items-start justify-center px-2 py-8 lg:items-center">
        <CapacitiesStepScreen
          currentStep={stepIndex + 1 + INTAKE_STEP_NUMBER}
          totalSteps={TOTAL_ONBOARDING_STEPS}
          processesRaw={answers.processesRaw}
          equipment={answers.equipment}
          productsRaw={answers.productsRaw}
          batchEntry={batchEntry}
          onSetCapacity={setCapacity}
          onSetCapacityVariant={setCapacityVariant}
          onRemoveCapacityVariant={removeCapacityVariantEntry}
          onSetBatchField={setBatchField}
          isResolvedFromFreeform={isResolvedFromFreeform ?? false}
          canSkip={Boolean(block && !answers.resolvedBlocks[block])}
          onSkip={() => block && markResolved(block)}
          goBack={goBack}
          goNext={goNext}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-tertiary">
          {step === "review" ? "Tu operación" : questionLabel[step]}
        </p>
      </div>

      <Guardian state="listening" size={84} variant="asset" />

      <motion.div
        key={step}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="glass-panel w-full max-w-xl rounded-[var(--radius-lg)] p-6"
      >
        {step === "batchTimes" && (
          <BatchTimesStep hasBatchProcess={batchProcessPresent} batchSize={batchEntry?.batchSize ?? null} hoursPerBatch={batchEntry?.hoursPerBatch ?? null} onSet={setBatchField} />
        )}

        {step === "staffing" && (
          <div className="flex flex-col gap-4">
            {isResolvedFromFreeform && answers.staffingCount !== null && <ResolvedBadge />}
            <p className="text-sm text-text-secondary">¿Cuántas personas trabajan normalmente en producción?</p>
            <input
              type="number"
              name={staffingFieldName}
              min={0}
              value={answers.staffingCount ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                setAnswers((prev) => ({ ...prev, staffingCount: Number.isFinite(v) && e.target.value !== "" ? v : null, resolvedBlocks: { ...prev.resolvedBlocks, staffing: true } }));
              }}
              placeholder="Ej: 10"
              autoComplete="off"
              className="h-11 w-32 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 text-sm text-text-primary outline-none placeholder:text-text-disabled"
            />
            <p className="text-xs text-text-disabled">Un número total alcanza — no hace falta detalle por área.</p>
          </div>
        )}

        {step === "schedule" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">¿Qué días y horarios produce normalmente el laboratorio?</p>
            {answers.schedule?.confirmed ? (
              <p className="text-sm text-text-primary">
                {answers.schedule.workdayStart} · {answers.schedule.workdayHours}h · {answers.schedule.workingDays.length} días/semana
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] p-3">
                  <p className="text-xs text-text-tertiary">
                    {answers.schedule ? "Esto entendí — confirmalo o cambialo (nunca se aplica solo):" : "Sugerencia por defecto (confirmá o cambiala — nunca se aplica sola):"}
                  </p>
                  <p className="mt-1 text-sm text-text-primary">{formatScheduleProposal(answers.schedule ?? { ...suggestedSchedule(), confirmed: false })}</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" onClick={confirmSuggestedSchedule}>
                    {answers.schedule ? "Confirmar este horario" : "Confirmar horario sugerido"}
                  </Button>
                  <Button variant="ghost" type="button" onClick={() => setScheduleOverride({ days: "lunes a viernes", start: "08:00", end: "17:00" })}>
                    Cambiar
                  </Button>
                </div>
                {scheduleOverride && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={scheduleOverride.days} onChange={(e) => setScheduleOverride((s) => (s ? { ...s, days: e.target.value } : s))} placeholder="lunes a viernes" className="h-10 w-40 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none" />
                    <input value={scheduleOverride.start} onChange={(e) => setScheduleOverride((s) => (s ? { ...s, start: e.target.value } : s))} placeholder="08:00" className="h-10 w-20 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none" />
                    <input value={scheduleOverride.end} onChange={(e) => setScheduleOverride((s) => (s ? { ...s, end: e.target.value } : s))} placeholder="17:00" className="h-10 w-20 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none" />
                    <Button
                      type="button"
                      onClick={() => {
                        const proposal = scheduleMentionToProposal({ workingDaysText: scheduleOverride.days, startTime: scheduleOverride.start, endTime: scheduleOverride.end });
                        if (!proposal) return;
                        setAnswers((prev) => ({ ...prev, schedule: { ...proposal, confirmed: true }, resolvedBlocks: { ...prev.resolvedBlocks, schedule: true } }));
                        setScheduleOverride(null);
                      }}
                    >
                      Confirmar
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === "materials" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">¿Querés agregar fórmulas e inventario para que GUARDIAN también detecte faltantes de materias primas?</p>
            <div className="flex gap-2">
              <Button variant={answers.materialsIncluded ? "primary" : "ghost"} type="button" onClick={() => setAnswers((prev) => ({ ...prev, materialsIncluded: true }))}>
                Agregar ahora
              </Button>
              <Button variant={!answers.materialsIncluded ? "primary" : "ghost"} type="button" onClick={() => setAnswers((prev) => ({ ...prev, materialsIncluded: false }))}>
                Más adelante
              </Button>
            </div>
            {answers.materialsIncluded && (
              <MaterialsInlineEditor materials={answers.materials} onAdd={(m) => setAnswers((prev) => ({ ...prev, materials: [...prev.materials, m] }))} onRemove={(code) => setAnswers((prev) => ({ ...prev, materials: prev.materials.filter((m) => m.code !== code) }))} />
            )}
            {!answers.materialsIncluded && <p className="text-xs text-text-disabled">Sin problema — el Twin queda válido igual, con materiales marcados como no evaluados.</p>}
          </div>
        )}

        {step === "review" && input && completeness && summary && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">Esto es lo que entendí de {companyName}:</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Productos" value={summary.productsCount} />
              <Stat label="Procesos" value={summary.processesCount} />
              <Stat label="Recursos" value={summary.resourcesCount} />
              <Stat label="Personal de producción" value={summary.staffCount ?? "—"} />
              <Stat label="Datos de tu empresa" value={`${summary.companyDataCount}`} />
              <Stat label="Valores de referencia" value={`${summary.referenceEstimateCount}`} />
            </div>
            <p className="text-xs text-text-tertiary">Materiales: {summary.materialsConnected ? "conectados" : "no conectados"}</p>
            {summary.referenceEstimateCount > 0 && (
              <div className="rounded-[var(--radius-sm)] border border-accent/25 bg-accent-soft/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-bright">
                  Guardian está usando {summary.referenceEstimateCount} valor{summary.referenceEstimateCount !== 1 ? "es" : ""} de referencia
                </p>
                <p className="mt-1 text-xs text-text-secondary">Van a quedar identificados como estimaciones — reemplazalos cuando tengas el dato real.</p>
              </div>
            )}
            <Button onClick={handleBuildTwin} className="mt-2">
              Construir mi Modelo Operacional
            </Button>
          </div>
        )}
      </motion.div>

      {step !== "review" && (
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={goBack} className="gap-2">
            <ArrowLeft size={15} />
            Atrás
          </Button>
          <Button onClick={goNext} className="gap-2">
            Continuar
            <ArrowRight size={15} />
          </Button>
          {block && !answers.resolvedBlocks[block] && (
            <button type="button" onClick={() => markResolved(block)} className="text-xs text-text-tertiary underline underline-offset-2">
              Omitir
            </button>
          )}
        </div>
      )}
      {step === "review" && (
        <Button variant="ghost" onClick={goBack} className="gap-2">
          <ArrowLeft size={15} />
          Atrás
        </Button>
      )}
      <p className="text-[10px] text-text-disabled">
        {totalResolvedCount(answers.resolvedBlocks)} / {GUIDED_SETUP_BLOCKS.length} bloques resueltos
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-white/[0.015] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">{label}</p>
      <p className="mt-0.5 text-sm text-text-primary">{value}</p>
    </div>
  );
}

function MaterialsInlineEditor({
  materials,
  onAdd,
  onRemove,
}: {
  materials: { code: string; name: string; quantity: number; unit: string }[];
  onAdd: (m: { code: string; name: string; quantity: number; unit: string }) => void;
  onRemove: (code: string) => void;
}) {
  const [draft, setDraft] = useState({ code: "", name: "", quantity: "", unit: "" });
  const codeField = useAutofillSafeName();
  const nameField = useAutofillSafeName();
  const qtyField = useAutofillSafeName();
  const unitField = useAutofillSafeName();

  function submit() {
    const qty = Number(draft.quantity);
    if (!draft.code.trim() || !draft.name.trim() || !Number.isFinite(qty) || qty < 0 || !draft.unit.trim()) return;
    onAdd({ code: draft.code.trim(), name: draft.name.trim(), quantity: qty, unit: draft.unit.trim() });
    setDraft({ code: "", name: "", quantity: "", unit: "" });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {materials.map((m) => (
          <EntryChip key={m.code} label={`${m.code} · ${m.name}`} sublabel={`${m.quantity} ${m.unit}`} onRemove={() => onRemove(m.code)} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input name={codeField} value={draft.code} onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} placeholder="Código" autoComplete="off" className="h-10 w-24 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled" />
        <input name={nameField} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Nombre" autoComplete="off" className="h-10 w-36 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled" />
        <input type="number" name={qtyField} value={draft.quantity} onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))} placeholder="Cant." autoComplete="off" className="h-10 w-20 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled" />
        <input name={unitField} value={draft.unit} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))} placeholder="Unidad" autoComplete="off" className="h-10 w-20 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled" />
        <Button variant="ghost" type="button" onClick={submit} className="px-3">
          <Plus size={16} />
        </Button>
      </div>
    </div>
  );
}
