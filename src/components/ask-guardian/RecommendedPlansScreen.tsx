"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, GitCompareArrows, Target, X } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { WhyThisPlanModal } from "./WhyThisPlanModal";
import { buildOperationalImpactView } from "@/lib/view/disruption-view-model";
import { buildRecommendedPlansView, type RecommendedPlansView } from "@/lib/view/recommended-plans-view-model";
import { buildPlanCardView, resolveGoalDeadlineLabel } from "@/lib/view/simulation-view-model";
import type { EvaluatedScenario, GoalSimulationResult, MachineUnavailableDisruption, OperationalModel, OperationsCalendar } from "@/lib/types";

export interface RecommendedPlansDisruptionContext {
  model: OperationalModel; disruptedModel: OperationalModel; disruption: MachineUnavailableDisruption;
  resourceName: string; beforeResult: GoalSimulationResult;
}

export function RecommendedPlansScreen({ result, model, calendar, disruptionContext = null, onChoosePlan, onBack }: {
  result: GoalSimulationResult; model: OperationalModel; calendar: OperationsCalendar;
  disruptionContext?: RecommendedPlansDisruptionContext | null;
  onChoosePlan: (scenario: EvaluatedScenario) => void; onBack: () => void;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const view = useMemo(() => buildRecommendedPlansView(result, model, calendar), [result, model, calendar]);
  const impactView = disruptionContext ? buildOperationalImpactView(disruptionContext.model, disruptionContext.disruptedModel, disruptionContext.disruption, disruptionContext.resourceName, disruptionContext.beforeResult, result) : null;

  return <main className="min-h-screen overflow-x-hidden bg-bg-base px-5 py-6 text-text-primary sm:px-8"><div className="mx-auto max-w-[1480px]">
    <header className="mb-6 text-center"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-bright">Resultados del análisis</p><h1 className="mt-2 text-3xl font-semibold">{view.title}</h1><p className="mt-2 text-sm text-text-secondary">{view.subtitle}</p></header>
    <div className="grid gap-5 xl:grid-cols-[270px_minmax(0,1fr)_280px]">
      <aside className="space-y-4"><GoalPanel view={view}/><div className="rounded-2xl border border-accent/25 bg-white/[0.02] p-4"><Guardian variant="asset" state={view.favorable ? "success" : "alert"} size={220} message={view.noSolution ? "Esta es la alternativa más cercana que encontré." : `Recomiendo ${view.primaryLabel}.`}/></div></aside>
      <section className="space-y-4"><PrimaryPlan view={view} onWhy={() => setShowWhy(true)} onChoose={() => onChoosePlan(view.primary)}/>
        {view.alternatives.length > 0 ? <div className="rounded-2xl border border-border-subtle bg-white/[0.015] p-4"><h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-accent-violet">Otras alternativas reales</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{view.alternatives.map((scenario,index)=><AlternativeCard key={scenario.config.id} scenario={scenario} label={`Plan ${String.fromCharCode(66+index)}`} deadlineLabel={resolveGoalDeadlineLabel(result.goal,calendar)} onChoose={()=>onChoosePlan(scenario)}/>)}</div></div> : <div className="rounded-2xl border border-border-subtle bg-white/[0.015] p-4 text-sm text-text-secondary">No existen otras configuraciones reales para este modelo.</div>}
        {impactView ? <div className="rounded-2xl border border-border-subtle bg-white/[0.015] p-5"><h2 className="text-sm font-semibold">Impacto operacional</h2><p className="mt-2 text-sm text-text-secondary">{impactView.narrative}</p></div> : null}
      </section>
      <aside className="space-y-4"><QuickComparison view={view}/><div className="rounded-2xl border border-border-subtle bg-white/[0.02] p-5"><h2 className="font-semibold text-accent-violet">Información del análisis</h2><dl className="mt-4 space-y-3 text-sm"><Row label="Escenarios evaluados" value={String(view.evaluatedCount)}/><Row label="Procesos involucrados" value={String(view.processesCount)}/><Row label="Materials" value={view.materialsLabel}/></dl></div>{view.baseline ? <BaselineSummary scenario={view.baseline}/> : null}</aside>
    </div>
    <footer className="mt-5 flex flex-col items-center justify-between gap-3 rounded-xl border border-border-subtle bg-white/[0.015] p-4 sm:flex-row"><p className="text-sm text-text-secondary">La recomendación usa exclusivamente el ranking determinístico del motor.</p><Button variant="ghost" onClick={onBack}><ArrowLeft size={16}/> Volver al Centro de Operaciones</Button></footer>
  </div>{showWhy ? <WhyThisPlanModal view={view} onClose={()=>setShowWhy(false)}/> : null}</main>;
}

function GoalPanel({view}:{view:RecommendedPlansView}) { return <div className="rounded-2xl border border-border-subtle bg-white/[0.02] p-5"><h2 className="flex items-center gap-2 font-semibold text-accent-bright"><Target size={18}/>Tu objetivo</h2><dl className="mt-4 space-y-3 text-sm"><Row label="Producto" value={view.goal.product}/><Row label="Cantidad" value={view.goal.quantity}/>{view.goal.grams?<Row label="Gramaje" value={view.goal.grams}/>:null}<Row label="Deadline" value={view.goal.deadline}/>{view.goal.client?<Row label="Cliente" value={view.goal.client}/>:null}</dl></div>; }

function PrimaryPlan({view,onWhy,onChoose}:{view:RecommendedPlansView;onWhy:()=>void;onChoose:()=>void}) { const positive=view.favorable; return <article className={`rounded-2xl border-2 p-6 ${positive?"border-risk-low/50 bg-[linear-gradient(150deg,rgba(41,214,133,0.10),transparent_60%)]":"border-risk-medium/45 bg-[linear-gradient(150deg,rgba(224,166,64,0.10),transparent_60%)]"}`}><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><p className={`text-xs font-semibold uppercase tracking-[0.1em] ${positive?"text-risk-low":"text-risk-medium"}`}>{view.primaryBadge}</p><h2 className="mt-2 text-2xl font-semibold">{view.primaryLabel}</h2><p className="mt-2 flex items-center gap-2 text-sm"><StatusIcon ok={view.primary.result.deadlineMet}/>{view.deadlineLabel}</p></div><div className="sm:text-right"><p className="text-xs text-text-tertiary">Fecha estimada de finalización</p><p className="mt-1 text-xl font-semibold">{view.completionLabel}</p>{view.durationLabel?<p className="mt-1 text-xs text-text-secondary">Duración calculada: {view.durationLabel}</p>:null}</div></div><div className="my-5 border-t border-border-subtle"/><h3 className="text-sm font-semibold">¿Cómo lo logra?</h3><ul className="mt-3 grid gap-2 sm:grid-cols-2">{view.how.map((fact)=><li key={fact} className="flex items-start gap-2 text-sm text-text-secondary"><Check size={15} className="mt-0.5 shrink-0 text-accent-bright"/>{fact}</li>)}</ul><div className="mt-5 flex flex-wrap gap-3"><Button variant={positive?"gradient":"primary"} onClick={onWhy}>¿Por qué este plan?</Button><Button variant="ghost" onClick={onChoose}>Elegir esta alternativa</Button></div></article>; }

function AlternativeCard({scenario,label,deadlineLabel,onChoose}:{scenario:EvaluatedScenario;label:string;deadlineLabel:string;onChoose:()=>void}) { const card=buildPlanCardView(scenario,1,deadlineLabel,"deadline_missed"); return <article className="rounded-xl border border-border-subtle bg-bg-elevated/80 p-4"><div className="flex items-center justify-between"><h3 className="font-semibold text-accent-bright">{label}</h3><StatusIcon ok={scenario.result.deadlineMet}/></div><p className="mt-2 text-sm text-text-secondary">{scenario.config.label}</p><dl className="mt-4 space-y-2 text-xs"><Row label="Fecha estimada" value={card.completionLabel}/><Row label="Deadline" value={scenario.result.deadlineMet?"Cumple":"No cumple"}/><Row label="Recursos extra" value={scenario.extraResourcesUsed===0?"0":`+${scenario.extraResourcesUsed}`}/></dl><button onClick={onChoose} className="mt-4 text-xs font-medium text-accent-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Elegir alternativa</button></article>; }

function QuickComparison({view}:{view:RecommendedPlansView}) { return <div className="rounded-2xl border border-border-subtle bg-white/[0.02] p-5"><h2 className="flex items-center gap-2 font-semibold"><GitCompareArrows size={18} className="text-accent-bright"/>Comparación rápida</h2><dl className="mt-4 space-y-3 text-sm"><Row label="Cumple fecha" value={view.primary.result.deadlineMet?"Sí":"No"}/><Row label="Finalización" value={view.completionLabel}/>{view.durationLabel?<Row label="Duración" value={view.durationLabel}/>:null}<Row label="Recursos extra" value={view.extraResourcesLabel}/><Row label="Restricciones reales" value={String(view.issueCount)}/></dl></div>; }
function BaselineSummary({scenario}:{scenario:EvaluatedScenario}) { return <div className="rounded-2xl border border-border-subtle bg-white/[0.02] p-5"><h2 className="font-semibold">Configuración actual</h2><p className="mt-2 flex items-center gap-2 text-sm text-text-secondary"><StatusIcon ok={scenario.result.deadlineMet}/>{scenario.result.deadlineMet?"Cumple la fecha":"No cumple la fecha"}</p><p className="mt-2 text-xs text-text-tertiary">Referencia real, no recalculada por la UI.</p></div>; }
function Row({label,value}:{label:string;value:string}) { return <div className="flex items-start justify-between gap-4"><dt className="text-text-tertiary">{label}</dt><dd className="text-right font-medium text-text-primary">{value}</dd></div>; }
function StatusIcon({ok}:{ok:boolean}) { return ok?<Check size={16} className="shrink-0 text-risk-low" aria-label="Cumple"/>:<X size={16} className="shrink-0 text-risk-high" aria-label="No cumple"/>; }
