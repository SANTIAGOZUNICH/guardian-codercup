"use client";

import { useState } from "react";
import { ArrowRight, Boxes, CalendarDays, Check, FlaskConical, MessageCircle, Package, Sparkles, Users, Workflow } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { cn } from "@/lib/cn";
import type { OperationSummaryV2 } from "@/lib/model/buildModelInputsFromGuidedSetupV2";
import type { LastSimulation, OperationalModel, OperationsCalendar, OrderConstraints, TwinCompleteness } from "@/lib/types";
import { buildCommandCenterFacts, buildDemoContext, buildProcessFlowPreview, selectAskGuardianPrompts, selectScenarioSummary } from "@/lib/view/command-center-view-model";

const FACT_ICON = { products: Package, processes: Workflow, resources: Boxes, staff: Users, schedule: CalendarDays, materials: FlaskConical };
const PROCESS_ICON = { Elaboración: FlaskConical, Envasado: Package, Codificado: Boxes };
const panel = "rounded-[22px] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(13,18,31,0.9),rgba(5,8,15,0.94))] shadow-[0_22px_55px_-38px_rgba(34,105,255,0.55),inset_0_1px_0_rgba(255,255,255,0.035)]";

function addHours(time: string, hours: number) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + Math.round(hours * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function workingDaysLabel(days: number[]) {
  const labels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  if (!days.length) return null;
  const sorted = [...days].sort((a, b) => a - b);
  const contiguous = sorted.every((day, index) => index === 0 || day === sorted[index - 1] + 1);
  return contiguous && sorted.length > 1 ? `${labels[sorted[0]]}–${labels[sorted.at(-1)!]}` : sorted.map((day) => labels[day]).join(", ");
}

function calendarLabel(calendar: OperationsCalendar) {
  const days = workingDaysLabel(calendar.workingDays);
  return days ? `${days} · ${calendar.workdayStart}–${addHours(calendar.workdayStart, calendar.workdayHours)}` : null;
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

  return (
    <div className="relative mx-auto w-full max-w-[1480px] pb-4">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-[430px] w-[430px] rounded-full bg-blue-600/[0.09] blur-[110px]" />
      <header className="relative mb-7 xl:pr-[380px]">
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-tertiary">
          <span className="text-accent-bright">Centro de Operaciones</span><span className="h-1 w-1 rounded-full bg-border-strong" />
          <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-risk-low shadow-[0_0_12px_rgba(52,199,123,0.8)]" />Modelo operacional · <span className="text-risk-low">Activo</span></span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3"><h2 className="text-[clamp(2rem,4vw,3.4rem)] font-semibold leading-none tracking-[-0.045em] text-text-primary">Centro de Operaciones</h2>{demoContext ? <span className="rounded-full border border-accent/35 bg-accent-soft px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-bright">{demoContext.badge}</span> : null}</div>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-text-secondary sm:text-base">Tu modelo operativo está listo para analizar escenarios y tomar mejores decisiones.</p>
        {demoContext ? <p className="mt-2 max-w-3xl text-xs leading-relaxed text-text-tertiary">{demoContext.description}</p> : null}
      </header>

      <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-label="Resumen operacional" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:col-start-1 xl:row-start-1">
          {facts.map((fact) => {
            const Icon = FACT_ICON[fact.key];
            const parts = fact.key === "schedule" ? fact.value.split(" · ") : null;
            const materials = fact.key === "materials" && fact.value.includes("(opcional)");
            return <article key={fact.key} className={cn(panel, "group min-w-0 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-accent/25 sm:p-5")}><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/15 bg-[radial-gradient(circle_at_35%_25%,rgba(75,134,255,0.23),rgba(30,67,160,0.08))] text-accent-bright shadow-[0_0_25px_-12px_rgba(62,123,250,0.9)]"><Icon size={21} strokeWidth={1.7} /></span><div className="min-w-0 pt-0.5"><p className="text-xs text-text-secondary">{fact.label}</p><p className={cn("mt-1 text-lg font-semibold leading-tight tracking-tight sm:text-xl", fact.tone === "neutral" ? "text-text-secondary" : "text-text-primary")}>{parts?.[0] ?? (materials ? fact.value.replace(" (opcional)", "") : fact.value)}</p>{parts?.[1] ? <p className="mt-1 text-xs text-text-tertiary">{parts[1]}</p> : null}{materials ? <p className="mt-1 text-xs text-text-tertiary">Opcional</p> : null}</div></div></article>;
          })}
        </section>

        <section className="relative flex min-h-[220px] items-center justify-center overflow-hidden rounded-[26px] border border-accent/10 bg-[radial-gradient(ellipse_at_50%_45%,rgba(36,98,255,0.14),transparent_62%)] px-4 xl:col-start-2 xl:row-start-1 xl:min-h-[270px]">
          <div aria-hidden className="absolute bottom-8 h-8 w-48 rounded-full bg-blue-500/20 blur-2xl" /><Guardian state="idle" size={200} variant="asset" className="relative z-10 xl:hidden" /><Guardian state="idle" size={255} variant="asset" className="relative z-10 hidden xl:flex" />
        </section>

        <section className={cn(panel, "p-5 sm:p-6 xl:col-start-2 xl:row-start-2")}>
          <div className="flex items-center gap-3 text-accent-violet"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10"><MessageCircle size={20} /></span><h3 className="text-lg font-semibold">Preguntale a Guardian</h3></div><p className="mt-3 text-sm leading-relaxed text-text-secondary">Consultá en lenguaje natural sobre tu operación.</p>
          <form className="mt-5 flex overflow-hidden rounded-xl border border-border-default bg-black/20 transition focus-within:border-accent/65 focus-within:shadow-[0_0_0_3px_rgba(62,123,250,0.08)]" onSubmit={(event) => { event.preventDefault(); if (question.trim()) onAskGuardian(question.trim()); }}><label className="sr-only" htmlFor="command-question">Pregunta para Guardian</label><input id="command-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="¿Qué querés saber de tu operación?" className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-sm text-text-primary outline-none placeholder:text-text-tertiary" /><button type="submit" disabled={!question.trim()} aria-label="Enviar pregunta" className="m-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,var(--accent),var(--accent-violet))] text-white shadow-[0_7px_20px_-8px_rgba(100,77,255,0.9)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"><ArrowRight size={18} /></button></form>
          {prompts.length > 0 ? <div className="mt-5 space-y-2"><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary">Ejemplos compatibles</p>{prompts.map((prompt) => <button key={prompt} type="button" onClick={() => onAskGuardian(prompt)} className="group flex w-full items-center justify-between gap-3 rounded-xl border border-border-subtle bg-white/[0.01] px-3.5 py-3 text-left text-xs text-text-secondary transition duration-200 hover:border-accent/35 hover:bg-accent-soft hover:text-text-primary"><span>{prompt}</span><ArrowRight size={14} className="shrink-0 transition-transform group-hover:translate-x-0.5" /></button>)}</div> : null}
        </section>

        <section className={cn(panel, "overflow-hidden p-5 sm:p-6 xl:col-start-1 xl:row-start-2")}>
          <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2.5"><Workflow size={19} className="text-accent-bright" /><h3 className="text-lg font-semibold text-text-primary">Modelo operativo integrado</h3></div><p className="mt-1.5 text-xs text-text-tertiary">Flujo principal derivado de tus procesos y equipos declarados</p></div><button type="button" onClick={onExploreTwin} className="group flex shrink-0 items-center gap-1.5 text-xs font-medium text-accent-bright transition hover:text-text-primary">Ver modelo completo <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" /></button></div>
          {stages.length ? <div className="mt-7 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">{stages.map((stage, index) => { const Icon = PROCESS_ICON[stage.process]; return <div key={stage.process} className="contents"><article className="relative rounded-2xl border border-accent/35 bg-[linear-gradient(145deg,rgba(27,47,91,0.35),rgba(7,11,20,0.8))] p-5 shadow-[0_18px_40px_-30px_rgba(49,112,255,0.9)]"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-bright"><Icon size={20} /></span><p className="mt-4 text-sm font-semibold uppercase tracking-[0.025em] text-text-primary">{stage.process}</p><p className="mt-1 text-xs text-text-secondary">{stage.resourceCount} equipo{stage.resourceCount === 1 ? "" : "s"}</p></article>{index < stages.length - 1 ? <div aria-hidden className="hidden items-center md:flex"><span className="h-px w-5 bg-gradient-to-r from-accent to-cyan-400" /><ArrowRight size={13} className="-ml-0.5 text-cyan-400" /></div> : null}</div>; })}</div> : <div className="mt-6 rounded-2xl border border-dashed border-border-default p-7 text-center text-sm text-text-tertiary">Todavía no hay procesos operativos declarados.</div>}
          {twinCompleteness?.missing.unsupportedProcesses.length ? <div className="mt-4 flex flex-wrap gap-2">{twinCompleteness.missing.unsupportedProcesses.map((process) => <span key={process} className="rounded-full border border-border-default px-3 py-1 text-xs text-text-secondary">{process} · declarado, aún no simulable</span>)}</div> : null}
        </section>

        <section className={cn(panel, "p-5 sm:p-6 xl:col-start-1 xl:row-start-3")}>
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-semibold text-text-primary">Última simulación</h3><p className="mt-1 text-xs text-text-tertiary">Resultados guardados en esta sesión</p></div>{scenario ? <span className="rounded-full border border-accent/25 bg-accent-soft px-3 py-1 text-xs text-accent-bright">Resultado real</span> : null}</div>
          {scenario ? <div className="mt-5 grid gap-4 rounded-2xl border border-border-subtle bg-black/15 p-5 sm:grid-cols-[minmax(0,1fr)_auto]"><div><p className="font-medium text-text-primary">{scenario.goalSummary}</p><p className="mt-1.5 text-sm text-text-secondary">{scenario.chosenPlanLabel} · {scenario.completionLabel}</p></div><p className="self-center text-sm text-text-secondary">Capacidad: <span className={scenario.capacityFeasible ? "text-risk-low" : "text-risk-high"}>{scenario.capacityFeasible ? "Factible" : "No factible"}</span></p></div> : <div className="mt-5 grid items-center gap-5 rounded-2xl border border-dashed border-accent/20 bg-[radial-gradient(circle_at_12%_50%,rgba(62,123,250,0.11),transparent_35%)] p-5 sm:grid-cols-[auto_1fr_auto]"><span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent-soft text-accent-bright"><Sparkles size={24} /></span><div><p className="font-medium text-text-primary">Todavía no hiciste simulaciones</p><p className="mt-1 text-sm text-text-secondary">Usá Ask Guardian para analizar un escenario de producción.</p></div><button type="button" onClick={() => onAskGuardian()} className="group flex items-center justify-center gap-2 rounded-xl border border-accent/35 bg-accent-soft px-4 py-3 text-sm font-medium text-accent-bright transition hover:bg-accent-soft/80">Simular mi primer escenario <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" /></button></div>}
        </section>

        <section className={cn(panel, "flex items-start gap-4 p-5 xl:col-start-2 xl:row-start-3")}><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-risk-low/20 bg-risk-low-soft text-risk-low"><Check size={18} /></span><div><h3 className="font-semibold text-accent-bright">Modelo listo para usar</h3><p className="mt-2 text-sm leading-relaxed text-text-secondary">Guardian puede evaluar escenarios utilizando los datos disponibles en tu modelo operativo.</p><button type="button" onClick={onExploreTwin} className="mt-4 text-xs font-medium text-accent-bright hover:text-text-primary">Explorar modelo <ArrowRight size={13} className="inline" /></button></div></section>
      </div>
    </div>
  );
}
