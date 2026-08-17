"use client";

import { useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Plus, X } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import {
  buildModelInputsFromGuidedSetup,
  matchKnownProduct,
  normalizeProcessName,
  type GuidedSetupAnswers,
  type GuidedSetupCapacityInput,
  type GuidedSetupMaterialInput,
  type GuidedSetupResourceInput,
} from "@/lib/model/buildModelInputsFromGuidedSetup";
import { buildKnownSummaryLine, buildMissingItemsList } from "@/lib/view/guided-setup-view-model";
import type { RawModelInput } from "@/lib/model/buildOperationalModel";
import type { Company, ResourceProcess, TwinCompleteness } from "@/lib/types";
import { INDUSTRY_SUGGESTIONS } from "@/data/industries";
import { InterpretationCard } from "@/components/nlu/InterpretationCard";
import { interpretWithAI } from "@/lib/nlu/client";
import { AI_UNAVAILABLE_MESSAGE, buildBlockedMessage, isBlockedStatus } from "@/lib/nlu/interpretation-view-model";
import type { NluEntities } from "@/lib/nlu/types";
import {
  processEntriesFromNluEntities,
  removeProcessAndDependents,
  removeResourceAndCapacity,
  resourcesFromNluEntities,
} from "@/lib/view/guided-setup-dependency";

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * `autoComplete="off"` solo no alcanza: Chrome decide si autocompletar un
 * campo mirando principalmente su `name`/`id`, no el atributo autocomplete
 * (confirmado en verificación manual — texto de sesiones anteriores
 * apareció solo en campos sin `name`, incluso con autoComplete="off").
 * Un `name` único y no-semántico por campo (vía useId) es la forma robusta
 * de evitarlo, sin depender de hacks frágiles por navegador específico.
 */
function useAutofillSafeName(): string {
  return `gs-${useId().replace(/[:]/g, "")}`;
}

/** Sugerencias de ayuda, nunca una lista cerrada — el usuario puede ignorarlas y guardar su propio texto. */
function filterIndustrySuggestions(query: string): string[] {
  const q = stripAccents(query.trim().toLowerCase());
  if (q.length < 2) return [];
  return INDUSTRY_SUGGESTIONS.filter((s) => stripAccents(s.toLowerCase()).includes(q)).slice(0, 6);
}

type Step = "industry" | "processes" | "order" | "resources" | "capacity" | "staffing" | "products" | "materials" | "review";

const STEPS: Step[] = ["industry", "processes", "order", "resources", "capacity", "staffing", "products", "materials", "review"];
const QUESTION_NUMBER: Partial<Record<Step, number>> = {
  industry: 1,
  processes: 2,
  order: 3,
  resources: 4,
  capacity: 5,
  staffing: 6,
  products: 7,
  materials: 8,
};

/** Chip de texto libre con botón de remove — mismo patrón reusado en Processes/Products (Q2/Q7). */
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

function TextField({
  value,
  onChange,
  placeholder,
  onEnter,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onEnter?: () => void;
  type?: string;
}) {
  const name = useAutofillSafeName();
  return (
    <input
      type={type}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
      placeholder={placeholder}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      className="h-11 flex-1 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 text-sm text-text-primary outline-none placeholder:text-text-disabled focus:border-border-strong"
    />
  );
}

/**
 * ============================================================================
 * Sub-pasos con su propio estado de "borrador" (draft)
 * ============================================================================
 * Cada uno vive DENTRO del `motion.div key={step}` de GuidedSetupScreen, así
 * que React los remonta enteros cada vez que se cambia de pregunta. Eso
 * resetea su draft local automáticamente al volver — sin useEffect, sin
 * lógica de limpieza manual. Las RESPUESTAS ya guardadas (processEntries,
 * resources, etc.) viven en el padre y nunca se pierden con este remount.
 */

/**
 * Bloque de entrada en lenguaje natural, compartido entre Processes y
 * Resources (Etapa 3, Checkpoint 7.5). A diferencia de Ask Guardian, acá
 * SIEMPRE se muestra la card de confirmación antes de aplicar — aunque el
 * status sea "understood" — porque una sola frase puede crear varios
 * chips a la vez; el usuario confirma el lote completo, nunca se aplica
 * en silencio.
 */
function AiAssistBlock({
  context,
  placeholder,
  onApply,
}: {
  context: "guided_setup_process" | "guided_setup_resource";
  placeholder: string;
  onApply: (entities: NluEntities) => void;
}) {
  const [mode, setMode] = useState<"closed" | "input" | "confirm">("closed");
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
    const ai = await interpretWithAI({ text: draft, context });
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
    setMode("confirm");
  }

  if (mode === "closed") {
    return (
      <button
        type="button"
        onClick={() => setMode("input")}
        className="self-start text-xs font-medium text-accent-bright underline underline-offset-2"
      >
        O describilo con tus propias palabras
      </button>
    );
  }

  if (mode === "confirm" && pendingEntities) {
    return (
      <InterpretationCard
        interpretedText={confirmText}
        onConfirm={() => {
          onApply(pendingEntities);
          setMode("closed");
          setDraft("");
          setPendingEntities(null);
        }}
        onEdit={() => setMode("input")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] p-3">
      <textarea
        name={name}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        rows={2}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={pending}
        className="resize-none bg-transparent text-sm text-text-primary outline-none placeholder:text-text-disabled disabled:opacity-50"
      />
      <div className="flex items-center gap-2">
        <Button type="button" onClick={submit} disabled={pending || !draft.trim()}>
          {pending ? "Interpretando..." : "Interpretar"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode("closed")}>
          Cancelar
        </Button>
      </div>
      {error && <p className="text-xs text-risk-high">{error}</p>}
    </div>
  );
}

function ProcessesStep({ entries, onAdd, onRemove }: { entries: string[]; onAdd: (v: string) => void; onRemove: (i: number) => void }) {
  const [draft, setDraft] = useState("");
  function submit() {
    const v = draft.trim();
    if (!v) return;
    onAdd(v);
    setDraft("");
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">¿Qué procesos productivos tiene tu operación? Agregalos uno a la vez.</p>
      <div className="flex gap-2">
        <TextField value={draft} onChange={setDraft} placeholder="Ej: Mezcla, Envasado, Pintura..." onEnter={submit} />
        <Button variant="ghost" type="button" onClick={submit} className="px-3">
          <Plus size={16} />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {entries.map((p, i) => (
          <EntryChip key={`${p}-${i}`} label={p} onRemove={() => onRemove(i)} />
        ))}
      </div>
      {entries.length === 0 && (
        <p className="text-xs text-text-disabled">Podés continuar sin agregar procesos si todavía no lo tenés claro.</p>
      )}
      <AiAssistBlock
        context="guided_setup_process"
        placeholder="Ej: primero mezclamos todo, después lo envasamos y al final lo codificamos"
        onApply={(entities) => {
          for (const label of processEntriesFromNluEntities(entities)) onAdd(label);
        }}
      />
    </div>
  );
}

function ResourceGroup({
  process,
  items,
  onAdd,
  onRemove,
}: {
  process: ResourceProcess;
  items: GuidedSetupResourceInput[];
  onAdd: (process: ResourceProcess, name: string, qty: number) => void;
  onRemove: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const qtyFieldName = useAutofillSafeName();
  function submit() {
    const n = name.trim();
    const q = Number(qty);
    if (!n || !Number.isFinite(q) || q <= 0) return;
    onAdd(process, n, q);
    setName("");
    setQty("");
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-tertiary">{process}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((r) => (
          <EntryChip key={r.name} label={r.name} sublabel={`×${r.quantityAvailable}`} onRemove={() => onRemove(r.name)} />
        ))}
      </div>
      <div className="flex gap-2">
        <TextField value={name} onChange={setName} placeholder="Nombre (ej: Reactor 1)" onEnter={submit} />
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
    </div>
  );
}

function ResourcesStep({
  knownProcessOrder,
  resources,
  onAdd,
  onRemove,
  onApplyAi,
}: {
  knownProcessOrder: ResourceProcess[];
  resources: GuidedSetupResourceInput[];
  onAdd: (process: ResourceProcess, name: string, qty: number) => void;
  onRemove: (name: string) => void;
  onApplyAi: (entities: NluEntities) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-text-secondary">¿Qué máquinas tenés para cada proceso? Nombralas una por una.</p>
      {knownProcessOrder.length === 0 && (
        <p className="text-xs text-text-disabled">
          Todavía no hay procesos reconocidos para pedir máquinas. Podés continuar y volver más tarde.
        </p>
      )}
      {knownProcessOrder.map((process) => (
        <ResourceGroup
          key={process}
          process={process}
          items={resources.filter((r) => r.processRaw === process)}
          onAdd={onAdd}
          onRemove={onRemove}
        />
      ))}
      <AiAssistBlock
        context="guided_setup_resource"
        placeholder="Ej: tengo dos yenedoras una ase 1800 x ora y la otra 1500"
        onApply={onApplyAi}
      />
    </div>
  );
}

function ProductsStep({ entries, onAdd, onRemove }: { entries: string[]; onAdd: (v: string) => void; onRemove: (i: number) => void }) {
  const [draft, setDraft] = useState("");
  function submit() {
    const v = draft.trim();
    if (!v) return;
    onAdd(v);
    setDraft("");
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">¿Qué productos fabricás? Agregalos uno a la vez.</p>
      <div className="flex gap-2">
        <TextField value={draft} onChange={setDraft} placeholder="Ej: Shampoo, Crema, Gel..." onEnter={submit} />
        <Button variant="ghost" type="button" onClick={submit} className="px-3">
          <Plus size={16} />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {entries.map((p, i) => {
          const match = matchKnownProduct(p);
          return <EntryChip key={`${p}-${i}`} label={p} sublabel={match ? "Reference profile" : "No profile yet"} onRemove={() => onRemove(i)} />;
        })}
      </div>
    </div>
  );
}

function MaterialsStep({
  hasInventoryData,
  materialRows,
  onSetHasInventoryData,
  onAdd,
  onRemove,
}: {
  hasInventoryData: boolean | null;
  materialRows: GuidedSetupMaterialInput[];
  onSetHasInventoryData: (v: boolean) => void;
  onAdd: (row: GuidedSetupMaterialInput) => void;
  onRemove: (code: string) => void;
}) {
  const [draft, setDraft] = useState({ code: "", name: "", quantity: "", unit: "" });
  const codeFieldName = useAutofillSafeName();
  const nameFieldName = useAutofillSafeName();
  const quantityFieldName = useAutofillSafeName();
  const unitFieldName = useAutofillSafeName();
  function submit() {
    const { code, name, quantity, unit } = draft;
    const qty = Number(quantity);
    if (!code.trim() || !name.trim() || !Number.isFinite(qty) || qty < 0 || !unit.trim()) return;
    onAdd({ code: code.trim(), name: name.trim(), quantity: qty, unit: unit.trim() });
    setDraft({ code: "", name: "", quantity: "", unit: "" });
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">¿Tenés datos de inventario de materia prima?</p>
      <div className="flex gap-2">
        <Button variant={hasInventoryData === true ? "primary" : "ghost"} type="button" onClick={() => onSetHasInventoryData(true)}>
          Sí, lo tengo
        </Button>
        <Button variant={hasInventoryData === false ? "primary" : "ghost"} type="button" onClick={() => onSetHasInventoryData(false)}>
          No lo tengo ahora
        </Button>
      </div>
      {hasInventoryData === true && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {materialRows.map((m) => (
              <EntryChip key={m.code} label={`${m.code} · ${m.name}`} sublabel={`${m.quantity} ${m.unit}`} onRemove={() => onRemove(m.code)} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              name={codeFieldName}
              value={draft.code}
              onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
              placeholder="Código"
              autoComplete="off"
              className="h-10 w-24 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled"
            />
            <input
              name={nameFieldName}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Nombre"
              autoComplete="off"
              className="h-10 w-36 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled"
            />
            <input
              type="number"
              name={quantityFieldName}
              value={draft.quantity}
              onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
              placeholder="Cant."
              autoComplete="off"
              className="h-10 w-20 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled"
            />
            <input
              name={unitFieldName}
              value={draft.unit}
              onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
              placeholder="Unidad"
              autoComplete="off"
              className="h-10 w-20 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled"
            />
            <Button variant="ghost" type="button" onClick={submit} className="px-3">
              <Plus size={16} />
            </Button>
          </div>
        </div>
      )}
      {hasInventoryData === false && (
        <p className="text-xs text-text-disabled">Sin problema — lo vamos a marcar como dato faltante, nunca como stock en cero.</p>
      )}
    </div>
  );
}

export function GuidedSetupScreen({
  companyName,
  industry: initialIndustry,
  onBack,
  onComplete,
}: {
  companyName: string;
  industry: string;
  onBack: () => void;
  onComplete: (input: RawModelInput, completeness: TwinCompleteness) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
  /** Aviso visible cuando quitar un proceso elimina recursos dependientes (Etapa 7) — nunca una inconsistencia invisible. */
  const [dependencyNotice, setDependencyNotice] = useState<string | null>(null);

  /**
   * industryRaw es siempre exactamente lo que el usuario escribió — nunca se
   * sobrescribe en silencio. industryNormalized solo se completa cuando el
   * usuario elige explícitamente una sugerencia del combobox; si después
   * sigue editando el texto a mano, se limpia (ya no representa con certeza
   * lo que escribió). Ver companyIndustry más abajo para cómo se combinan.
   */
  const [industryRaw, setIndustryRaw] = useState(initialIndustry);
  const [industryNormalized, setIndustryNormalized] = useState<string | null>(null);
  const [showIndustrySuggestions, setShowIndustrySuggestions] = useState(false);
  const [industryAiPending, setIndustryAiPending] = useState(false);
  /** Interpretación de industria a confirmar — nunca se aplica sin este paso. */
  const [industryAiConfirm, setIndustryAiConfirm] = useState<{ normalized: string } | null>(null);
  const industryFieldName = useAutofillSafeName();
  const staffingFieldName = useAutofillSafeName();

  // Respuestas durables — sobreviven Back/Forward sin cambios. Los borradores
  // efímeros (lo que se está tipando para agregar) viven en los sub-pasos de
  // arriba, no acá.
  const [processEntries, setProcessEntries] = useState<string[]>([]);
  const [resources, setResources] = useState<GuidedSetupResourceInput[]>([]);
  const [capacityByResource, setCapacityByResource] = useState<Record<string, { value: string; unit: string; unknown: boolean }>>({});
  const [staffingNote, setStaffingNote] = useState("");
  const [productEntries, setProductEntries] = useState<string[]>([]);
  const [hasInventoryData, setHasInventoryData] = useState<boolean | null>(null);
  const [materialRows, setMaterialRows] = useState<GuidedSetupMaterialInput[]>([]);

  const knownProcessOrder = useMemo(() => {
    const seen = new Set<ResourceProcess>();
    const list: ResourceProcess[] = [];
    for (const raw of processEntries) {
      const p = normalizeProcessName(raw);
      if (p && !seen.has(p)) {
        seen.add(p);
        list.push(p);
      }
    }
    return list;
  }, [processEntries]);

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }
  /**
   * Continue en la pregunta de industria dispara la IA solo en ese momento
   * (nunca tecla por tecla) — únicamente si el usuario nunca eligió una
   * sugerencia del combobox. Si la IA no está disponible o no puede
   * normalizar el texto, avanza igual con el texto libre tal cual.
   */
  async function handleContinue() {
    if (step === "industry" && !industryNormalized && industryRaw.trim().length > 0) {
      setIndustryAiPending(true);
      const ai = await interpretWithAI({ text: industryRaw, context: "guided_setup_industry" });
      setIndustryAiPending(false);
      if (ai.ok && !isBlockedStatus(ai.response.status)) {
        const normalized = ai.response.entities.industry?.normalized;
        if (normalized && normalized.trim().toLowerCase() !== industryRaw.trim().toLowerCase()) {
          setIndustryAiConfirm({ normalized });
          return;
        }
      }
    }
    goNext();
  }
  function goBack() {
    if (stepIndex === 0) {
      onBack();
      return;
    }
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function addProcessEntry(v: string) {
    setProcessEntries((prev) => [...prev, v]);
  }
  /**
   * Quitar un proceso invalida cualquier recurso que dependía de él —
   * nunca queda una máquina apuntando a un proceso que ya no existe
   * (Etapa 7). `dependencyNotice` hace visible el efecto secundario en vez
   * de dejarlo pasar en silencio.
   */
  function removeProcess(i: number) {
    const result = removeProcessAndDependents(processEntries, resources, i);
    setProcessEntries(result.processEntries);
    setResources(result.resources);
    if (result.removedResourceNames.length > 0) {
      setDependencyNotice(
        `Se ${result.removedResourceNames.length === 1 ? "quitó" : "quitaron"} ${result.removedResourceNames.join(", ")} — ya no correspond${result.removedResourceNames.length === 1 ? "e" : "en"} a ningún proceso.`,
      );
      setCapacityByResource((prev) => {
        const next = { ...prev };
        for (const name of result.removedResourceNames) delete next[name];
        return next;
      });
    }
  }
  function moveProcess(i: number, dir: -1 | 1) {
    setProcessEntries((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function addResourceEntry(process: ResourceProcess, name: string, qty: number) {
    setResources((prev) => [...prev, { name, processRaw: process, quantityAvailable: qty }]);
  }
  /**
   * Aplica recursos extraídos por la IA de una sola frase (ej. "tengo dos
   * yenedoras..."). Un recurso sin proceso reconocido NUNCA se crea — se
   * pierde silenciosamente acá porque ya fue reportado como unsupported en
   * la respuesta de la IA; forzar un proceso sería exactamente el tipo de
   * invención que este checkpoint prohíbe.
   */
  function applyAiResources(entities: NluEntities) {
    for (const item of resourcesFromNluEntities(entities)) {
      addResourceEntry(item.process, item.name, item.quantity);
      if (item.capacity) {
        setCapacityByResource((prev) => ({ ...prev, [item.name]: item.capacity! }));
      }
    }
  }
  /** Quitar un recurso invalida su capacidad — nunca queda una capacidad guardada bajo un nombre que ya no existe (Etapa 7). */
  function removeResource(name: string) {
    const result = removeResourceAndCapacity(resources, capacityByResource, name);
    setResources(result.resources);
    setCapacityByResource(result.capacityByResource);
  }

  function addProductEntry(v: string) {
    setProductEntries((prev) => [...prev, v]);
  }
  function removeProduct(i: number) {
    setProductEntries((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addMaterialRow(row: GuidedSetupMaterialInput) {
    setMaterialRows((prev) => [...prev, row]);
  }
  function removeMaterialRow(code: string) {
    setMaterialRows((prev) => prev.filter((m) => m.code !== code));
  }

  function buildAnswers(): GuidedSetupAnswers {
    const capacities: GuidedSetupCapacityInput[] = resources.map((r) => {
      const c = capacityByResource[r.name];
      if (!c || c.unknown || c.value.trim() === "") return { resourceName: r.name, value: null, unit: null };
      const value = Number(c.value);
      return { resourceName: r.name, value: Number.isFinite(value) ? value : null, unit: c.unit.trim() || null };
    });
    return {
      industry: industryRaw,
      processesRaw: processEntries,
      resources,
      capacities,
      staffingNote: staffingNote.trim() || undefined,
      productsRaw: productEntries,
      materials: hasInventoryData ? materialRows : null,
    };
  }

  // Preferimos el rubro confirmado (elegido explícitamente de las sugerencias)
  // cuando existe; si el usuario nunca eligió una sugerencia, su texto libre
  // sigue siendo perfectamente válido como Company.industry.
  const companyIndustry = industryNormalized ?? industryRaw;

  const { completeness } = useMemo(() => {
    if (step !== "review") return { completeness: null };
    return buildModelInputsFromGuidedSetup(buildAnswers(), { name: companyName, industry: companyIndustry } as Company);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function handleBuildTwin() {
    const { input, completeness } = buildModelInputsFromGuidedSetup(buildAnswers(), {
      name: companyName,
      industry: companyIndustry,
    });
    onComplete(input, completeness);
  }

  const questionNumber = QUESTION_NUMBER[step];

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-tertiary">
          {questionNumber ? `Question ${questionNumber} of 8` : "Review"}
        </p>
      </div>

      <Guardian state="listening" size={84} />

      {dependencyNotice && (
        <div className="flex w-full max-w-xl items-start justify-between gap-3 rounded-[var(--radius-sm)] border border-risk-medium/30 bg-risk-medium-soft px-4 py-3 text-sm text-risk-medium">
          <span>{dependencyNotice}</span>
          <button
            type="button"
            onClick={() => setDependencyNotice(null)}
            aria-label="Cerrar aviso"
            className="shrink-0 text-risk-medium/70 hover:text-risk-medium"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <motion.div
        key={step}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="glass-panel w-full max-w-xl rounded-[var(--radius-lg)] p-6"
      >
        {step === "industry" && industryAiConfirm && (
          <InterpretationCard
            interpretedText={`Creo que entendí que tu empresa pertenece al rubro: ${industryAiConfirm.normalized} — tu respuesta original fue: "${industryRaw}"`}
            onConfirm={() => {
              setIndustryNormalized(industryAiConfirm.normalized);
              setIndustryAiConfirm(null);
              goNext();
            }}
            onEdit={() => setIndustryAiConfirm(null)}
          />
        )}

        {step === "industry" && !industryAiConfirm && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">
              ¿A qué se dedica tu empresa? Escribilo con tus propias palabras — no hace falta elegir de una lista.
            </p>
            <div className="relative">
              <input
                type="text"
                name={industryFieldName}
                value={industryRaw}
                onChange={(e) => {
                  setIndustryRaw(e.target.value);
                  setIndustryNormalized(null);
                  setShowIndustrySuggestions(true);
                }}
                onFocus={() => setShowIndustrySuggestions(true)}
                onBlur={() => setShowIndustrySuggestions(false)}
                placeholder="Ej: fabricación artesanal de kayaks"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={industryAiPending}
                className="h-11 w-full rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 text-sm text-text-primary outline-none placeholder:text-text-disabled focus:border-border-strong disabled:opacity-50"
              />
              {showIndustrySuggestions && filterIndustrySuggestions(industryRaw).length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-sm)] border border-border-default bg-bg-surface shadow-lg">
                  {filterIndustrySuggestions(industryRaw).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setIndustryRaw(s);
                        setIndustryNormalized(s);
                        setShowIndustrySuggestions(false);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-white/[0.05]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {industryNormalized && (
              <p className="text-xs text-text-tertiary">
                Guardado como <span className="text-accent-bright">{industryNormalized}</span>
              </p>
            )}
            {industryAiPending && <p className="text-xs text-text-tertiary">Interpretando tu respuesta...</p>}
          </div>
        )}

        {step === "processes" && <ProcessesStep entries={processEntries} onAdd={addProcessEntry} onRemove={removeProcess} />}

        {step === "order" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">
              ¿En qué orden fluye la producción por estos procesos? Reordená si hace falta.
            </p>
            <div className="flex flex-col gap-2">
              {processEntries.map((p, i) => {
                const normalized = normalizeProcessName(p);
                return (
                  <div key={`${p}-${i}`} className="flex items-center justify-between rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 py-2">
                    <span className="text-sm text-text-primary">
                      {i + 1}. {p}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${normalized ? "text-accent-bright" : "text-text-disabled"}`}>
                        {normalized ?? "Not supported yet"}
                      </span>
                      <button type="button" onClick={() => moveProcess(i, -1)} disabled={i === 0} className="text-text-tertiary disabled:opacity-30">
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveProcess(i, 1)}
                        disabled={i === processEntries.length - 1}
                        className="text-text-tertiary disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                );
              })}
              {processEntries.length === 0 && <p className="text-xs text-text-disabled">No agregaste procesos todavía.</p>}
            </div>
          </div>
        )}

        {step === "resources" && (
          <ResourcesStep
            knownProcessOrder={knownProcessOrder}
            resources={resources}
            onAdd={addResourceEntry}
            onRemove={removeResource}
            onApplyAi={applyAiResources}
          />
        )}

        {step === "capacity" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">
              ¿Cuál es la capacidad de cada máquina? Si no la sabés, marcá &quot;No lo sé&quot; — nunca asumimos que es cero.
            </p>
            {resources.length === 0 && <p className="text-xs text-text-disabled">No hay máquinas cargadas todavía.</p>}
            {resources.map((r) => {
              const c = capacityByResource[r.name] ?? { value: "", unit: "", unknown: false };
              return (
                <div key={r.name} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 truncate text-sm text-text-primary">{r.name}</span>
                  <input
                    type="number"
                    name={`gs-capacity-value-${r.name}`}
                    disabled={c.unknown}
                    value={c.value}
                    onChange={(e) => setCapacityByResource((prev) => ({ ...prev, [r.name]: { ...c, value: e.target.value } }))}
                    placeholder="Capacidad"
                    autoComplete="off"
                    className="h-10 w-24 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled disabled:opacity-40"
                  />
                  <input
                    type="text"
                    name={`gs-capacity-unit-${r.name}`}
                    disabled={c.unknown}
                    value={c.unit}
                    onChange={(e) => setCapacityByResource((prev) => ({ ...prev, [r.name]: { ...c, unit: e.target.value } }))}
                    placeholder="Unidad"
                    autoComplete="off"
                    className="h-10 w-28 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled disabled:opacity-40"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCapacityByResource((prev) => ({
                        ...prev,
                        // Al marcar "No lo sé" se limpia el valor tipeado — el campo deshabilitado
                        // nunca debe seguir mostrando un número que ya no representa la respuesta
                        // real (eso es exactamente la confusión "desconocido" vs "cero" que hay
                        // que evitar). Al desmarcar, arranca en blanco para una respuesta fresca.
                        [r.name]: { value: "", unit: "", unknown: !c.unknown },
                      }))
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      c.unknown ? "border-accent bg-accent-soft text-accent-bright" : "border-border-default text-text-tertiary"
                    }`}
                  >
                    No lo sé
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {step === "staffing" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">
              ¿Cómo es tu dotación de personal? Es solo contexto — no afecta el cálculo de capacidad.
            </p>
            <textarea
              name={staffingFieldName}
              value={staffingNote}
              onChange={(e) => setStaffingNote(e.target.value)}
              placeholder="Ej: 2 operarios por turno, 3 turnos rotativos..."
              rows={3}
              autoComplete="off"
              className="resize-none rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-disabled"
            />
          </div>
        )}

        {step === "products" && <ProductsStep entries={productEntries} onAdd={addProductEntry} onRemove={removeProduct} />}

        {step === "materials" && (
          <MaterialsStep
            hasInventoryData={hasInventoryData}
            materialRows={materialRows}
            onSetHasInventoryData={setHasInventoryData}
            onAdd={addMaterialRow}
            onRemove={removeMaterialRow}
          />
        )}

        {step === "review" && completeness && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">Esto es lo que entendí de {companyName}:</p>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-tertiary">Known</p>
              <p className="mt-1 text-sm text-text-primary">{buildKnownSummaryLine(completeness)}</p>
            </div>
            {buildMissingItemsList(completeness).length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-tertiary">Missing</p>
                <ul className="mt-1 list-inside list-disc text-sm text-text-secondary">
                  {buildMissingItemsList(completeness).map((item, i) => (
                    <li key={`${item}-${i}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            <Button onClick={handleBuildTwin} className="mt-2">
              Build Initial Twin
            </Button>
          </div>
        )}
      </motion.div>

      {step !== "review" && !industryAiConfirm && (
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={goBack} disabled={industryAiPending} className="gap-2">
            <ArrowLeft size={15} />
            Back
          </Button>
          <Button onClick={handleContinue} disabled={industryAiPending} className="gap-2">
            {industryAiPending ? "Interpretando..." : "Continue"}
            <ArrowRight size={15} />
          </Button>
        </div>
      )}
      {step === "review" && (
        <Button variant="ghost" onClick={goBack} className="gap-2">
          <ArrowLeft size={15} />
          Back
        </Button>
      )}
    </div>
  );
}
