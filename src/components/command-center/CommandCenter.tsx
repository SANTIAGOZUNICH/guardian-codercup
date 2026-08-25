"use client";

import { useState } from "react";
import { ArrowRight, Boxes, CalendarDays, FlaskConical, MessageCircle, Package, Users, Workflow } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import type { OperationSummaryV2 } from "@/lib/model/buildModelInputsFromGuidedSetupV2";
import type { LastSimulation, OperationalModel, OperationsCalendar, OrderConstraints, TwinCompleteness } from "@/lib/types";
import { buildCommandCenterFacts, buildDemoContext, buildProcessFlowPreview, selectAskGuardianPrompts, selectScenarioSummary } from "@/lib/view/command-center-view-model";

const FACT_ICON = { products: Package, processes: Workflow, resources: Boxes, staff: Users, schedule: CalendarDays, materials: FlaskConical };

function calendarLabel(calendar: OperationsCalendar) {
  if (!calendar.workingDays.length) return null;
  return `${calendar.workingDays.length} días · desde ${calendar.workdayStart} · ${calendar.workdayHours} h`;
}

export function CommandCenter({ model, orderConstraints, lastSimulation, operationSummary, twinCompleteness, calendar, isDemo = false, onExploreTwin, onAskGuardian }: {
  model: OperationalModel;
  orderConstraints: OrderConstraints[];
  lastSimulation: LastSimulation | null;
  operationSummary: OperationSummaryV2 | null;
  twinCompleteness: TwinCompleteness | null;
  calendar: OperationsCalendar;
  isDemo?: boolean;
  onViewConstraints: () => void;
  onExploreTwin: () => void;
  onAskGuardian: (text?: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const facts = buildCommandCenterFacts(model, operationSummary, calendarLabel(calendar));
  const stages = buildProcessFlowPreview(model, lastSimulation ? orderConstraints : []);
  const prompts = selectAskGuardianPrompts(model);
  const scenario = selectScenarioSummary(lastSimulation);
  const demoContext = buildDemoContext(isDemo);

  return <div className="mx-auto w-full max-w-[1280px] space-y-4">
    <div className="flex items-end justify-between gap-5">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-bright">Resumen</p><div className="mt-1 flex flex-wrap items-center gap-3"><h2 className="text-3xl font-semibold tracking-tight text-text-primary">Centro de Operaciones</h2>{demoContext?<span className="rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-bright">{demoContext.badge}</span>:null}</div><p className="mt-1 text-sm text-text-secondary">Tu modelo operativo está listo para analizar escenarios.</p>{demoContext?<p className="mt-2 max-w-2xl text-xs text-text-tertiary">{demoContext.description}</p>:null}</div>
      <Guardian state="idle" size={72} className="hidden shrink-0 md:flex" />
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{facts.map((fact) => { const Icon = FACT_ICON[fact.key]; return <Card key={fact.key} className="p-4! flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-bright"><Icon size={17} /></span><div className="min-w-0"><p className="text-xs text-text-tertiary">{fact.label}</p><p className={cn("truncate text-sm font-semibold", fact.tone === "neutral" ? "text-text-secondary" : "text-text-primary")}>{fact.value}</p></div></Card>; })}</div>
        <Card className="p-5! overflow-hidden">
          <div className="flex items-center justify-between gap-4"><div><h3 className="font-semibold text-text-primary">Tu modelo operativo</h3><p className="text-xs text-text-tertiary">Flujo derivado de los procesos y equipos declarados</p></div><button type="button" onClick={onExploreTwin} className="text-xs font-medium text-accent-bright hover:text-text-primary">Ver en detalle</button></div>
          {stages.length ? <div className="mt-6 flex items-center overflow-x-auto pb-2">{stages.map((stage, index) => <div key={stage.process} className="flex shrink-0 items-center"><div className="min-w-40 rounded-xl border border-accent/35 bg-accent-soft px-4 py-4 text-center"><p className="text-sm font-semibold text-text-primary">{stage.process}</p><p className="mt-1 text-xs text-text-secondary">{stage.resourceCount} equipo{stage.resourceCount === 1 ? "" : "s"}</p></div>{index < stages.length - 1 && <span className="h-px w-10 bg-accent/60" aria-hidden="true" />}</div>)}</div> : <div className="mt-6 rounded-xl border border-dashed border-border-default p-6 text-center text-sm text-text-tertiary">Todavía no hay procesos operativos declarados.</div>}
          {twinCompleteness?.missing.unsupportedProcesses.length ? <div className="mt-3 flex flex-wrap gap-2">{twinCompleteness.missing.unsupportedProcesses.map((process) => <span key={process} className="rounded-full border border-border-default px-3 py-1 text-xs text-text-secondary">{process} · declarado, aún no simulable</span>)}</div> : null}
        </Card>
        <Card className="p-5!">
          <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-text-primary">Última simulación</h3><p className="text-xs text-text-tertiary">Resultados guardados en esta sesión</p></div>{scenario && <span className="rounded-full bg-accent-soft px-3 py-1 text-xs text-accent-bright">Real</span>}</div>
          {scenario ? <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="sm:col-span-2"><p className="text-sm font-medium text-text-primary">{scenario.goalSummary}</p><p className="mt-1 text-xs text-text-secondary">{scenario.chosenPlanLabel} · {scenario.completionLabel}</p></div><p className="text-sm text-text-secondary">Capacidad: <span className={scenario.capacityFeasible ? "text-risk-low" : "text-risk-high"}>{scenario.capacityFeasible ? "Factible" : "No factible"}</span></p></div> : <div className="mt-4 rounded-xl border border-dashed border-border-default p-5"><p className="text-sm text-text-secondary">Todavía no hiciste simulaciones.</p><button type="button" onClick={() => onAskGuardian()} className="mt-2 text-sm font-medium text-accent-bright">Iniciar una consulta <ArrowRight size={14} className="inline" /></button></div>}
        </Card>
      </div>
      <aside className="space-y-4">
        <Card glow className="p-5!">
          <div className="flex items-center gap-2 text-accent-bright"><MessageCircle size={19} /><h3 className="font-semibold">Preguntale a Guardian</h3></div><p className="mt-2 text-sm text-text-secondary">Consultá en lenguaje natural sobre tu operación. Guardian usa el contexto de tu modelo.</p>
          <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (question.trim()) onAskGuardian(question.trim()); }}><label className="sr-only" htmlFor="command-question">Pregunta para Guardian</label><input id="command-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="¿Qué querés saber de tu operación?" className="min-w-0 flex-1 rounded-lg border border-border-default bg-bg-base px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent" /><button type="submit" disabled={!question.trim()} aria-label="Enviar pregunta" className="rounded-lg bg-accent px-3 text-white disabled:cursor-not-allowed disabled:opacity-40"><ArrowRight size={17} /></button></form>
          {prompts.length > 0 && <div className="mt-4 space-y-2"><p className="text-xs font-medium text-text-tertiary">Ejemplos compatibles</p>{prompts.map((prompt) => <button key={prompt} type="button" onClick={() => onAskGuardian(prompt)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2.5 text-left text-xs text-text-secondary hover:border-accent/40 hover:text-text-primary"><span>{prompt}</span><ArrowRight size={13} /></button>)}</div>}
        </Card>
        <Card className="p-5!"><h3 className="font-semibold text-text-primary">Estado del modelo</h3><p className="mt-2 text-sm text-text-secondary">Modelo operativo integrado. Los resultados aparecen sólo después de simular un escenario.</p><button type="button" onClick={onExploreTwin} className="mt-4 w-full rounded-lg border border-accent/40 px-4 py-2.5 text-sm font-medium text-accent-bright hover:bg-accent-soft">Explorar modelo</button></Card>
      </aside>
    </div>
  </div>;
}
