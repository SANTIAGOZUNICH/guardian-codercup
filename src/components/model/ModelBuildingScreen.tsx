"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { NodeGraphV2 } from "./NodeGraphV2";
import { MissingDataModal } from "@/components/guided-setup/TwinCompletenessSummary";
import type { MachineUnavailableDisruption, OperationalModel, OperationsCalendar, TwinCompleteness } from "@/lib/types";
import { detectConstraints } from "@/lib/engine/constraint-detection";
import { buildTwinGraph } from "@/lib/view/twin-graph-view-model";
import { buildMissingDataLabel, totalMissingCount } from "@/lib/view/guided-setup-view-model";
import {
  buildGuardianTwinReadyMessage,
  buildTwinReadySummary,
  resolveTwinReadyCta,
} from "@/lib/view/constraint-view-model";

// Duración de cada fase del storytelling (ms). Suma ~4s: deliberado, no 15s.
const PHASE_DELAYS = [400, 650, 700, 700, 900, 700];

export function ModelBuildingScreen({
  model,
  snapshotAt,
  calendar,
  onViewConstraints,
  onGoToCommandCenter,
  /** Si viene true, arranca ya revelado (usado por "Explore Twin" desde Command Center) — no repite la animación. */
  skipAnimation = false,
  /** Disrupción activa de la sesión (Checkpoint 6) — Explore Twin debe conservar el mismo estado visual que dejó la Disruption Screen. */
  activeDisruption = null,
  /**
   * Solo presente cuando el Twin vino de Guided Setup (Checkpoint 7). Ausente
   * (undefined) en el path de Excel — el render queda idéntico al de siempre.
   */
  twinCompleteness = null,
}: {
  model: OperationalModel;
  snapshotAt: string;
  calendar: OperationsCalendar;
  onViewConstraints: () => void;
  onGoToCommandCenter: () => void;
  skipAnimation?: boolean;
  activeDisruption?: MachineUnavailableDisruption | null;
  twinCompleteness?: TwinCompleteness | null;
}) {
  const [showMissingData, setShowMissingData] = useState(false);
  const missingCount = twinCompleteness ? totalMissingCount(twinCompleteness) : 0;
  const orderConstraints = useMemo(
    () => detectConstraints(model, calendar, snapshotAt),
    [model, calendar, snapshotAt],
  );
  const graph = useMemo(
    () => buildTwinGraph(model, orderConstraints, activeDisruption),
    [model, orderConstraints, activeDisruption],
  );
  const summary = useMemo(() => buildTwinReadySummary(orderConstraints), [orderConstraints]);

  const [phase, setPhase] = useState(skipAnimation ? graph.totalPhases : 0);
  const done = phase >= graph.totalPhases;

  useEffect(() => {
    if (phase >= graph.totalPhases) return;
    const delay = PHASE_DELAYS[phase] ?? 500;
    const t = setTimeout(() => setPhase((p) => p + 1), delay);
    return () => clearTimeout(t);
  }, [phase, graph.totalPhases]);

  const hasConstraints = summary.totalConstraints > 0;
  const cta = resolveTwinReadyCta(summary);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-tertiary">
          {done ? "MODELO OPERACIONAL LISTO" : "CONSTRUYENDO MODELO OPERACIONAL"}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">{model.company.name}</h2>
      </div>

      <div className="relative w-full max-w-4xl">
        <NodeGraphV2 nodes={graph.nodes} edges={graph.edges} phase={phase} />

        {/* Guardian integrado a la escena, no como loading icon suelto abajo. */}
        <motion.div
          className="pointer-events-none absolute bottom-0 right-2 sm:right-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Guardian
            state={done ? "success" : "analyzing"}
            size={done ? 100 : 84}
            message={done ? buildGuardianTwinReadyMessage(model.company.name, summary) : undefined}
          />
        </motion.div>
      </div>

      {done && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs font-medium uppercase tracking-[0.1em] text-text-tertiary"
        >
          {hasConstraints
            ? `${summary.totalConstraints} restricci${summary.totalConstraints !== 1 ? "ones" : "ón"} · ${summary.affectedOrders} pedido${summary.affectedOrders !== 1 ? "s" : ""} afectado${summary.affectedOrders !== 1 ? "s" : ""}`
            : "0 restricciones"}
        </motion.p>
      )}

      {done && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-wrap items-center justify-center gap-3"
        >
          {cta.primary === "view-constraints" ? (
            <Button onClick={onViewConstraints}>Ver restricciones</Button>
          ) : (
            <Button onClick={onGoToCommandCenter}>Ir al Centro de Operaciones</Button>
          )}
          {cta.showSecondary && (
            <Button variant="ghost" onClick={onGoToCommandCenter}>
              Ir al Centro de Operaciones
            </Button>
          )}
        </motion.div>
      )}

      {done && twinCompleteness && missingCount > 0 && (
        <motion.button
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          onClick={() => setShowMissingData(true)}
          className="rounded-full border border-border-default bg-white/[0.02] px-4 py-1.5 text-xs font-medium text-text-tertiary transition-colors hover:border-border-strong hover:text-text-secondary"
        >
          {buildMissingDataLabel(twinCompleteness)} · Revisar datos faltantes
        </motion.button>
      )}

      {showMissingData && twinCompleteness && (
        <MissingDataModal completeness={twinCompleteness} onClose={() => setShowMissingData(false)} />
      )}
    </div>
  );
}
