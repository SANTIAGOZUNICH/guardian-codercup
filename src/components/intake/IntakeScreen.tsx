"use client";

import { useState } from "react";
import { ArrowRight, Check, FileSpreadsheet, FlaskConical, ListChecks, MessageCircle, Upload } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { GuardianLogo } from "@/components/ui/GuardianLogo";
import { Button } from "@/components/ui/Button";
import { InterpretationCard } from "@/components/nlu/InterpretationCard";
import { interpretWithAI } from "@/lib/nlu/client";
import { AI_UNAVAILABLE_MESSAGE, buildBlockedMessage, isBlockedStatus } from "@/lib/nlu/interpretation-view-model";
import type { NluEntities } from "@/lib/nlu/types";
import { applyNluExtraction, emptyGuidedSetupV2Answers, totalResolvedCount, type GuidedSetupV2Answers } from "@/lib/model/guided-setup-v2";
import { INTAKE_STEP_NUMBER, TOTAL_ONBOARDING_STEPS } from "@/lib/model/guided-setup-progress";
import { ExcelParseError, parseInventarioFile, parsePedidosWithProductNames, parseRecursosFile } from "@/lib/parsing/parseExcel";
import { buildOperationalModel } from "@/lib/model/buildOperationalModel";
import { buildDemoModel } from "@/data/production-profiles";
import { formatNaive } from "@/lib/engine/evaluate-scenario";
import { DEMO_SNAPSHOT_AT } from "@/data/operations-reference";
import { cn } from "@/lib/cn";
import type { OperationalModel } from "@/lib/types";

const SLOTS = [
  { key: "pedidos", label: "Pedidos.xlsx", file: "Pedidos_Guardian_Demo.xlsx" },
  { key: "inventario", label: "Inventario.xlsx", file: "Inventario_Guardian_Demo.xlsx" },
  { key: "recursos", label: "Recursos.xlsx", file: "Recursos_Guardian_Demo.xlsx" },
] as const;
type SlotKey = (typeof SLOTS)[number]["key"];

/**
 * Pantalla 2 — "Contanos sobre tu laboratorio" (Visual Checkpoint 2B).
 * Reemplaza a OnboardingScreen (bienvenida sin decisión) + EntryChoiceScreen
 * (elegir Import vs Guided Setup): ahora es un único punto de entrada con
 * 3 caminos que pueden combinarse — texto libre, archivos, preguntas
 * guiadas — más el acceso a datos demo. Texto libre reusa exactamente la
 * misma extracción NLU que antes vivía en el step "intro" de Guided Setup
 * (`applyNluExtraction`, movida a `guided-setup-v2.ts` para que ambos
 * lugares compartan una sola implementación). Archivos reusa el importador
 * real de 3 planillas (`parseExcel.ts` + `buildOperationalModel`) — nunca
 * se ofrece un formato que la app no sabe leer.
 */
export function IntakeScreen({
  companyName,
  industry,
  onModelReady,
  onStartGuidedSetup,
}: {
  companyName: string;
  industry: string;
  onModelReady: (model: OperationalModel, snapshotAt: string) => void;
  onStartGuidedSetup: (initialAnswers: GuidedSetupV2Answers) => void;
}) {
  const [answers, setAnswers] = useState<GuidedSetupV2Answers>(emptyGuidedSetupV2Answers());
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [nluError, setNluError] = useState<string | null>(null);
  const [pendingEntities, setPendingEntities] = useState<NluEntities | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const [files, setFiles] = useState<Partial<Record<SlotKey, File>>>({});
  const [buildError, setBuildError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const allFilesPresent = SLOTS.every((s) => files[s.key]);
  const hasFreeformProgress = totalResolvedCount(answers.resolvedBlocks) > 0;

  async function submitFreeform() {
    if (!draft.trim()) return;
    setPending(true);
    setNluError(null);
    const ai = await interpretWithAI({
      text: draft,
      context: "guided_setup_v2_freeform",
      knownEquipmentNames: answers.equipment.map((e) => e.name),
    });
    setPending(false);
    if (!ai.ok) {
      setNluError(AI_UNAVAILABLE_MESSAGE);
      return;
    }
    if (isBlockedStatus(ai.response.status)) {
      setNluError(buildBlockedMessage(ai.response));
      return;
    }
    setPendingEntities(ai.response.entities);
    setConfirmText(ai.response.interpretedText);
  }

  async function buildFromBuffers(buffers: Record<SlotKey, ArrayBuffer>, snapshotAt: string, useDemoReference: boolean) {
    setBuildError(null);
    setBuilding(true);
    try {
      const { orders, productNames } = parsePedidosWithProductNames(buffers.pedidos);
      const { materials, inventory } = parseInventarioFile(buffers.inventario);
      const resources = parseRecursosFile(buffers.recursos);
      const rawInput = { company: { name: companyName, industry }, orders, productNames, materials, inventory, resources };
      const model = useDemoReference ? buildDemoModel(rawInput) : buildOperationalModel(rawInput);
      onModelReady(model, snapshotAt);
    } catch (e) {
      setBuildError(e instanceof ExcelParseError ? e.message : "No se pudo leer alguno de los archivos.");
      setBuilding(false);
    }
  }

  async function handleBuildFromFiles() {
    if (!allFilesPresent) return;
    const entries = await Promise.all(SLOTS.map(async (s) => [s.key, await files[s.key]!.arrayBuffer()] as const));
    await buildFromBuffers(Object.fromEntries(entries) as Record<SlotKey, ArrayBuffer>, formatNaive(new Date()), false);
  }

  async function handleUseDemoData() {
    setBuildError(null);
    setBuilding(true);
    try {
      const entries = await Promise.all(
        SLOTS.map(async (s) => {
          const res = await fetch(`/demo/${s.file}`);
          if (!res.ok) throw new Error(`No se pudo cargar ${s.file}`);
          return [s.key, await res.arrayBuffer()] as const;
        }),
      );
      await buildFromBuffers(Object.fromEntries(entries) as Record<SlotKey, ArrayBuffer>, DEMO_SNAPSHOT_AT, true);
    } catch {
      setBuildError("No se pudieron cargar los archivos de demo.");
      setBuilding(false);
    }
  }

  return (
    <div className="relative flex min-h-screen w-full flex-1 items-start justify-center overflow-hidden px-6 py-4 lg:items-center lg:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[38%] h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-[130px] lg:left-[22%]"
        style={{ background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 grid w-full max-w-[1300px] grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_2fr] lg:gap-12">
        {/* ============================== IZQUIERDA — Branding + Guardian ============================== */}
        <div className="flex flex-col items-center text-center lg:sticky lg:top-10 lg:items-start lg:text-left">
          <div className="flex items-center gap-3">
            <GuardianLogo size={34} />
            <div>
              <p className="text-base font-bold tracking-[0.08em] text-text-primary">GUARDIAN</p>
              <p className="text-[9px] font-semibold uppercase tracking-[0.26em] text-accent-bright">Tu operación. Bajo control.</p>
            </div>
          </div>

          <h1 className="mt-8 max-w-xs text-[26px] font-semibold leading-[1.25] tracking-tight text-text-primary">
            Contanos sobre
            <br />
            tu <span className="text-accent-bright">laboratorio.</span>
          </h1>

          <p className="mt-3 max-w-xs text-sm leading-relaxed text-text-secondary">
            Elegí la forma que más te convenga para que Guardian entienda tu operación y construya el modelo perfecto para vos.
          </p>

          <div className="my-6">
            <Guardian state="listening" size={240} variant="asset" companyName={companyName} />
          </div>

          <div className="w-full max-w-xs rounded-[var(--radius-lg)] border border-border-default bg-bg-elevated p-4 text-left">
            <p className="text-xs font-semibold text-accent-bright">Guardian es tu asistente IA.</p>
            <p className="mt-2 text-xs leading-relaxed text-text-secondary">
              Te acompaña en cada paso para que configurar tu operación sea simple y rápido.
            </p>
          </div>
        </div>

        {/* ============================== DERECHA — Configuración inicial ============================== */}
        <div className="w-full rounded-[var(--radius-xl)] border border-border-default bg-bg-elevated p-6 shadow-[var(--shadow-elevation-2)] xl:p-7">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-bright">Configuración inicial</p>
            <span className="shrink-0 rounded-full border border-border-default px-3 py-1 text-[11px] text-text-tertiary">
              Paso {INTAKE_STEP_NUMBER} de {TOTAL_ONBOARDING_STEPS}
            </span>
          </div>
          <div className="mt-2.5 flex gap-1" aria-hidden>
            {Array.from({ length: TOTAL_ONBOARDING_STEPS }).map((_, i) => (
              <span
                key={i}
                className="h-1 flex-1 rounded-full"
                style={{ background: i < INTAKE_STEP_NUMBER ? "var(--accent-gradient)" : "var(--border-default)" }}
              />
            ))}
          </div>

          <h2 className="mt-5 text-xl font-semibold text-text-primary xl:text-2xl">¿Cómo querés contarme sobre tu operación?</h2>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">
            Podés combinar varias opciones. Guardian une todo lo que le cuentes para entender tu laboratorio.
          </p>

          {/* ---------- Opción 1 — Texto libre ---------- */}
          <div className="mt-4 rounded-[var(--radius-lg)] border border-border-default p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border-default bg-accent-soft text-accent-bright">
                <MessageCircle size={17} />
              </span>
              <div>
                <p className="text-[15px] font-semibold text-text-primary">1. Contármelo con tus palabras</p>
                <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
                  Escribí libremente todo lo que sepas sobre cómo trabajan: productos, equipos, capacidades, procesos, horarios, personas, etc.
                </p>
              </div>
            </div>

            <div className="mt-3">
              {pendingEntities ? (
                <InterpretationCard
                  interpretedText={confirmText}
                  onConfirm={() => {
                    setAnswers((prev) => applyNluExtraction(prev, pendingEntities));
                    setDraft("");
                    setPendingEntities(null);
                  }}
                  onEdit={() => setPendingEntities(null)}
                />
              ) : (
                <>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Contame sobre tu laboratorio..."
                    rows={3}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    disabled={pending}
                    className="w-full resize-none rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-disabled focus:border-accent disabled:opacity-50"
                  />
                  <div className="mt-2.5 flex items-center gap-3">
                    <Button type="button" onClick={submitFreeform} disabled={pending || !draft.trim()}>
                      {pending ? "Interpretando..." : "Contar mi operación"}
                    </Button>
                    {hasFreeformProgress && (
                      <span className="text-xs text-accent-bright">Guardian ya entendió {totalResolvedCount(answers.resolvedBlocks)} bloque(s) de tu operación.</span>
                    )}
                  </div>
                  {nluError && <p className="mt-2 whitespace-pre-line text-xs text-risk-high">{nluError}</p>}
                </>
              )}
            </div>
          </div>

          {/* ---------- Opción 2 — Cargar archivos ---------- */}
          <div className="mt-3 rounded-[var(--radius-lg)] border border-border-default p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border-default bg-accent-soft text-accent-bright">
                <Upload size={17} />
              </span>
              <div>
                <p className="text-[15px] font-semibold text-text-primary">2. Cargar archivos</p>
                <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
                  Subí tus planillas de Pedidos, Inventario y Recursos — Guardian arma tu Modelo Operacional directamente desde ahí.
                </p>
                <p className="mt-1 text-[11px] text-text-disabled">Formato aceptado: Excel (.xlsx).</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {SLOTS.map((slot) => {
                const selected = files[slot.key];
                return (
                  <label
                    key={slot.key}
                    className={cn(
                      "flex cursor-pointer flex-col items-center gap-1.5 rounded-[var(--radius-md)] border border-dashed p-3 text-center transition-all duration-200",
                      selected ? "border-accent/50 bg-accent-soft" : "border-border-default bg-white/[0.015] hover:border-border-strong hover:bg-white/[0.03]",
                    )}
                  >
                    <input
                      type="file"
                      accept=".xlsx"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setFiles((prev) => ({ ...prev, [slot.key]: f }));
                      }}
                    />
                    {selected ? <Check size={18} className="text-accent-bright" /> : <Upload size={18} className="text-text-tertiary" />}
                    <span className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
                      <FileSpreadsheet size={12} className="text-text-tertiary" />
                      {slot.label}
                    </span>
                    <span className="truncate text-[11px] text-text-tertiary max-w-full">{selected ? selected.name : "Elegir archivo"}</span>
                  </label>
                );
              })}
            </div>

            {hasFreeformProgress && (
              <p className="mt-2.5 text-[11px] text-text-tertiary">
                Nota: construir desde archivos usa exclusivamente esos datos — lo que ya le contaste a Guardian por texto no se incluye acá. Para combinarlo, usá la opción 3.
              </p>
            )}
            {buildError && <p className="mt-2.5 text-xs text-risk-high">{buildError}</p>}

            <Button className="mt-3 w-full" disabled={!allFilesPresent || building} onClick={handleBuildFromFiles}>
              {building ? "Construyendo..." : "Construir con estos archivos"}
            </Button>
          </div>

          {/* ---------- Opción 3 — Preguntas guiadas ---------- */}
          <div className="mt-3 flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-border-default p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border-default bg-accent-soft text-accent-bright">
                <ListChecks size={17} />
              </span>
              <div>
                <p className="text-[15px] font-semibold text-text-primary">3. Que Guardian me haga las preguntas</p>
                <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">Respondé preguntas simples paso a paso.</p>
              </div>
            </div>
            <Button variant="gradient" onClick={() => onStartGuidedSetup(answers)} className="w-full shrink-0 gap-2 sm:w-auto">
              Comenzar con preguntas
              <ArrowRight size={15} />
            </Button>
          </div>

          {/* ---------- Demo ---------- */}
          <div className="mt-4 flex flex-col items-start gap-3 border-t border-border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border-default text-text-tertiary">
                <FlaskConical size={17} />
              </span>
              <div>
                <p className="text-sm font-medium text-text-primary">¿Solo querés conocer Guardian?</p>
                <p className="mt-0.5 text-xs text-text-secondary">Probá con datos demo y explorá todas las funcionalidades.</p>
              </div>
            </div>
            <Button variant="ghost" onClick={handleUseDemoData} disabled={building} className="w-full shrink-0 gap-2 sm:w-auto">
              Probar con datos demo
              <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
