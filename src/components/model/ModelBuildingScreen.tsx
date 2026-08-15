"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { NodeGraph, type GraphNode } from "./NodeGraph";
import type { OperationalModel } from "@/lib/types";
import { detectConstraints } from "@/lib/engine/constraint-detection";
import { buildGuardianTwinReadyMessage, buildTwinReadySummary } from "@/lib/view/constraint-view-model";
import { cn } from "@/lib/cn";

function buildGraphNodes(model: OperationalModel, orderConstraints: ReturnType<typeof detectConstraints>): GraphNode[] {
  const distinctProcesses = new Set(model.resources.map((r) => r.process)).size;
  const allConstraints = orderConstraints.flatMap((oc) => oc.constraints);
  const hasMaterialConstraint = allConstraints.some((c) => c.kind === "material_shortage");
  const hasDeadlineConstraint = allConstraints.some((c) => c.kind === "deadline_at_risk");
  const hasCritical = orderConstraints.some((oc) => oc.severity === "critical");

  return [
    { id: "pedidos", label: "Pedidos", count: model.orders.length },
    { id: "productos", label: "Productos", count: model.products.length },
    {
      id: "inventario",
      label: "Inventario",
      count: model.materials.length,
      status: hasMaterialConstraint ? "danger" : "normal",
    },
    { id: "recursos", label: "Recursos", count: model.resources.length },
    {
      id: "capacidades",
      label: "Capacidades",
      count: distinctProcesses,
      status: hasDeadlineConstraint ? "warning" : "normal",
    },
    {
      id: "constraints",
      label: "Constraints",
      count: allConstraints.length,
      status: allConstraints.length === 0 ? "normal" : hasCritical ? "danger" : "warning",
    },
  ];
}

const STEP_DELAY_MS = 550;

export function ModelBuildingScreen({
  model,
  onReady,
}: {
  model: OperationalModel;
  onReady: () => void;
}) {
  const orderConstraints = useMemo(() => detectConstraints(model), [model]);
  const nodes = useMemo(() => buildGraphNodes(model, orderConstraints), [model, orderConstraints]);
  const summary = useMemo(() => buildTwinReadySummary(orderConstraints), [orderConstraints]);
  const [revealed, setRevealed] = useState(0);
  const done = revealed >= nodes.length;

  useEffect(() => {
    if (revealed >= nodes.length) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), revealed === 0 ? 300 : STEP_DELAY_MS);
    return () => clearTimeout(t);
  }, [revealed, nodes.length]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-tertiary">
          {done ? "OPERATIONAL TWIN READY" : "BUILDING OPERATIONAL TWIN"}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
          {model.company.name}
        </h2>
      </div>

      <NodeGraph companyName={model.company.name} nodes={nodes} revealed={revealed} />

      <ul className="flex flex-wrap justify-center gap-x-8 gap-y-2">
        {nodes.map((node, i) => (
          <li
            key={node.id}
            className={cn(
              "flex items-center gap-2 text-sm font-medium transition-colors duration-300",
              i < revealed ? "text-text-primary" : "text-text-disabled",
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border transition-all duration-300",
                i < revealed ? "border-accent bg-accent-soft text-accent-bright" : "border-border-default",
              )}
            >
              {i < revealed && <Check size={12} />}
            </span>
            {node.label.toUpperCase()}
          </li>
        ))}
      </ul>

      {done && summary.totalConstraints > 0 && (
        <p className="text-xs font-medium uppercase tracking-[0.1em] text-text-tertiary">
          {summary.totalConstraints} constraint{summary.totalConstraints !== 1 ? "s" : ""} · {summary.affectedOrders} order
          {summary.affectedOrders !== 1 ? "s" : ""} affected
        </p>
      )}

      <Guardian
        state={done ? "success" : "analyzing"}
        size={92}
        message={done ? buildGuardianTwinReadyMessage(model.company.name, summary) : undefined}
      />

      {done && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Button onClick={onReady}>Continuar</Button>
        </motion.div>
      )}
    </div>
  );
}
