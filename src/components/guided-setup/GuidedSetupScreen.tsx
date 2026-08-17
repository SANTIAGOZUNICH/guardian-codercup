"use client";

import { useMemo, useState } from "react";
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
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
      placeholder={placeholder}
      className="h-11 flex-1 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 text-sm text-text-primary outline-none placeholder:text-text-disabled focus:border-border-strong"
    />
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

  const [industry, setIndustry] = useState(initialIndustry);

  const [processEntries, setProcessEntries] = useState<string[]>([]);
  const [processDraft, setProcessDraft] = useState("");

  const [resources, setResources] = useState<GuidedSetupResourceInput[]>([]);
  const [resourceDrafts, setResourceDrafts] = useState<Record<string, { name: string; qty: string }>>({});

  const [capacityByResource, setCapacityByResource] = useState<Record<string, { value: string; unit: string; unknown: boolean }>>({});

  const [staffingNote, setStaffingNote] = useState("");

  const [productEntries, setProductEntries] = useState<string[]>([]);
  const [productDraft, setProductDraft] = useState("");

  const [hasInventoryData, setHasInventoryData] = useState<boolean | null>(null);
  const [materialRows, setMaterialRows] = useState<GuidedSetupMaterialInput[]>([]);
  const [materialDraft, setMaterialDraft] = useState({ code: "", name: "", quantity: "", unit: "" });

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
  function goBack() {
    if (stepIndex === 0) {
      onBack();
      return;
    }
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function addProcess() {
    const v = processDraft.trim();
    if (!v) return;
    setProcessEntries((prev) => [...prev, v]);
    setProcessDraft("");
  }
  function removeProcess(i: number) {
    const removed = processEntries[i];
    setProcessEntries((prev) => prev.filter((_, idx) => idx !== i));
    // Los recursos ya cargados para un proceso que se quita también se limpian —
    // nunca dejar recursos "huérfanos" apuntando a un proceso que el usuario retiró.
    const p = normalizeProcessName(removed);
    if (p) setResources((prev) => prev.filter((r) => normalizeProcessName(r.processRaw) !== p));
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

  function addResource(process: ResourceProcess) {
    const draft = resourceDrafts[process] ?? { name: "", qty: "" };
    const name = draft.name.trim();
    const qty = Number(draft.qty);
    if (!name || !Number.isFinite(qty) || qty <= 0) return;
    setResources((prev) => [...prev, { name, processRaw: process, quantityAvailable: qty }]);
    setResourceDrafts((prev) => ({ ...prev, [process]: { name: "", qty: "" } }));
  }
  function removeResource(name: string) {
    setResources((prev) => prev.filter((r) => r.name !== name));
    setCapacityByResource((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function addProduct() {
    const v = productDraft.trim();
    if (!v) return;
    setProductEntries((prev) => [...prev, v]);
    setProductDraft("");
  }
  function removeProduct(i: number) {
    setProductEntries((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addMaterialRow() {
    const { code, name, quantity, unit } = materialDraft;
    const qty = Number(quantity);
    if (!code.trim() || !name.trim() || !Number.isFinite(qty) || qty < 0 || !unit.trim()) return;
    setMaterialRows((prev) => [...prev, { code: code.trim(), name: name.trim(), quantity: qty, unit: unit.trim() }]);
    setMaterialDraft({ code: "", name: "", quantity: "", unit: "" });
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
      industry,
      processesRaw: processEntries,
      resources,
      capacities,
      staffingNote: staffingNote.trim() || undefined,
      productsRaw: productEntries,
      materials: hasInventoryData ? materialRows : null,
    };
  }

  const { completeness } = useMemo(() => {
    if (step !== "review") return { completeness: null };
    return buildModelInputsFromGuidedSetup(buildAnswers(), { name: companyName, industry } as Company);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function handleBuildTwin() {
    const { input, completeness } = buildModelInputsFromGuidedSetup(buildAnswers(), { name: companyName, industry });
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

      <motion.div
        key={step}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="glass-panel w-full max-w-xl rounded-[var(--radius-lg)] p-6"
      >
        {step === "industry" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">¿A qué industria pertenece tu operación?</p>
            <TextField value={industry} onChange={setIndustry} placeholder="Ej: Cosméticos" />
          </div>
        )}

        {step === "processes" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">
              ¿Qué procesos productivos tiene tu operación? Agregalos uno a la vez.
            </p>
            <div className="flex gap-2">
              <TextField value={processDraft} onChange={setProcessDraft} placeholder="Ej: Mezcla, Envasado, Pintura..." onEnter={addProcess} />
              <Button variant="ghost" type="button" onClick={addProcess} className="px-3">
                <Plus size={16} />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {processEntries.map((p, i) => (
                <EntryChip key={`${p}-${i}`} label={p} onRemove={() => removeProcess(i)} />
              ))}
            </div>
            {processEntries.length === 0 && (
              <p className="text-xs text-text-disabled">
                Podés continuar sin agregar procesos si todavía no lo tenés claro.
              </p>
            )}
          </div>
        )}

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
          <div className="flex flex-col gap-5">
            <p className="text-sm text-text-secondary">¿Qué máquinas tenés para cada proceso? Nombralas una por una.</p>
            {knownProcessOrder.length === 0 && (
              <p className="text-xs text-text-disabled">
                Todavía no hay procesos reconocidos para pedir máquinas. Podés continuar y volver más tarde.
              </p>
            )}
            {knownProcessOrder.map((process) => {
              const draft = resourceDrafts[process] ?? { name: "", qty: "" };
              const items = resources.filter((r) => r.processRaw === process);
              return (
                <div key={process} className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-tertiary">{process}</p>
                  <div className="flex flex-wrap gap-2">
                    {items.map((r) => (
                      <EntryChip key={r.name} label={r.name} sublabel={`×${r.quantityAvailable}`} onRemove={() => removeResource(r.name)} />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <TextField value={draft.name} onChange={(v) => setResourceDrafts((prev) => ({ ...prev, [process]: { ...draft, name: v } }))} placeholder="Nombre (ej: Reactor 1)" />
                    <input
                      type="number"
                      min={1}
                      value={draft.qty}
                      onChange={(e) => setResourceDrafts((prev) => ({ ...prev, [process]: { ...draft, qty: e.target.value } }))}
                      placeholder="Cant."
                      className="h-11 w-20 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 text-sm text-text-primary outline-none placeholder:text-text-disabled"
                    />
                    <Button variant="ghost" type="button" onClick={() => addResource(process)} className="px-3">
                      <Plus size={16} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
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
                    disabled={c.unknown}
                    value={c.value}
                    onChange={(e) => setCapacityByResource((prev) => ({ ...prev, [r.name]: { ...c, value: e.target.value } }))}
                    placeholder="Capacidad"
                    className="h-10 w-24 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled disabled:opacity-40"
                  />
                  <input
                    type="text"
                    disabled={c.unknown}
                    value={c.unit}
                    onChange={(e) => setCapacityByResource((prev) => ({ ...prev, [r.name]: { ...c, unit: e.target.value } }))}
                    placeholder="Unidad"
                    className="h-10 w-28 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled disabled:opacity-40"
                  />
                  <button
                    type="button"
                    onClick={() => setCapacityByResource((prev) => ({ ...prev, [r.name]: { ...c, unknown: !c.unknown } }))}
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
              value={staffingNote}
              onChange={(e) => setStaffingNote(e.target.value)}
              placeholder="Ej: 2 operarios por turno, 3 turnos rotativos..."
              rows={3}
              className="resize-none rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-disabled"
            />
          </div>
        )}

        {step === "products" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">¿Qué productos fabricás? Agregalos uno a la vez.</p>
            <div className="flex gap-2">
              <TextField value={productDraft} onChange={setProductDraft} placeholder="Ej: Shampoo, Crema, Gel..." onEnter={addProduct} />
              <Button variant="ghost" type="button" onClick={addProduct} className="px-3">
                <Plus size={16} />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {productEntries.map((p, i) => {
                const match = matchKnownProduct(p);
                return <EntryChip key={`${p}-${i}`} label={p} sublabel={match ? "Reference profile" : "No profile yet"} onRemove={() => removeProduct(i)} />;
              })}
            </div>
          </div>
        )}

        {step === "materials" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">¿Tenés datos de inventario de materia prima?</p>
            <div className="flex gap-2">
              <Button variant={hasInventoryData === true ? "primary" : "ghost"} type="button" onClick={() => setHasInventoryData(true)}>
                Sí, lo tengo
              </Button>
              <Button variant={hasInventoryData === false ? "primary" : "ghost"} type="button" onClick={() => setHasInventoryData(false)}>
                No lo tengo ahora
              </Button>
            </div>
            {hasInventoryData === true && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {materialRows.map((m) => (
                    <EntryChip key={m.code} label={`${m.code} · ${m.name}`} sublabel={`${m.quantity} ${m.unit}`} onRemove={() => removeMaterialRow(m.code)} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input value={materialDraft.code} onChange={(e) => setMaterialDraft((d) => ({ ...d, code: e.target.value }))} placeholder="Código" className="h-10 w-24 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled" />
                  <input value={materialDraft.name} onChange={(e) => setMaterialDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Nombre" className="h-10 w-36 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled" />
                  <input type="number" value={materialDraft.quantity} onChange={(e) => setMaterialDraft((d) => ({ ...d, quantity: e.target.value }))} placeholder="Cant." className="h-10 w-20 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled" />
                  <input value={materialDraft.unit} onChange={(e) => setMaterialDraft((d) => ({ ...d, unit: e.target.value }))} placeholder="Unidad" className="h-10 w-20 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled" />
                  <Button variant="ghost" type="button" onClick={addMaterialRow} className="px-3">
                    <Plus size={16} />
                  </Button>
                </div>
              </div>
            )}
            {hasInventoryData === false && (
              <p className="text-xs text-text-disabled">
                Sin problema — lo vamos a marcar como dato faltante, nunca como stock en cero.
              </p>
            )}
          </div>
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
