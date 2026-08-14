"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { NodeGraph, type GraphNode } from "./NodeGraph";
import type { OperationalModel } from "@/lib/types";
import { cn } from "@/lib/cn";

function buildGraphNodes(model: OperationalModel): GraphNode[] {
  const distinctProcesses = new Set(model.resources.map((r) => r.process)).size;
  return [
    { id: "pedidos", label: "Pedidos", count: model.orders.length },
    { id: "productos", label: "Productos", count: model.products.length },
    { id: "inventario", label: "Inventario", count: model.materials.length },
    { id: "recursos", label: "Recursos", count: model.resources.length },
    { id: "capacidades", label: "Capacidades", count: distinctProcesses },
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
  const nodes = useMemo(() => buildGraphNodes(model), [model]);
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
          {done ? "OPERATIONAL MODEL READY" : "BUILDING OPERATIONAL MODEL"}
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

      <Guardian
        state={done ? "success" : "analyzing"}
        size={92}
        message={done ? `Ya entiendo cómo funciona ${model.company.name}.` : undefined}
      />

      {done && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Button onClick={onReady}>Continuar</Button>
        </motion.div>
      )}
    </div>
  );
}
