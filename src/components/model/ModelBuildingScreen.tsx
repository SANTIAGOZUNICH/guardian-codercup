"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Box, Boxes, CalendarDays, Check, Cpu, FlaskConical, Gauge, Network, Users } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { GuardianLogo } from "@/components/ui/GuardianLogo";
import { Button } from "@/components/ui/Button";
import { useMotionSafe } from "@/lib/useMotionSafe";
import { buildModelBuildingViewModel, type ModelBuildingNode } from "@/lib/view/model-building-view-model";
import type { OperationSummaryV2 } from "@/lib/model/buildModelInputsFromGuidedSetupV2";
import type { MachineUnavailableDisruption, OperationalModel, OperationsCalendar, TwinCompleteness } from "@/lib/types";

const STAGE_DELAY = 760;
const ICONS = { products: Box, processes: Network, equipment: Cpu, capacities: Gauge, staff: Users, schedule: CalendarDays, materials: FlaskConical };

function ModelNode({ node, visible, index }: { node: ModelBuildingNode; visible: boolean; index: number }) {
  const Icon = ICONS[node.id];
  const neutral = node.status !== "integrated";
  return (
    <motion.article data-model-node={node.id} initial={false} animate={{ opacity: visible ? 1 : 0.16, scale: visible ? 1 : 0.96 }} transition={{ duration: 0.38, delay: visible ? index * 0.045 : 0 }} className={`relative z-10 flex min-h-24 items-center gap-3 rounded-2xl border bg-bg-surface/90 p-4 shadow-[var(--shadow-elevation-1)] ${neutral ? "border-border-default" : "border-accent/35"}`}>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${neutral ? "bg-white/[0.04] text-text-tertiary" : "bg-accent-soft text-accent-bright"}`}><Icon size={22} strokeWidth={1.7} /></span>
      <span className="min-w-0"><strong className="block text-sm font-semibold text-text-primary">{node.label}</strong><span className={`mt-1 block text-xs ${neutral ? "text-text-tertiary" : "text-text-secondary"}`}>{node.value}</span></span>
      {node.status === "integrated" && <Check className="ml-auto shrink-0 text-risk-low" size={16} />}
    </motion.article>
  );
}

export function ModelBuildingScreen({ model, calendar, onGoToCommandCenter, skipAnimation = false, twinCompleteness = null, operationSummary = null }: {
  model: OperationalModel; snapshotAt: string; calendar: OperationsCalendar; onGoToCommandCenter: () => void; onViewConstraints: () => void;
  skipAnimation?: boolean; activeDisruption?: MachineUnavailableDisruption | null; twinCompleteness?: TwinCompleteness | null; operationSummary?: OperationSummaryV2 | null;
}) {
  const motionSafe = useMotionSafe();
  const view = useMemo(() => buildModelBuildingViewModel(model, calendar, twinCompleteness, operationSummary), [model, calendar, twinCompleteness, operationSummary]);
  const [stage, setStage] = useState(skipAnimation || !motionSafe ? view.stages.length : 0);
  const done = stage >= view.stages.length;

  useEffect(() => {
    if (!motionSafe || stage >= view.stages.length) return;
    const timer = window.setTimeout(() => setStage((current) => current + 1), STAGE_DELAY);
    return () => window.clearTimeout(timer);
  }, [motionSafe, stage, view.stages.length]);

  const visibleNodes = stage === 0 ? 2 : stage === 1 ? 5 : view.nodes.length;
  return (
    <main className="relative min-h-screen overflow-hidden bg-bg-void px-5 py-6 text-text-primary lg:px-8">
      <div className="scene-backdrop" /><div className="scene-grid opacity-20" />
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1500px] flex-col">
        <header className="flex items-center justify-between gap-6"><div className="flex items-center gap-3"><GuardianLogo size={38} /><span className="text-lg font-semibold tracking-[0.16em]">GUARDIAN</span></div><div className="hidden text-right sm:block"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-tertiary">Modelo operativo</p><p className="mt-1 text-sm text-text-secondary">{model.company.name}</p></div></header>
        <section className="mt-8 grid flex-1 items-center gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.17em] text-accent-bright">Visualización del modelo</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{done ? "Tu operación está conectada" : "Conectando tu operación"}</h1><p className="mt-3 max-w-2xl text-base leading-relaxed text-text-secondary">{done ? "Guardian integró los datos que configuraste en un único mapa operativo." : "Guardian está organizando los datos ya procesados y trazando sus relaciones."}</p></div>
            <div className="mt-7 flex flex-wrap items-center gap-2" aria-label="Estado de integración">
              {view.stages.map((label, index) => { const active = done ? index === view.stages.length - 1 : index === Math.min(stage, view.stages.length - 1); const complete = done || index < stage; return <div key={label} className="flex items-center gap-2"><span className={`rounded-full border px-3 py-1.5 text-xs font-medium ${active ? "border-accent/50 bg-accent-soft text-accent-bright" : complete ? "border-risk-low/25 bg-risk-low-soft text-risk-low" : "border-border-default text-text-tertiary"}`}>{complete && <Check className="mr-1 inline" size={12} />} {label}</span>{index < view.stages.length - 1 && <span className="h-px w-5 bg-border-default" />}</div>; })}
            </div>
            <div className="relative mt-7 overflow-hidden rounded-[26px] border border-border-default bg-bg-base/70 p-5 shadow-[var(--shadow-elevation-2)] sm:p-7">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(62,123,250,0.13),transparent_48%)]" />
              <div className="relative grid gap-3 md:grid-cols-3">
                {view.nodes.slice(0, 3).map((node, index) => <ModelNode key={node.id} node={node} visible={index < visibleNodes} index={index} />)}
                <ModelNode node={view.nodes[3]} visible={visibleNodes > 3} index={3} />
                <motion.div initial={false} animate={{ scale: done ? 1 : 0.94, opacity: stage >= 2 ? 1 : 0.34 }} className="relative z-10 grid min-h-32 place-items-center rounded-2xl border border-accent/50 bg-[radial-gradient(circle,rgba(62,123,250,0.22),rgba(13,15,22,0.96)_68%)] text-center shadow-[0_0_48px_rgba(62,123,250,0.16)]"><div><Boxes className="mx-auto text-accent-bright" size={30} /><strong className="mt-2 block text-base">Modelo operativo</strong><span className="mt-1 block text-xs text-text-tertiary">{done ? "Integrado" : "Organizando relaciones"}</span></div></motion.div>
                <ModelNode node={view.nodes[4]} visible={visibleNodes > 4} index={4} />
                {view.nodes.slice(5).map((node, index) => <ModelNode key={node.id} node={node} visible={visibleNodes > index + 5} index={index + 5} />)}
              </div>
            </div>
            <div className="mt-6 flex min-h-12 items-center justify-end">{done && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><Button variant="gradient" onClick={onGoToCommandCenter} className="min-w-64">Ir al Command Center <ArrowRight size={17} /></Button></motion.div>}</div>
          </div>
          <aside className="hidden self-stretch xl:flex xl:flex-col xl:items-center xl:justify-center"><Guardian variant="asset" state={done ? "success" : "analyzing"} size={260} /><div className="mt-5 rounded-2xl border border-border-default bg-bg-surface/80 p-5 text-center shadow-[var(--shadow-elevation-1)]"><p className="text-sm font-semibold text-accent-bright">{done ? "Modelo listo para usar" : "Cada dato encuentra su lugar"}</p><p className="mt-2 text-sm leading-relaxed text-text-secondary">{done ? "Ya podés consultar, simular y tomar decisiones desde el Command Center." : "Productos, recursos, capacidades y calendario se integran sin alterar tu información."}</p></div></aside>
        </section>
      </div>
    </main>
  );
}
