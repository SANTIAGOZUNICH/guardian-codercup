"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Compass,
  FlaskConical,
  PackageCheck,
  ScanLine,
  ClipboardList,
  Boxes,
  Workflow,
  Package,
  AlertTriangle,
  Check,
  Minus,
} from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { CapabilityBadge } from "@/components/ui/CapabilityBadge";
import { DataOriginBadge } from "@/components/ui/DataOriginBadge";
import { cn } from "@/lib/cn";
import { useMotionSafe } from "@/lib/useMotionSafe";
import type { LastSimulation, MaterialFeasibility, OperationalModel, OrderConstraints, ResourceProcess } from "@/lib/types";
import {
  buildMaterialIntelligence,
  buildProcessFlowPreview,
  buildSimulationBasisSummary,
  selectAskGuardianPrompts,
  selectHeroMetrics,
  type HeroMetric,
  type HeroMetricKind,
  type ProcessFlowStage,
} from "@/lib/view/command-center-view-model";

const PROCESS_ICON: Record<ResourceProcess, typeof FlaskConical> = {
  Elaboración: FlaskConical,
  Envasado: PackageCheck,
  Codificado: ScanLine,
};

const METRIC_ICON: Record<HeroMetricKind, typeof ClipboardList> = {
  orders: ClipboardList,
  resources: Boxes,
  processes: Workflow,
  products: Package,
  constraints: AlertTriangle,
};

const STAGE_STATUS_CLASS: Record<ProcessFlowStage["status"], string> = {
  normal: "border-border-default bg-white/[0.02] text-text-secondary",
  warning: "border-risk-medium/35 bg-risk-medium-soft text-risk-medium",
  danger: "border-risk-high/35 bg-risk-high-soft text-risk-high",
  unavailable: "border-border-default bg-white/[0.02] text-text-disabled",
};

/**
 * ============================================================================
 * Command Center — Reference-Driven Redesign
 * ============================================================================
 * Reemplaza el embed de NodeGraphV2 en el hero por un preview horizontal
 * compacto (`ProcessFlowRow`) — el grafo completo sigue existiendo tal cual
 * en Explore Twin, esto es SOLO una representación simplificada específica
 * de este resumen (nunca cambia qué procesos/datos son reales). Densidad
 * reducida a propósito: el detalle de "Active Constraint" que antes vivía acá
 * como card propia ahora se resuelve con un click en la métrica de
 * Restricciones (→ View Constraints), igual que en la referencia aprobada.
 */
export function CommandCenter({
  model,
  orderConstraints,
  lastSimulation,
  onViewConstraints,
  onExploreTwin,
  onAskGuardian,
}: {
  model: OperationalModel;
  orderConstraints: OrderConstraints[];
  lastSimulation: LastSimulation | null;
  onViewConstraints: () => void;
  onExploreTwin: () => void;
  onAskGuardian: () => void;
}) {
  const stages = buildProcessFlowPreview(model, orderConstraints);
  const metrics = selectHeroMetrics(model, orderConstraints);
  const materialIntelligence = buildMaterialIntelligence(model, orderConstraints);
  const simulationBasis = buildSimulationBasisSummary(model);
  const askPrompts = selectAskGuardianPrompts(model);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      {/* HERO — Operational Twin: preview compacto, nunca "un diagrama metido en una card" */}
      <Card className="p-5! relative overflow-hidden">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <SectionLabel icon={<Compass size={13} />}>Operational Twin</SectionLabel>
            <p className="mt-1 text-xs text-text-tertiary">Vista en vivo de tu flujo productivo</p>
          </div>
          <button
            type="button"
            onClick={onExploreTwin}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-default bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            Explorar Twin
            <ArrowUpRight size={13} />
          </button>
        </div>

        <div className="flex items-center gap-6">
          <div className="min-w-0 flex-1">
            {stages.length > 0 ? (
              <ProcessFlowRow stages={stages} />
            ) : (
              <p className="text-sm text-text-tertiary">Todavía no hay procesos declarados en este Twin.</p>
            )}
          </div>
          <div className="hidden shrink-0 sm:block">
            <Guardian state="idle" size={84} />
          </div>
        </div>
      </Card>

      {/* METRICS — solo lo que el Twin realmente conoce, nunca un grid fijo con casilleros vacíos */}
      {metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {metrics.map((m) => (
            <MetricCard key={m.kind} metric={m} onClick={m.kind === "constraints" ? onViewConstraints : undefined} />
          ))}
        </div>
      )}

      {/* MATERIAL INTELLIGENCE / SIMULATION BASIS / ASK GUARDIAN — misma prioridad visual, un solo grid de 3 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <MaterialIntelligenceCard data={materialIntelligence} onConnect={onExploreTwin} />
        {simulationBasis && <SimulationBasisCard basis={simulationBasis} />}
        <AskGuardianCard onClick={onAskGuardian} prompts={askPrompts} wide={!simulationBasis} />
      </div>

      {lastSimulation && <LastSimulationStrip data={lastSimulation} />}
    </div>
  );
}

/** Fila horizontal de procesos reales, conectados por flechas — reemplazo compacto de NodeGraphV2 en este resumen. */
function ProcessFlowRow({ stages }: { stages: ProcessFlowStage[] }) {
  const motionSafe = useMotionSafe();
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1">
      {stages.map((stage, i) => {
        const Icon = PROCESS_ICON[stage.process];
        return (
          <div key={stage.process} className="flex shrink-0 items-center gap-2">
            <div className={cn("flex min-w-[112px] flex-col items-center gap-1.5 rounded-[var(--radius-md)] border px-4 py-3 text-center", STAGE_STATUS_CLASS[stage.status])}>
              <Icon size={18} />
              <span className="text-xs font-semibold text-text-primary">{stage.process}</span>
              <span className="flex items-center gap-1 text-[10px] text-text-tertiary">
                <StatusDotInline status={stage.status} />
                {stage.resourceCount} equipo{stage.resourceCount !== 1 ? "s" : ""}
              </span>
            </div>
            {i < stages.length - 1 && (
              <motion.div
                className="h-px w-6 shrink-0 bg-[repeating-linear-gradient(to_right,var(--accent-dim)_0,var(--accent-dim)_4px,transparent_4px,transparent_7px)]"
                animate={!motionSafe ? { opacity: 0.6 } : { opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 2.4, repeat: motionSafe ? Infinity : 0, ease: "easeInOut" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusDotInline({ status }: { status: ProcessFlowStage["status"] }) {
  const cls = status === "danger" ? "bg-risk-high" : status === "warning" ? "bg-risk-medium" : "bg-accent-bright";
  return <span className={cn("h-1 w-1 rounded-full", cls)} />;
}

function MetricCard({ metric, onClick }: { metric: HeroMetric; onClick?: () => void }) {
  const Icon = METRIC_ICON[metric.kind];
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-md)] border border-border-subtle bg-white/[0.015] px-4 py-3.5 text-left transition-colors",
        onClick && "cursor-pointer hover:border-border-strong",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
          metric.tone === "danger" ? "bg-risk-high-soft text-risk-high" : "bg-accent-soft text-accent-bright",
        )}
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className={cn("text-xl font-semibold leading-none tabular-nums", metric.tone === "danger" ? "text-risk-high" : "text-text-primary")}>
          {metric.value.toLocaleString("es-AR")}
        </p>
        <p className="mt-1 truncate text-xs text-text-tertiary">{metric.label}</p>
      </div>
    </Wrapper>
  );
}

function MaterialIntelligenceCard({
  data,
  onConnect,
}: {
  data: { connected: boolean; materialConstraintCount: number };
  onConnect: () => void;
}) {
  return (
    <Card className="p-5! flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Material Intelligence</SectionLabel>
        <CapabilityBadge connected={data.connected} />
      </div>
      {data.connected ? (
        <div>
          <p className="text-sm text-text-secondary">Fórmulas + inventario conectados</p>
          <p className="mt-1 text-sm font-medium text-text-primary">
            {data.materialConstraintCount} restricci{data.materialConstraintCount !== 1 ? "ones" : "ón"} de material
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-text-secondary">Conectá fórmulas + inventario para evaluar disponibilidad de materiales.</p>
          <Button variant="ghost" onClick={onConnect} className="mt-auto w-full justify-center">
            Conectar
          </Button>
        </>
      )}
    </Card>
  );
}

function SimulationBasisCard({ basis }: { basis: { companyDataCount: number; referenceEstimateCount: number } }) {
  return (
    <Card className="p-5! flex flex-col gap-3">
      <SectionLabel>Simulation Basis</SectionLabel>
      <div className="flex flex-col gap-2.5">
        {basis.companyDataCount > 0 && (
          <div className="flex items-center justify-between">
            <DataOriginBadge origin="company_data" />
            <span className="text-sm font-semibold tabular-nums text-text-primary">{basis.companyDataCount}</span>
          </div>
        )}
        {basis.referenceEstimateCount > 0 && (
          <div className="flex items-center justify-between">
            <DataOriginBadge origin="reference_estimate" />
            <span className="text-sm font-semibold tabular-nums text-text-primary">{basis.referenceEstimateCount}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Card protagonista pero no gigante — input decorativo + Guardian mini + ejemplos reales, todo lleva al mismo lugar: Ask Guardian. */
function AskGuardianCard({ onClick, prompts, wide }: { onClick: () => void; prompts: string[]; wide: boolean }) {
  const motionSafe = useMotionSafe();
  return (
    <Card
      glow
      className={cn("p-5! flex flex-col gap-4", wide && "lg:col-span-2")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionLabel className="text-accent-bright/80">Ask Guardian</SectionLabel>
          <p className="mt-1 text-sm text-text-secondary">Preguntale algo sobre tu operación.</p>
        </div>
        <Guardian state="idle" size={40} className="shrink-0 gap-0" />
      </div>

      <motion.button
        type="button"
        onClick={onClick}
        whileHover={motionSafe ? { scale: 1.006 } : undefined}
        className="flex items-center justify-between gap-3 rounded-full border border-border-default bg-white/[0.02] px-4 py-2.5 text-left transition-colors hover:border-accent/40"
      >
        <span className="truncate text-sm text-text-tertiary">¿Qué querés saber sobre tu operación?</span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white">
          <ArrowRight size={14} />
        </span>
      </motion.button>

      {prompts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {prompts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={onClick}
              className="rounded-full border border-border-default bg-white/[0.015] px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

const MATERIALS_LABEL: Record<MaterialFeasibility, string> = { pass: "PASS", fail: "FAIL", not_evaluated: "NO EVALUADO" };

function InlineCheck({ ok, label, value }: { ok: boolean | null; label: string; value: string }) {
  const Icon = ok === null ? Minus : Check;
  const tone = ok === null ? "text-text-tertiary" : ok ? "text-risk-low" : "text-risk-high";
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-text-tertiary">{label}</span>
      <span className={cn("flex items-center gap-1 text-xs font-semibold", tone)}>
        <Icon size={12} />
        {value}
      </span>
    </div>
  );
}

/** Franja horizontal — nunca una card grande. Los 3 checks salen de los mismos campos reales que ya calculó evaluateScenario(). */
function LastSimulationStrip({ data }: { data: LastSimulation }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border-subtle bg-white/[0.015] px-5 py-3.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
          Última Simulación
          {data.disruptionLabel && (
            <span className="rounded-full border border-risk-medium/30 bg-risk-medium-soft px-2 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-risk-medium">
              ⚠ {data.disruptionLabel}
            </span>
          )}
        </p>
        <p className="mt-1 truncate text-sm text-text-primary">{data.goalSummary}</p>
      </div>
      <div className="hidden items-center gap-5 md:flex">
        <InlineCheck ok={data.capacityFeasible} label="Capacidad" value={data.capacityFeasible ? "PASS" : "FAIL"} />
        <InlineCheck ok={data.deadlineMet} label="Fecha" value={data.deadlineMet ? "PASS" : "FAIL"} />
        <InlineCheck
          ok={data.materialsFeasible === "not_evaluated" ? null : data.materialsFeasible === "pass"}
          label="Materiales"
          value={MATERIALS_LABEL[data.materialsFeasible]}
        />
      </div>
      <Button variant="ghost" className="shrink-0">
        Ver resultados
        <ArrowRight size={14} />
      </Button>
    </div>
  );
}
