"use client";

import { useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { ProductsStepScreen } from "@/components/guided-setup/GuidedSetupProductsStep";
import { ProcessesStepScreen } from "@/components/guided-setup/GuidedSetupProcessesStep";
import { EquipmentStepScreen } from "@/components/guided-setup/GuidedSetupEquipmentStep";
import { CapacitiesStepScreen } from "@/components/guided-setup/GuidedSetupCapacitiesStep";
import { StaffingStepScreen } from "@/components/guided-setup/GuidedSetupStaffingStep";
import { ScheduleStepScreen } from "@/components/guided-setup/GuidedSetupScheduleStep";
import { MaterialsStepScreen } from "@/components/guided-setup/GuidedSetupMaterialsStep";
import {
  addEquipmentToProcess,
  emptyGuidedSetupV2Answers,
  remapEquipmentProcess,
  remapStaffingBreakdownProcess,
  removeCapacityVariant as removeCapacityVariantV2,
  removeEquipment,
  removeStaffingBreakdown,
  renameEquipmentEntry,
  setCapacityVariant as setCapacityVariantV2,
  setEquipmentCapacity,
  setStaffingBreakdown,
  suggestedSchedule,
  totalResolvedCount,
  GUIDED_SETUP_BLOCKS,
  type EquipmentEntryV2,
  type GuidedSetupBlock,
  type GuidedSetupV2Answers,
  type ScheduleAnswerV2,
} from "@/lib/model/guided-setup-v2";
import { INTAKE_STEP_NUMBER, TOTAL_ONBOARDING_STEPS } from "@/lib/model/guided-setup-progress";
import { buildModelInputsFromGuidedSetupV2 } from "@/lib/model/buildModelInputsFromGuidedSetupV2";
import { resolveReferenceValue } from "@/lib/engine/reference-catalog";
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

type StepV2 = "products" | "processes" | "equipment" | "capacities" | "staffing" | "schedule" | "materials" | "review";
const STEPS_V2: StepV2[] = ["products", "processes", "equipment", "capacities", "staffing", "schedule", "materials", "review"];
const BLOCK_BY_STEP: Partial<Record<StepV2, GuidedSetupBlock>> = {
  products: "products",
  processes: "flow",
  equipment: "equipment",
  capacities: "capacities",
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
  onComplete: (input: RawModelInput, completeness: TwinCompleteness, schedule: ScheduleAnswerV2) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS_V2[stepIndex];
  const [answers, setAnswers] = useState<GuidedSetupV2Answers>(initialAnswers ?? emptyGuidedSetupV2Answers());
  const [productDraft, setProductDraft] = useState("");

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
        staffingBreakdown: oldRaw !== undefined ? remapStaffingBreakdownProcess(prev.staffingBreakdown, oldRaw, v) : prev.staffingBreakdown,
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

  const { input, completeness, summary } = useMemo(() => {
    if (step !== "review") return { input: null, completeness: null, summary: null };
    return buildModelInputsFromGuidedSetupV2(answers, { name: companyName, industry });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function handleBuildTwin() {
    const result = buildModelInputsFromGuidedSetupV2(answers, { name: companyName, industry });
    onComplete(result.input, result.completeness, answers.schedule ?? { ...suggestedSchedule(), confirmed: true });
  }

  const questionLabel: Partial<Record<StepV2, string>> = {
    products: "Qué fabricás",
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

  if (step === "staffing") {
    return (
      <div className="flex flex-1 items-start justify-center px-2 py-8 lg:items-center">
        <StaffingStepScreen
          currentStep={stepIndex + 1 + INTAKE_STEP_NUMBER}
          totalSteps={TOTAL_ONBOARDING_STEPS}
          total={answers.staffingCount}
          processesRaw={answers.processesRaw}
          breakdown={answers.staffingBreakdown}
          isResolvedFromFreeform={isResolvedFromFreeform ?? false}
          onSetTotal={(value) => setAnswers((prev) => ({ ...prev, staffingCount: value, resolvedBlocks: { ...prev.resolvedBlocks, staffing: value !== null || prev.resolvedBlocks.staffing } }))}
          onSetBreakdown={(processRaw, value) => setAnswers((prev) => ({ ...prev, staffingBreakdown: setStaffingBreakdown(prev.staffingBreakdown, processRaw, value), resolvedBlocks: { ...prev.resolvedBlocks, staffing: true } }))}
          onRemoveBreakdown={(processRaw) => setAnswers((prev) => ({ ...prev, staffingBreakdown: removeStaffingBreakdown(prev.staffingBreakdown, processRaw) }))}
          goBack={goBack}
          goNext={goNext}
        />
      </div>
    );
  }

  if (step === "schedule") {
    const schedule = answers.schedule ?? { ...suggestedSchedule(), confirmed: false };
    return (
      <main className="min-h-screen bg-bg-primary">
        <div className="flex min-h-screen justify-center">
          <ScheduleStepScreen
            currentStep={stepIndex + 1 + INTAKE_STEP_NUMBER}
            totalSteps={TOTAL_ONBOARDING_STEPS}
            schedule={schedule}
            onChange={(value) => setAnswers((prev) => ({ ...prev, schedule: value, resolvedBlocks: { ...prev.resolvedBlocks, schedule: true } }))}
            goBack={goBack}
            goNext={() => {
              setAnswers((prev) => ({ ...prev, schedule: { ...(prev.schedule ?? schedule), confirmed: true }, resolvedBlocks: { ...prev.resolvedBlocks, schedule: true } }));
              goNext();
            }}
          />
        </div>
      </main>
    );
  }

  if (step === "materials") {
    return (
      <main className="min-h-screen bg-bg-primary">
        <div className="flex min-h-screen justify-center">
          <MaterialsStepScreen
            currentStep={stepIndex + 1 + INTAKE_STEP_NUMBER}
            totalSteps={TOTAL_ONBOARDING_STEPS}
            included={answers.materialsIncluded}
            materials={answers.materials}
            onSetIncluded={(included) => setAnswers((prev) => ({ ...prev, materialsIncluded: included }))}
            onAdd={(material) => setAnswers((prev) => ({ ...prev, materials: [...prev.materials.filter((item) => item.code !== material.code), material] }))}
            onRemove={(code) => setAnswers((prev) => ({ ...prev, materials: prev.materials.filter((material) => material.code !== code) }))}
            goBack={goBack}
            goNext={goNext}
          />
        </div>
      </main>
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
