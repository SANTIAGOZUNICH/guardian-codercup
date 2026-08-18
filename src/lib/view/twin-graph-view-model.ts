import type { MachineUnavailableDisruption, OperationalModel, OrderConstraints } from "@/lib/types";

/**
 * ============================================================================
 * Twin Graph View Model — selector puro que arma la estructura del
 * Operational Twin V2 (3 capas) a partir del modelo real + constraints ya
 * calculados. Cero SVG acá, cero JSX — testeable sin montar React.
 * ============================================================================
 */

export type GraphNodeStatus = "normal" | "warning" | "danger" | "unavailable";

export interface GraphNodeV2 {
  id: string;
  label: string;
  count: number | null;
  /**
   * Segunda línea de texto opcional, solo usada por el nodo satélite de
   * disrupción (ej. "UNAVAILABLE") — nunca por los nodos estructurales del
   * Twin, que usan `count`.
   */
  sublabel?: string;
  status: GraphNodeStatus;
  shape: "circle" | "pill";
  x: number;
  y: number;
  /** Fase (1-6) del storytelling en la que este nodo se revela. */
  revealAt: number;
}

export interface GraphEdgeV2 {
  from: string;
  to: string;
  /**
   * "disrupted" es semánticamente distinto de "flag": una flag señala un
   * problema DETECTADO (constraint real); "disrupted" señala una conexión
   * hacia un recurso que dejó de estar disponible por una disrupción
   * hipotética activa (Checkpoint 6) — nunca se mezclan.
   */
  kind: "structural" | "flag" | "disrupted";
  revealAt: number;
}

export interface TwinGraph {
  nodes: GraphNodeV2[];
  edges: GraphEdgeV2[];
  totalPhases: number;
}

export const PIPELINE_LABEL: Record<string, string> = {
  Elaboración: "Elaboración",
  Envasado: "Envasado",
  Codificado: "Codificado",
};

const PIPELINE_ORDER = ["Elaboración", "Envasado", "Codificado"] as const;

export function buildTwinGraph(
  model: OperationalModel,
  orderConstraints: OrderConstraints[],
  /** Disrupción activa de la sesión (Checkpoint 6) — null/undefined en el Twin original, sin cambios visuales. */
  activeDisruption?: MachineUnavailableDisruption | null,
): TwinGraph {
  const allConstraints = orderConstraints.flatMap((oc) => oc.constraints);
  const hasMaterialConstraint = allConstraints.some((c) => c.kind === "material_shortage");
  const hasDeadlineConstraint = allConstraints.some((c) => c.kind === "deadline_at_risk");
  const hasCritical = orderConstraints.some((oc) => oc.severity === "critical");

  // Bottleneck real de los pedidos afectados -> qué etapa de Production Flow se resalta.
  const affected = orderConstraints.filter((oc) => oc.constraints.length > 0);
  const bottleneckSeverityByProcess = new Map<string, "critical" | "high">();
  for (const oc of affected) {
    // Sin Production Reference evaluable no hay ningún step que resaltar — nunca se inventa uno.
    if (!oc.scenario.bottleneck) continue;
    const process = oc.scenario.bottleneck.process;
    const current = bottleneckSeverityByProcess.get(process);
    if (oc.severity === "critical" || (oc.severity === "high" && current !== "critical")) {
      bottleneckSeverityByProcess.set(process, oc.severity);
    }
  }

  const materialsInBom = new Set(
    model.profiles.flatMap((p) => p.materials.flatMap((s) => s.materialsPerUnit.map((m) => m.materialCode))),
  ).size;
  const processesInProfiles = new Set(model.profiles.flatMap((p) => p.productionReference.map((s) => s.process))).size;

  const constraintsStatus: GraphNodeStatus = allConstraints.length === 0 ? "normal" : hasCritical ? "danger" : "warning";

  const nodes: GraphNodeV2[] = [
    // Layer 1 — Source Data
    { id: "orders", label: "Pedidos", count: model.orders.length, status: "normal", shape: "circle", x: 250, y: 110, revealAt: 1 },
    {
      id: "inventory",
      label: "Inventario",
      count: model.inventory.length,
      status: hasMaterialConstraint ? "danger" : "normal",
      shape: "circle",
      x: 500,
      y: 110,
      revealAt: 1,
    },
    { id: "resources", label: "Recursos", count: model.resources.length, status: "normal", shape: "circle", x: 750, y: 110, revealAt: 1 },

    // Layer 2 — Operational Understanding
    { id: "products", label: "Productos", count: model.products.length, status: "normal", shape: "circle", x: 80, y: 320, revealAt: 3 },
    {
      id: "materials",
      label: "Materiales",
      count: materialsInBom,
      status: hasMaterialConstraint ? "danger" : "normal",
      shape: "circle",
      x: 290,
      y: 320,
      revealAt: 3,
    },
    {
      id: "processes",
      label: "Procesos",
      count: processesInProfiles,
      status: hasDeadlineConstraint ? "warning" : "normal",
      shape: "circle",
      x: 500,
      y: 320,
      revealAt: 3,
    },
    {
      id: "capacities",
      label: "Capacidades",
      count: model.resources.length,
      status: hasDeadlineConstraint ? "warning" : "normal",
      shape: "circle",
      x: 710,
      y: 320,
      revealAt: 3,
    },
    {
      id: "constraints",
      label: "Restricciones",
      count: allConstraints.length,
      status: constraintsStatus,
      shape: "circle",
      x: 920,
      y: 320,
      revealAt: 5,
    },

    // Layer 3 — Production Flow
    ...PIPELINE_ORDER.map((process, i) => {
      const severity = bottleneckSeverityByProcess.get(process);
      const status: GraphNodeStatus = severity ? "warning" : "normal"; // el rojo queda solo para material (ver reporte)
      return {
        id: `flow-${i}`,
        label: PIPELINE_LABEL[process],
        count: null,
        status,
        shape: "pill" as const,
        x: 340 + i * 220,
        y: 520,
        revealAt: 4,
      };
    }),
  ];

  const edges: GraphEdgeV2[] = [
    { from: "orders", to: "products", kind: "structural", revealAt: 2 },
    { from: "products", to: "materials", kind: "structural", revealAt: 2 },
    { from: "materials", to: "inventory", kind: "structural", revealAt: 2 },
    { from: "products", to: "processes", kind: "structural", revealAt: 2 },
    { from: "processes", to: "resources", kind: "structural", revealAt: 2 },
    { from: "resources", to: "capacities", kind: "structural", revealAt: 2 },
    { from: "processes", to: "flow-0", kind: "structural", revealAt: 4 },
    { from: "flow-0", to: "flow-1", kind: "structural", revealAt: 4 },
    { from: "flow-1", to: "flow-2", kind: "structural", revealAt: 4 },
  ];

  if (allConstraints.length > 0) {
    if (hasMaterialConstraint) {
      edges.push({ from: "constraints", to: "materials", kind: "flag", revealAt: 5 });
      edges.push({ from: "constraints", to: "inventory", kind: "flag", revealAt: 5 });
    }
    if (hasDeadlineConstraint) {
      edges.push({ from: "constraints", to: "processes", kind: "flag", revealAt: 5 });
    }
  }

  // Nodo satélite de disrupción (Checkpoint 6) — solo existe si hay una
  // disrupción activa Y el recurso que nombra realmente está en el Twin.
  // Sin disrupción, este bloque no agrega nada: el Twin queda idéntico al
  // que ya se devolvía antes de este checkpoint.
  if (activeDisruption) {
    const resource = model.resources.find((r) => r.id === activeDisruption.resourceId);
    const flowIndex = resource ? PIPELINE_ORDER.indexOf(resource.process) : -1;
    if (resource && flowIndex !== -1) {
      const flowNodeId = `flow-${flowIndex}`;
      const flowNode = nodes.find((n) => n.id === flowNodeId);
      if (flowNode) {
        const disruptionNodeId = `disruption-${resource.id}`;
        nodes.push({
          id: disruptionNodeId,
          label: resource.name,
          count: null,
          sublabel: "NO DISPONIBLE",
          status: "unavailable",
          shape: "pill",
          x: flowNode.x,
          y: 585,
          revealAt: 6,
        });
        edges.push({ from: flowNodeId, to: disruptionNodeId, kind: "disrupted", revealAt: 6 });
      }
    }
  }

  return { nodes, edges, totalPhases: 6 };
}
