"use client";

import { useMemo } from "react";
import { Check, X, ArrowLeft } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { simulateGoal } from "@/lib/engine/simulation-engine";
import { buildDisruptionResourceView, buildReSimulateGuardianMessage } from "@/lib/view/disruption-view-model";
import type { Goal, MachineUnavailableDisruption, OperationalModel, OperationsCalendar } from "@/lib/types";

/**
 * Operational Disruption — muestra el fragmento del Twin afectado (before/
 * after de disponibilidad y capacidad efectiva) ANTES de re-simular. El
 * cálculo real (simulateGoal sobre model y disruptedModel) es el mismo
 * Simulation Engine del Checkpoint 5 — acá solo se lee su resultado.
 */
export function DisruptionScreen({
  model,
  disruptedModel,
  disruption,
  resourceName,
  goal,
  calendar,
  snapshotAt,
  onReSimulate,
  onBack,
}: {
  model: OperationalModel;
  disruptedModel: OperationalModel;
  disruption: MachineUnavailableDisruption;
  resourceName: string;
  goal: Goal;
  calendar: OperationsCalendar;
  snapshotAt: string;
  onReSimulate: () => void;
  onBack: () => void;
}) {
  const before = useMemo(() => simulateGoal(model, goal, calendar, snapshotAt), [model, goal, calendar, snapshotAt]);
  const after = useMemo(
    () => simulateGoal(disruptedModel, goal, calendar, snapshotAt),
    [disruptedModel, goal, calendar, snapshotAt],
  );
  const view = useMemo(
    () => buildDisruptionResourceView(model, disruptedModel, disruption, resourceName, before, after),
    [model, disruptedModel, disruption, resourceName, before, after],
  );

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-tertiary">Disrupción operativa</p>

      <Guardian state="alert" size={90} message={view.guardianAlertMessage} />

      <div className="w-full max-w-lg rounded-[var(--radius-lg)] border border-risk-medium/30 bg-white/[0.015] p-6">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">{view.processLabel}</p>

        <div className="flex flex-col gap-3">
          {view.machines.map((m) => (
            <div
              key={m.resourceId}
              className="flex items-center justify-between rounded-[var(--radius-sm)] border border-border-subtle px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-text-primary">{m.name}</p>
                <p className="text-xs text-text-tertiary">{m.capacityLabel}</p>
              </div>
              {m.available ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-risk-low">
                  <Check size={13} /> Disponible
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-risk-high">
                  <X size={13} /> No disponible
                </span>
              )}
            </div>
          ))}
        </div>

        {(view.capacityBeforeLabel || view.capacityAfterLabel) && (
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border-subtle pt-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Capacidad antes</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{view.capacityBeforeLabel ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Capacidad después</p>
              <p className="mt-1 text-lg font-semibold text-risk-medium">{view.capacityAfterLabel ?? "—"}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        <p className="text-xs text-text-tertiary">{buildReSimulateGuardianMessage()}</p>
        <Button onClick={onReSimulate}>Volver a simular →</Button>
      </div>

      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft size={15} />
        Volver al Centro de Operaciones
      </Button>
    </div>
  );
}
