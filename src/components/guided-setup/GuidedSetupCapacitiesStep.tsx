"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Gauge, Info } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { GuardianLogo } from "@/components/ui/GuardianLogo";
import { Button } from "@/components/ui/Button";
import {
  BATCH_PROCESS,
  CapacityVariantsBlock,
  ReferenceOffer,
  ResolvedBadge,
  useAutofillSafeName,
} from "@/components/guided-setup/GuidedSetupScreen";
import { ProcessIcon } from "@/components/guided-setup/GuidedSetupEquipmentStep";
import { normalizeProcessName } from "@/lib/model/buildModelInputsFromGuidedSetup";
import { findReferenceCandidates } from "@/lib/engine/reference-catalog";
import { REFERENCE_CATALOG } from "@/data/reference-catalog";
import type { BatchInfoV2, EquipmentEntryV2 } from "@/lib/model/guided-setup-v2";

/**
 * Guided Setup → Capacidades y tiempos (Pantalla 6).
 * Continúa el mismo lenguaje visual de Productos/Procesos/Equipos: dos
 * columnas, Guardian 3D con placa, progreso real.
 *
 * Agrupa por `processesRaw` (misma fuente de verdad que Pantalla 5) y adapta
 * la unidad al tipo REAL de proceso — nunca u/h para todo:
 * - Elaboración (etapa por lote): cada equipo declara una capacidad de
 *   referencia en kg (informativa — el motor de batch todavía no
 *   diferencia capacidad por reactor individual, ver Master Context sección
 *   25); el tiempo/tamaño de lote que SÍ alimenta la simulación
 *   (`ProductionReferenceStep.batchSize`/`hoursPerBatch`) es UNA sola
 *   declaración compartida por todo el proceso — reusa exactamente el mismo
 *   `answers.batchInfo`/`setBatchField` que ya existía (ahora en modo
 *   `batchUnit: "kg"`, alineado con el default que ya usaba el camino NLU/
 *   `mergeBatchInfoMention` y con la referencia del catálogo
 *   `reactor-batch-size-kg`).
 * - Procesos continuos reconocidos (Envasado/Codificado/etc.): velocidad
 *   general en u/h por equipo + precisión progresiva opcional por producto
 *   (`rateVariants`/`CapacityVariantsBlock`, sin cambios — Product Contract).
 * - Procesos custom no reconocidos (`normalizeProcessName` → null, ej.
 *   "Pesada"): capacidad opcional sin unidad asumida — nunca inventa una
 *   semántica que el motor no entiende todavía.
 *
 * `EquipmentEntryV2.capacity` sigue siendo un `SourcedValue<number> | null`
 * genérico — null real (nunca 0 fabricado) hasta que el usuario declara un
 * valor o acepta una referencia explícita.
 */
type ProcessKind = "batch" | "continuous" | "unsupported";

function processKind(label: string): ProcessKind {
  const normalized = normalizeProcessName(label);
  if (normalized === BATCH_PROCESS) return "batch";
  if (normalized !== null) return "continuous";
  return "unsupported";
}

function minutesFromHours(hours: number): number {
  return Math.round(hours * 60);
}

/**
 * Capacidad de UN equipo — unidad/placeholder/parámetro de referencia
 * adaptados al tipo de proceso. Para procesos continuos preserva
 * `CapacityVariantsBlock` (rateVariants); para lote y custom no aplica —
 * batch no tiene noción de "rate por producto" y custom no tiene motor que
 * lo consuma todavía.
 */
function EquipmentCapacityRow({
  entry,
  kind,
  productsRaw,
  onSetCapacity,
  onSetCapacityVariant,
  onRemoveCapacityVariant,
}: {
  entry: EquipmentEntryV2;
  kind: ProcessKind;
  productsRaw: string[];
  onSetCapacity: (id: string, value: number, unit: string, source: "company_data" | "reference_estimate") => void;
  onSetCapacityVariant: (equipmentId: string, productName: string, value: number) => void;
  onRemoveCapacityVariant: (equipmentId: string, productName: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [declined, setDeclined] = useState(false);
  const fieldName = useAutofillSafeName();

  const unit = kind === "batch" ? "kg" : kind === "continuous" ? "u/h" : "";
  const placeholder = kind === "batch" ? "kg" : kind === "continuous" ? "u/h" : "cantidad";
  const candidates =
    kind !== "unsupported"
      ? findReferenceCandidates(REFERENCE_CATALOG, {
          category: entry.category,
          process: normalizeProcessName(entry.processRaw) ?? undefined,
          parameter: kind === "batch" ? "batchSize" : "ratePerHour",
        })
      : [];

  return (
    <div className="rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-text-primary">{entry.name}</span>
        {entry.capacity ? (
          <span className="text-xs text-text-tertiary">
            {entry.capacity.value} {entry.capacityUnit}{" "}
            <span className={entry.capacity.source === "company_data" ? "text-text-secondary" : "text-accent-bright"}>
              ({entry.capacity.source === "company_data" ? "tu dato" : "referencia"})
            </span>
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={fieldName}>
              Capacidad de {entry.name}
            </label>
            <input
              id={fieldName}
              name={fieldName}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              autoComplete="off"
              className="h-9 w-24 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled"
            />
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                const v = Number(draft);
                if (!Number.isFinite(v) || v <= 0) return;
                onSetCapacity(entry.id, v, unit, "company_data");
              }}
            >
              Ingresar
            </Button>
            <Button variant="ghost" type="button" onClick={() => setDeclined(true)}>
              No lo sé
            </Button>
          </div>
        )}
      </div>
      {!entry.capacity && declined && candidates.length > 0 && (
        <ReferenceOffer candidate={candidates[0]} onAccept={(v) => onSetCapacity(entry.id, v, candidates[0].unit, "reference_estimate")} />
      )}
      {!entry.capacity && declined && candidates.length === 0 && (
        <p className="mt-2 text-xs text-text-disabled">
          {kind === "unsupported"
            ? "Guardian todavía no interpreta este proceso automáticamente — el dato queda guardado como referencia."
            : `Todavía no hay una referencia para "${entry.category}" — queda marcado como faltante, nunca en cero.`}
        </p>
      )}
      {kind === "continuous" && (entry.capacity || entry.capacityVariants.length > 0 || declined) && (
        <CapacityVariantsBlock equipment={entry} productsRaw={productsRaw} onSetVariant={onSetCapacityVariant} onRemoveVariant={onRemoveCapacityVariant} />
      )}
    </div>
  );
}

/**
 * Tiempo/tamaño de lote — UNA sola declaración por proceso de tipo lote
 * (nunca por reactor individual, ver docstring de archivo). Reusa
 * `answers.batchInfo`/`setBatchField` sin cambios de motor.
 */
function BatchTimingCard({ batchEntry, onSet }: { batchEntry: BatchInfoV2 | null; onSet: (field: "batchSize" | "hoursPerBatch", value: number, source: "company_data" | "reference_estimate") => void }) {
  const [amountDraft, setAmountDraft] = useState("");
  const [minutesDraft, setMinutesDraft] = useState("");
  const [declinedAmount, setDeclinedAmount] = useState(false);
  const [declinedMinutes, setDeclinedMinutes] = useState(false);
  const amountField = useAutofillSafeName();
  const minutesField = useAutofillSafeName();

  const amountCandidates = findReferenceCandidates(REFERENCE_CATALOG, { category: "reactor", process: BATCH_PROCESS, parameter: "batchSize" });
  const hoursCandidates = findReferenceCandidates(REFERENCE_CATALOG, { category: "reactor", process: BATCH_PROCESS, parameter: "hoursPerBatch" });

  const batchSize = batchEntry?.batchSize ?? null;
  const hoursPerBatch = batchEntry?.hoursPerBatch ?? null;

  return (
    <div className="rounded-[var(--radius-sm)] border border-accent/20 bg-accent-soft/25 p-2.5">
      <p className="text-xs font-semibold text-accent-bright">Tiempo por lote</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-text-tertiary">
        Aplica a todo el proceso de Elaboración — Guardian todavía no diferencia el tiempo de ciclo por reactor individual.
      </p>
      <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary" title="Cuánto puede producir el proceso en un lote.">
            Tamaño de lote (kg)
          </p>
          {batchSize ? (
            <p className="mt-1 text-sm text-text-primary">
              {batchSize.value} kg <span className="text-xs text-text-tertiary">({batchSize.source === "company_data" ? "tu dato" : "referencia"})</span>
            </p>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <label className="sr-only" htmlFor={amountField}>
                Tamaño de lote en kg
              </label>
              <input
                id={amountField}
                name={amountField}
                value={amountDraft}
                onChange={(e) => setAmountDraft(e.target.value)}
                placeholder="kg"
                autoComplete="off"
                className="h-9 w-20 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled"
              />
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
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary" title="Cuánto tarda aproximadamente un ciclo completo.">
            Tiempo por lote (min)
          </p>
          {hoursPerBatch ? (
            <p className="mt-1 text-sm text-text-primary">
              {minutesFromHours(hoursPerBatch.value)} min <span className="text-xs text-text-tertiary">({hoursPerBatch.source === "company_data" ? "tu dato" : "referencia"})</span>
            </p>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <label className="sr-only" htmlFor={minutesField}>
                Tiempo por lote en minutos
              </label>
              <input
                id={minutesField}
                name={minutesField}
                value={minutesDraft}
                onChange={(e) => setMinutesDraft(e.target.value)}
                placeholder="min"
                autoComplete="off"
                className="h-9 w-20 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled"
              />
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  const v = Number(minutesDraft);
                  if (!Number.isFinite(v) || v <= 0) return;
                  onSet("hoursPerBatch", v / 60, "company_data");
                }}
              >
                Ingresar
              </Button>
              <Button variant="ghost" type="button" onClick={() => setDeclinedMinutes(true)}>
                No lo sé
              </Button>
            </div>
          )}
          {!hoursPerBatch && declinedMinutes && hoursCandidates.length > 0 && (
            <ReferenceOffer candidate={hoursCandidates[0]} onAccept={(v) => onSet("hoursPerBatch", v, "reference_estimate")} />
          )}
        </div>
      </div>
    </div>
  );
}

function CapacitiesProcessGroup({
  processLabel,
  equipmentList,
  productsRaw,
  batchEntry,
  onSetCapacity,
  onSetCapacityVariant,
  onRemoveCapacityVariant,
  onSetBatchField,
}: {
  processLabel: string;
  equipmentList: EquipmentEntryV2[];
  productsRaw: string[];
  batchEntry: BatchInfoV2 | null;
  onSetCapacity: (id: string, value: number, unit: string, source: "company_data" | "reference_estimate") => void;
  onSetCapacityVariant: (equipmentId: string, productName: string, value: number) => void;
  onRemoveCapacityVariant: (equipmentId: string, productName: string) => void;
  onSetBatchField: (field: "batchSize" | "hoursPerBatch", value: number, source: "company_data" | "reference_estimate") => void;
}) {
  const kind = processKind(processLabel);
  return (
    <div className="rounded-[var(--radius-lg)] border border-border-default bg-white/[0.02] p-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border-default bg-accent-soft text-accent-bright">
          <ProcessIcon label={processLabel} size={13} />
        </span>
        <p className="text-sm font-semibold text-text-primary">{processLabel}</p>
        <span className="text-[11px] text-text-disabled">
          {equipmentList.length} equipo{equipmentList.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="mt-1.5 flex flex-col gap-1.5">
        {kind === "batch" && <BatchTimingCard batchEntry={batchEntry} onSet={onSetBatchField} />}

        {equipmentList.length === 0 && <p className="text-xs text-text-disabled">No hay equipos cargados en esta etapa todavía.</p>}
        {equipmentList.map((e) => (
          <EquipmentCapacityRow
            key={e.id}
            entry={e}
            kind={kind}
            productsRaw={productsRaw}
            onSetCapacity={onSetCapacity}
            onSetCapacityVariant={onSetCapacityVariant}
            onRemoveCapacityVariant={onRemoveCapacityVariant}
          />
        ))}
      </div>
    </div>
  );
}

export function CapacitiesStepScreen({
  currentStep,
  totalSteps,
  processesRaw,
  equipment,
  productsRaw,
  batchEntry,
  onSetCapacity,
  onSetCapacityVariant,
  onRemoveCapacityVariant,
  onSetBatchField,
  isResolvedFromFreeform,
  canSkip,
  onSkip,
  goBack,
  goNext,
}: {
  currentStep: number;
  totalSteps: number;
  processesRaw: string[];
  equipment: EquipmentEntryV2[];
  productsRaw: string[];
  batchEntry: BatchInfoV2 | null;
  onSetCapacity: (id: string, value: number, unit: string, source: "company_data" | "reference_estimate") => void;
  onSetCapacityVariant: (equipmentId: string, productName: string, value: number) => void;
  onRemoveCapacityVariant: (equipmentId: string, productName: string) => void;
  onSetBatchField: (field: "batchSize" | "hoursPerBatch", value: number, source: "company_data" | "reference_estimate") => void;
  isResolvedFromFreeform: boolean;
  canSkip: boolean;
  onSkip: () => void;
  goBack: () => void;
  goNext: () => void;
}) {
  const current = Math.min(currentStep, totalSteps);

  return (
    <div className="grid w-full max-w-[1240px] flex-1 grid-cols-1 items-start gap-8 px-6 py-3 lg:grid-cols-[1fr_2fr] lg:gap-10 lg:px-10">
      {/* ============================== IZQUIERDA — Branding + Guardian ============================== */}
      <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
        <div className="flex items-center gap-3">
          <GuardianLogo size={34} />
          <div>
            <p className="text-base font-bold tracking-[0.08em] text-text-primary">GUARDIAN</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.26em] text-accent-bright">Tu operación. Bajo control.</p>
          </div>
        </div>

        <h1 className="mt-5 max-w-xs text-[22px] font-semibold leading-[1.25] tracking-tight text-text-primary">
          Configurá tu laboratorio.
          <br />
          <span className="text-accent-bright">Te guía Guardian.</span>
        </h1>

        <p className="mt-2 max-w-xs text-sm leading-relaxed text-text-secondary">
          Respondé algunas preguntas y crearemos el modelo de tu operación.
        </p>

        <div className="my-4">
          <Guardian state="listening" size={160} variant="asset" />
        </div>

        <div className="w-full max-w-xs rounded-[var(--radius-lg)] border border-border-default bg-bg-elevated p-3 text-left">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-default bg-white/[0.03]">
              <GuardianLogo size={14} />
            </span>
            <p className="text-xs font-semibold text-accent-bright">Guardian</p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-text-secondary">
            Cuanta más precisión tengas en las capacidades, más confiables serán las simulaciones.
          </p>
        </div>
      </div>

      {/* ============================== DERECHA — Configuración guiada ============================== */}
      <div className="w-full rounded-[var(--radius-xl)] border border-border-default bg-bg-elevated p-3 shadow-[var(--shadow-elevation-2)] xl:p-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-bright">Configuración guiada</p>
          <span className="shrink-0 rounded-full border border-border-default px-3 py-1 text-[11px] text-text-tertiary">
            Paso {current} de {totalSteps}
          </span>
        </div>

        <div className="mt-1.5 flex gap-1" aria-hidden>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i < current ? "var(--accent-gradient)" : "var(--border-default)" }} />
          ))}
        </div>

        <div className="mt-2.5 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border-default bg-accent-soft text-accent-bright">
            <Gauge size={16} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-text-primary xl:text-lg">¿Cuánto puede producir cada equipo?</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">Completá solo lo que conozcas. Podés dejar datos en blanco y agregarlos más adelante.</p>
          </div>
        </div>

        {isResolvedFromFreeform && equipment.some((e) => e.capacity) && (
          <div className="mt-1.5">
            <ResolvedBadge />
          </div>
        )}

        <div className="mt-2.5 flex flex-col gap-1.5">
          {processesRaw.length > 0 ? (
            processesRaw.map((p, i) => (
              <CapacitiesProcessGroup
                key={`${p}-${i}`}
                processLabel={p}
                equipmentList={equipment.filter((e) => e.processRaw === p)}
                productsRaw={productsRaw}
                batchEntry={batchEntry}
                onSetCapacity={onSetCapacity}
                onSetCapacityVariant={onSetCapacityVariant}
                onRemoveCapacityVariant={onRemoveCapacityVariant}
                onSetBatchField={onSetBatchField}
              />
            ))
          ) : (
            <p className="text-xs text-text-disabled">Todavía no tenés equipos cargados — podés continuar y completar esto más adelante.</p>
          )}
        </div>

        <div className="mt-2 flex items-start gap-3 rounded-[var(--radius-md)] border border-border-subtle bg-white/[0.015] p-2">
          <Info size={13} className="mt-0.5 shrink-0 text-accent-bright" aria-hidden />
          <p className="text-xs leading-relaxed text-text-secondary">Los campos son opcionales. Completá solo lo que conozcas por ahora.</p>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Button variant="ghost" onClick={goBack} className="gap-2">
            <ArrowLeft size={15} />
            Volver
          </Button>
          <Button variant="gradient" onClick={goNext} className="gap-2">
            Continuar
            <ArrowRight size={15} />
          </Button>
          {canSkip && (
            <button type="button" onClick={onSkip} className="text-xs text-text-tertiary underline underline-offset-2">
              Omitir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
