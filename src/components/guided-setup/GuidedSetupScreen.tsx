"use client";

import { useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Plus, X } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { InterpretationCard } from "@/components/nlu/InterpretationCard";
import { interpretWithAI } from "@/lib/nlu/client";
import { AI_UNAVAILABLE_MESSAGE, buildBlockedMessage, isBlockedStatus } from "@/lib/nlu/interpretation-view-model";
import type { NluEntities } from "@/lib/nlu/types";
import {
  batchInfoMentionsFromNluEntities,
  blocksTouchedByExtraction,
  emptyGuidedSetupV2Answers,
  equipmentMentionsFromNluEntities,
  formatScheduleProposal,
  markBlocksResolved,
  mergeBatchInfoMention,
  mergeEquipmentMention,
  mergeEquipmentMentions,
  removeEquipment,
  scheduleMentionToProposal,
  setEquipmentCapacity,
  suggestedSchedule,
  totalResolvedCount,
  GUIDED_SETUP_BLOCKS,
  type EquipmentEntryV2,
  type GuidedSetupBlock,
  type GuidedSetupV2Answers,
} from "@/lib/model/guided-setup-v2";
import { buildModelInputsFromGuidedSetupV2 } from "@/lib/model/buildModelInputsFromGuidedSetupV2";
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

function useAutofillSafeName(): string {
  return `gsv2-${useId().replace(/[:]/g, "")}`;
}

const KNOWN_PROCESSES: ResourceProcess[] = ["Elaboración", "Envasado", "Codificado"];
const BATCH_PROCESS: ResourceProcess = "Elaboración"; // única etapa por lote soportada en este vertical slice

type StepV2 = "intro" | "products" | "equipment" | "capacities" | "batchTimes" | "staffing" | "schedule" | "materials" | "review";
const STEPS_V2: StepV2[] = ["intro", "products", "equipment", "capacities", "batchTimes", "staffing", "schedule", "materials", "review"];
const BLOCK_BY_STEP: Partial<Record<StepV2, GuidedSetupBlock>> = {
  products: "products",
  equipment: "equipment",
  capacities: "capacities",
  batchTimes: "batchTimes",
  staffing: "staffing",
  schedule: "schedule",
};

function EntryChip({ label, sublabel, onRemove }: { label: string; sublabel?: string; onRemove: () => void }) {
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

function ResolvedBadge() {
  return <span className="rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-bright">Ya tengo esto</span>;
}

// ---------------------------------------------------------------------------
// Intro — entrada libre (modo avanzado). Nunca aplica nada sin confirmación.
// ---------------------------------------------------------------------------
function FreeformIntro({ knownEquipmentNames, onApply }: { knownEquipmentNames: string[]; onApply: (entities: NluEntities) => void }) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingEntities, setPendingEntities] = useState<NluEntities | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const name = useAutofillSafeName();

  async function submit() {
    if (!draft.trim()) return;
    setPending(true);
    setError(null);
    const ai = await interpretWithAI({ text: draft, context: "guided_setup_v2_freeform", knownEquipmentNames });
    setPending(false);
    if (!ai.ok) {
      setError(AI_UNAVAILABLE_MESSAGE);
      return;
    }
    const r = ai.response;
    if (isBlockedStatus(r.status)) {
      setError(buildBlockedMessage(r));
      return;
    }
    setPendingEntities(r.entities);
    setConfirmText(r.interpretedText);
  }

  if (pendingEntities) {
    return (
      <InterpretationCard
        interpretedText={confirmText}
        onConfirm={() => {
          onApply(pendingEntities);
          setDraft("");
          setPendingEntities(null);
        }}
        onEdit={() => setPendingEntities(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-secondary">
        Contame sobre tu laboratorio — podés responder una pregunta a la vez más abajo, o contarme todo de una: qué
        fabricás, qué equipos tenés, cuánto producen, cuántas personas trabajan, el horario... Lo que sepas.
      </p>
      <textarea
        name={name}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder='Ej: "Hacemos cremas y shampoo. Tenemos dos reactores de 500kg, cada batch tarda 3 horas. Llenadora 1 hace 1800 u/h. Trabajamos lunes a viernes de 8 a 17. Somos 10 personas."'
        rows={4}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={pending}
        className="resize-none rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-disabled disabled:opacity-50"
      />
      <div className="flex items-center gap-2">
        <Button type="button" onClick={submit} disabled={pending || !draft.trim()}>
          {pending ? "Interpretando..." : "Contar mi operación"}
        </Button>
        {!draft.trim() && <span className="text-xs text-text-disabled">Opcional — también podés responder bloque por bloque.</span>}
      </div>
      {error && <p className="whitespace-pre-line text-xs text-risk-high">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Equipment — categorías fijas (reactor, llenadora, etiquetadora,
// codificadora, u otra) sobre los 3 procesos conocidos.
// ---------------------------------------------------------------------------
function EquipmentStep({ equipment, onAdd, onRemove }: { equipment: EquipmentEntryV2[]; onAdd: (process: ResourceProcess, category: string, name: string, qty: number) => void; onRemove: (id: string) => void }) {
  const [process, setProcess] = useState<ResourceProcess>("Elaboración");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const qtyFieldName = useAutofillSafeName();

  function submit() {
    const c = category.trim();
    const n = Number(qty);
    if (!c || !Number.isFinite(n) || n <= 0) return;
    onAdd(process, c.toLowerCase(), name.trim(), n);
    setCategory("");
    setName("");
    setQty("1");
  }

  const flow = Array.from(new Set(equipment.map((e) => e.process)));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">¿Qué equipos principales utilizás? (reactor, llenadora, etiquetadora, codificadora, u otro)</p>
      {flow.length > 0 && (
        <p className="text-xs text-text-tertiary">
          Entendí este flujo: <span className="text-accent-bright">{flow.join(" → ")}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {equipment.map((e) => (
          <EntryChip key={e.id} label={e.name} sublabel={`${e.process} · ×${e.quantity}`} onRemove={() => onRemove(e.id)} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={process}
          onChange={(e) => setProcess(e.target.value as ResourceProcess)}
          className="h-11 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none"
        >
          {KNOWN_PROCESSES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Categoría (ej: llenadora)"
          autoComplete="off"
          className="h-11 w-40 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 text-sm text-text-primary outline-none placeholder:text-text-disabled"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre (opcional)"
          autoComplete="off"
          className="h-11 w-40 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 text-sm text-text-primary outline-none placeholder:text-text-disabled"
        />
        <input
          type="number"
          name={qtyFieldName}
          min={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="Cant."
          autoComplete="off"
          className="h-11 w-20 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 text-sm text-text-primary outline-none placeholder:text-text-disabled"
        />
        <Button variant="ghost" type="button" onClick={submit} className="px-3">
          <Plus size={16} />
        </Button>
      </div>
      {equipment.length === 0 && <p className="text-xs text-text-disabled">Podés continuar sin equipos si todavía no lo tenés claro.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reference offer — "No lo sé" -> catálogo, aceptación explícita.
// ---------------------------------------------------------------------------
function ReferenceOffer({ candidate, onAccept }: { candidate: ReferenceCatalogEntry; onAccept: (value: number) => void }) {
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

function CapacitiesStep({ equipment, onSetCapacity }: { equipment: EquipmentEntryV2[]; onSetCapacity: (id: string, value: number, unit: string, source: "company_data" | "reference_estimate") => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [declined, setDeclined] = useState<Record<string, boolean>>({});

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">¿Sabés aproximadamente cuánto produce cada equipo?</p>
      {equipment.length === 0 && <p className="text-xs text-text-disabled">No hay equipos cargados todavía.</p>}
      {equipment.map((e) => {
        const candidates = findReferenceCandidates(REFERENCE_CATALOG, { category: e.category, process: e.process, parameter: "ratePerHour" });
        return (
          <div key={e.id} className="rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-primary">{e.name}</span>
              {e.capacity ? (
                <span className="text-xs text-text-tertiary">
                  {e.capacity.value} {e.capacityUnit} · <span className={e.capacity.source === "company_data" ? "text-text-secondary" : "text-accent-bright"}>{e.capacity.source === "company_data" ? "tu dato" : "referencia"}</span>
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    value={drafts[e.id] ?? ""}
                    onChange={(ev) => setDrafts((d) => ({ ...d, [e.id]: ev.target.value }))}
                    placeholder="u/h"
                    autoComplete="off"
                    className="h-9 w-24 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled"
                  />
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      const v = Number(drafts[e.id]);
                      if (!Number.isFinite(v) || v <= 0) return;
                      onSetCapacity(e.id, v, "u/h", "company_data");
                    }}
                  >
                    Ingresar
                  </Button>
                  <Button variant="ghost" type="button" onClick={() => setDeclined((d) => ({ ...d, [e.id]: true }))}>
                    No lo sé
                  </Button>
                </div>
              )}
            </div>
            {!e.capacity && declined[e.id] && candidates.length > 0 && (
              <ReferenceOffer candidate={candidates[0]} onAccept={(v) => onSetCapacity(e.id, v, candidates[0].unit, "reference_estimate")} />
            )}
            {!e.capacity && declined[e.id] && candidates.length === 0 && (
              <p className="mt-2 text-xs text-text-disabled">Todavía no hay una referencia para &quot;{e.category}&quot; — queda marcado como faltante, nunca en cero.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

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
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary">Cantidad por tanda (en unidades de producto)</p>
        {batchSize ? (
          <p className="mt-1 text-sm text-text-primary">
            {batchSize.value} unidades <span className="text-xs text-text-tertiary">({batchSize.source === "company_data" ? "tu dato" : "referencia"})</span>
          </p>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <input value={amountDraft} onChange={(e) => setAmountDraft(e.target.value)} placeholder="unidades" autoComplete="off" className="h-9 w-28 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled" />
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
  onBack,
  onComplete,
}: {
  companyName: string;
  industry: string;
  onBack: () => void;
  onComplete: (input: RawModelInput, completeness: TwinCompleteness) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS_V2[stepIndex];
  const [answers, setAnswers] = useState<GuidedSetupV2Answers>(emptyGuidedSetupV2Answers());
  const staffingFieldName = useAutofillSafeName();
  const [productDraft, setProductDraft] = useState("");
  const [scheduleOverride, setScheduleOverride] = useState<{ days: string; start: string; end: string } | null>(null);

  const block = BLOCK_BY_STEP[step];
  const isResolvedFromFreeform = block ? answers.resolvedBlocks[block] : false;

  function applyExtraction(entities: NluEntities) {
    setAnswers((prev) => {
      const newProducts = entities.products.filter((p) => !prev.productsRaw.some((existing) => existing.toLowerCase() === p.toLowerCase()));
      const equipment = mergeEquipmentMentions(prev.equipment, equipmentMentionsFromNluEntities(entities));
      const batchInfo = batchInfoMentionsFromNluEntities(entities).reduce((acc, m) => mergeBatchInfoMention(acc, m), prev.batchInfo);
      const scheduleProposal = entities.schedule ? scheduleMentionToProposal(entities.schedule) : null;
      return {
        ...prev,
        productsRaw: [...prev.productsRaw, ...newProducts],
        equipment,
        batchInfo,
        staffingCount: entities.staffingCount ?? prev.staffingCount,
        schedule: scheduleProposal ?? prev.schedule,
        resolvedBlocks: markBlocksResolved(prev.resolvedBlocks, blocksTouchedByExtraction(entities)),
      };
    });
  }

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

  function addEquipment(process: ResourceProcess, category: string, name: string, qty: number) {
    setAnswers((prev) => ({
      ...prev,
      equipment: mergeEquipmentMention(prev.equipment, { name: name || null, process, category, quantity: qty }),
      resolvedBlocks: { ...prev.resolvedBlocks, equipment: true },
    }));
  }
  function removeEquipmentEntry(id: string) {
    setAnswers((prev) => ({ ...prev, equipment: removeEquipment(prev.equipment, id) }));
  }

  function setCapacity(id: string, value: number, unit: string, source: "company_data" | "reference_estimate") {
    setAnswers((prev) => ({ ...prev, equipment: setEquipmentCapacity(prev.equipment, id, value, unit, source), resolvedBlocks: { ...prev.resolvedBlocks, capacities: true } }));
  }

  const batchProcessPresent = answers.equipment.some((e) => e.process === BATCH_PROCESS);
  const batchEntry = answers.batchInfo.find((b) => b.process === BATCH_PROCESS) ?? null;

  function setBatchField(field: "batchSize" | "hoursPerBatch", value: number, source: "company_data" | "reference_estimate") {
    setAnswers((prev) => {
      const current = prev.batchInfo.find((b) => b.process === BATCH_PROCESS);
      const next = { process: BATCH_PROCESS, batchSize: current?.batchSize ?? null, batchUnit: current?.batchUnit ?? ("units" as const), hoursPerBatch: current?.hoursPerBatch ?? null, [field]: { value, source } };
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
    equipment: "Equipos",
    capacities: "Capacidades",
    batchTimes: "Tiempos de tanda",
    staffing: "Personal",
    schedule: "Horario",
    materials: "Materias primas (opcional)",
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-tertiary">
          {step === "intro" ? "Contanos sobre tu laboratorio" : step === "review" ? "Tu operación" : questionLabel[step]}
        </p>
      </div>

      <Guardian state="listening" size={84} />

      <motion.div
        key={step}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="glass-panel w-full max-w-xl rounded-[var(--radius-lg)] p-6"
      >
        {step === "intro" && (
          <FreeformIntro
            knownEquipmentNames={answers.equipment.map((e) => e.name)}
            onApply={(entities) => {
              applyExtraction(entities);
            }}
          />
        )}

        {step === "products" && (
          <div className="flex flex-col gap-4">
            {isResolvedFromFreeform && answers.productsRaw.length > 0 && <ResolvedBadge />}
            <p className="text-sm text-text-secondary">¿Qué fabrica tu laboratorio?</p>
            <div className="flex gap-2">
              <input
                value={productDraft}
                onChange={(e) => setProductDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addProduct();
                  }
                }}
                placeholder="Ej: Protector Solar FPS 50"
                autoComplete="off"
                className="h-11 flex-1 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 text-sm text-text-primary outline-none placeholder:text-text-disabled"
              />
              <Button variant="ghost" type="button" onClick={addProduct} className="px-3">
                <Plus size={16} />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {answers.productsRaw.map((p, i) => (
                <EntryChip key={`${p}-${i}`} label={p} onRemove={() => removeProduct(i)} />
              ))}
            </div>
            {answers.productsRaw.length === 0 && <p className="text-xs text-text-disabled">Cualquier nombre de producto sirve — nunca limitado a un catálogo cerrado.</p>}
          </div>
        )}

        {step === "equipment" && (
          <div className="flex flex-col gap-2">
            {isResolvedFromFreeform && answers.equipment.length > 0 && <ResolvedBadge />}
            <EquipmentStep equipment={answers.equipment} onAdd={addEquipment} onRemove={removeEquipmentEntry} />
          </div>
        )}

        {step === "capacities" && (
          <div className="flex flex-col gap-2">
            <CapacitiesStep equipment={answers.equipment} onSetCapacity={setCapacity} />
          </div>
        )}

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
              <Stat label="Products" value={summary.productsCount} />
              <Stat label="Processes" value={summary.processesCount} />
              <Stat label="Resources" value={summary.resourcesCount} />
              <Stat label="Production staff" value={summary.staffCount ?? "—"} />
              <Stat label="Company Data" value={`${summary.companyDataCount} values`} />
              <Stat label="Reference Estimates" value={`${summary.referenceEstimateCount} values`} />
            </div>
            <p className="text-xs text-text-tertiary">Materials: {summary.materialsConnected ? "Connected" : "Not connected"}</p>
            {summary.referenceEstimateCount > 0 && (
              <div className="rounded-[var(--radius-sm)] border border-accent/25 bg-accent-soft/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-bright">
                  Guardian is using {summary.referenceEstimateCount} reference estimate{summary.referenceEstimateCount !== 1 ? "s" : ""}
                </p>
                <p className="mt-1 text-xs text-text-secondary">Van a quedar identificadas como estimaciones — reemplazalas cuando tengas el dato real.</p>
              </div>
            )}
            <Button onClick={handleBuildTwin} className="mt-2">
              Build My Operational Twin
            </Button>
          </div>
        )}
      </motion.div>

      {step !== "review" && (
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={goBack} className="gap-2">
            <ArrowLeft size={15} />
            Back
          </Button>
          <Button onClick={goNext} className="gap-2">
            Continue
            <ArrowRight size={15} />
          </Button>
          {block && !answers.resolvedBlocks[block] && step !== "intro" && (
            <button type="button" onClick={() => markResolved(block)} className="text-xs text-text-tertiary underline underline-offset-2">
              Skip
            </button>
          )}
        </div>
      )}
      {step === "review" && (
        <Button variant="ghost" onClick={goBack} className="gap-2">
          <ArrowLeft size={15} />
          Back
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
