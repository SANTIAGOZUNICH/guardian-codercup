"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Check, Circle, Factory, GitCompareArrows, Target, X } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { simulateGoal } from "@/lib/engine/simulation-engine";
import { useMotionSafe } from "@/lib/useMotionSafe";
import { buildSimulationCardView, buildSimulationGoalView, selectSimulationCards, SIMULATION_PHASES } from "@/lib/view/simulating-view-model";
import type { Goal, GoalSimulationResult, OperationalModel, OperationsCalendar } from "@/lib/types";

const PRESENTATION_STEP_MS = 380;

export function SimulatingScreen({ model, goal, snapshotAt, calendar, mode = "simulation", disruptionLabel, onDone }: {
  model: OperationalModel; goal: Goal; snapshotAt: string; calendar: OperationsCalendar;
  mode?: "simulation" | "resimulation"; disruptionLabel?: string; onDone: (result: GoalSimulationResult) => void;
}) {
  const result = useMemo(() => simulateGoal(model, goal, calendar, snapshotAt), [model, goal, calendar, snapshotAt]);
  const goalView = useMemo(() => buildSimulationGoalView(result, model, calendar), [result, model, calendar]);
  const cards = useMemo(() => selectSimulationCards(result).map(buildSimulationCardView), [result]);
  const motionSafe = useMotionSafe();
  const [phase, setPhase] = useState(() => motionSafe ? 0 : SIMULATION_PHASES.length);
  const complete = phase >= SIMULATION_PHASES.length;

  useEffect(() => {
    if (!motionSafe || complete) return;
    const timer = window.setTimeout(() => setPhase((current) => current + 1), PRESENTATION_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [complete, motionSafe, phase]);

  return <main className="min-h-screen overflow-x-hidden bg-bg-base px-5 py-6 text-text-primary sm:px-8"><div className="mx-auto max-w-[1480px]">
    <header className="mb-6 text-center"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-bright">{mode === "resimulation" ? "Reevaluando el escenario" : "Análisis de escenarios"}</p><h1 className="mt-2 text-3xl font-semibold">Guardian está comparando alternativas reales</h1><p className="mt-2 text-sm text-text-secondary">Distintas configuraciones del modelo, evaluadas con el mismo objetivo.</p>{disruptionLabel ? <p className="mt-2 text-sm text-risk-medium">{disruptionLabel}</p> : null}</header>
    <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_270px]">
      <aside className="rounded-2xl border border-border-subtle bg-white/[0.02] p-5"><h2 className="font-semibold text-accent-bright">Tu objetivo</h2><dl className="mt-4 space-y-4 text-sm"><Field label="Producto" value={goalView.product}/><Field label="Cantidad" value={goalView.quantity}/>{goalView.grams ? <Field label="Gramaje" value={goalView.grams}/> : null}<Field label="Deadline" value={goalView.deadline}/>{goalView.client ? <Field label="Cliente" value={goalView.client}/> : null}</dl>{result.materialsFeasible === "not_evaluated" ? <p className="mt-6 rounded-lg border border-border-subtle p-3 text-xs text-text-secondary">Materials no evaluado · no afecta este análisis</p> : null}</aside>
      <section className="relative min-h-[560px] overflow-hidden rounded-2xl border border-border-subtle bg-[radial-gradient(circle_at_center,rgba(76,84,255,0.13),transparent_62%)] p-5"><div aria-hidden className="absolute inset-x-[16%] top-[26%] aspect-square rounded-full border border-accent/20 shadow-[0_0_60px_rgba(80,100,255,0.15)]"/><div className="relative z-10 flex flex-col items-center"><Guardian variant="asset" state="simulating" size={250} message={complete ? "Ya encontré las alternativas disponibles." : "Estoy comparando distintas formas de cumplir tu objetivo."}/><div className="mt-5 grid w-full gap-3 md:grid-cols-3">{cards.map((card, index) => <ScenarioCard key={`${card.title}-${index}`} card={card} visible={complete || phase >= Math.min(index + 2, 4)} motionSafe={motionSafe}/>)}</div></div></section>
      <aside className="rounded-2xl border border-border-subtle bg-white/[0.02] p-5"><h2 className="font-semibold">Evaluación real</h2><ol className="mt-5 space-y-5">{SIMULATION_PHASES.map((label, index) => { const done = complete || index < phase; const active = !complete && index === phase; return <li key={label} className="flex gap-3"><span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${done ? "border-risk-low text-risk-low" : active ? "border-accent text-accent-bright" : "border-border-default text-text-disabled"}`}>{done ? <Check size={13}/> : <Circle size={9}/>}</span><p className={`text-sm ${active ? "text-text-primary" : "text-text-secondary"}`}>{label}</p></li>; })}</ol><div className="mt-7 rounded-xl border border-accent/25 bg-accent-soft/20 p-4"><GitCompareArrows size={18} className="text-accent-bright"/><p className="mt-2 text-sm font-medium">{complete ? "Análisis completado" : "Comparando escenarios"}</p><p className="mt-1 text-xs text-text-secondary">{result.scenarios.length} configuraciones reales generadas por el motor.</p></div></aside>
    </div>
    <footer className="mt-5 flex flex-col items-center justify-between gap-4 rounded-xl border border-border-subtle bg-white/[0.015] p-4 sm:flex-row"><div className="flex flex-wrap items-center gap-5 text-xs text-text-secondary"><span className="flex items-center gap-2"><Target size={15}/> Objetivo interpretado</span><span className="flex items-center gap-2"><Factory size={15}/> Capacidad evaluada</span><span className="flex items-center gap-2"><CalendarDays size={15}/> Calendario aplicado</span></div>{complete ? <Button onClick={() => onDone(result)}>Ver resultados</Button> : <p className="text-sm text-text-secondary">Visualizando el análisis ya calculado…</p>}</footer>
  </div></main>;
}

function Field({ label, value }: { label: string; value: string }) { return <div><dt className="text-text-tertiary">{label}</dt><dd className="font-medium">{value}</dd></div>; }

function ScenarioCard({ card, visible, motionSafe }: { card: ReturnType<typeof buildSimulationCardView>; visible: boolean; motionSafe: boolean }) { return <motion.article initial={motionSafe ? { opacity: 0, y: 12 } : false} animate={{ opacity: visible ? 1 : 0.24, y: 0 }} className="rounded-xl border border-accent/30 bg-bg-elevated/90 p-4 shadow-elevation-1"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-bright">{card.title}</p><p className="mt-2 line-clamp-2 text-xs text-text-secondary">{card.resources}</p><div className="mt-4 space-y-2 text-xs"><Status ok={card.capacityLabel === "Capacidad disponible"} label={card.capacityLabel}/><Status ok={card.deadlineLabel === "Cumple fecha objetivo"} label={card.deadlineLabel}/>{card.completionLabel ? <p className="text-text-secondary">Finalización: {card.completionLabel}</p> : null}{card.materialsLabel ? <p className="text-text-secondary">{card.materialsLabel}</p> : null}{card.issueCount > 0 ? <p className="text-risk-medium">{card.issueCount} restricción{card.issueCount === 1 ? "" : "es"} detectada{card.issueCount === 1 ? "" : "s"}</p> : null}</div></motion.article>; }

function Status({ ok, label }: { ok: boolean; label: string }) { return <p className="flex items-center gap-2">{ok ? <Check size={14} className="text-risk-low"/> : <X size={14} className="text-risk-high"/>}{label}</p>; }
