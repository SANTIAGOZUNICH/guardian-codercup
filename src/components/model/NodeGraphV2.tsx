"use client";

import { motion } from "framer-motion";
import type { GraphNodeV2, GraphEdgeV2, GraphNodeStatus } from "@/lib/view/twin-graph-view-model";

const STATUS_COLOR: Record<GraphNodeStatus, string> = {
  normal: "var(--accent-bright)",
  warning: "var(--risk-medium)",
  danger: "var(--risk-high)",
  // Mismo tono que "danger" (ambos son "algo dejó de estar bien"), pero la opacidad
  // reducida del grupo entero (ver `unavailable` más abajo) es lo que lo distingue
  // visualmente de un problema DETECTADO — nunca se mezclan las dos semánticas.
  unavailable: "var(--risk-high)",
};

const STATUS_BORDER: Record<GraphNodeStatus, string> = {
  normal: "var(--border-strong)",
  warning: "var(--risk-medium)",
  danger: "var(--risk-high)",
  unavailable: "var(--risk-high)",
};

/** Opacidad del nodo completo — "unavailable" se ve atenuado (hipótesis aplicada), nunca a plena intensidad como un problema detectado. */
const STATUS_OPACITY: Record<GraphNodeStatus, number> = {
  normal: 1,
  warning: 1,
  danger: 1,
  unavailable: 0.55,
};

const WIDTH = 1000;
const HEIGHT = 620;
const CIRCLE_R = 40;
const PILL_W = 148;
const PILL_H = 60;

function anchorPoint(node: GraphNodeV2, towards: { x: number; y: number }) {
  const dx = towards.x - node.x;
  const dy = towards.y - node.y;
  const dist = Math.hypot(dx, dy) || 1;
  if (node.shape === "circle") {
    return { x: node.x + (dx / dist) * CIRCLE_R, y: node.y + (dy / dist) * CIRCLE_R };
  }
  // pill: salir por el borde horizontal más cercano
  const halfW = PILL_W / 2;
  const halfH = PILL_H / 2;
  if (Math.abs(dx) > Math.abs(dy)) {
    return { x: node.x + Math.sign(dx) * halfW, y: node.y };
  }
  return { x: node.x, y: node.y + Math.sign(dy) * halfH };
}

/**
 * Operational Twin V2 — tres capas con significado (Source Data / Operational
 * Understanding / Production Flow) en vez de un hub genérico de círculos.
 * Layout fijo (no radial-genérico) porque cada nodo tiene un rol distinto.
 */
export function NodeGraphV2({
  nodes,
  edges,
  phase,
}: {
  nodes: GraphNodeV2[];
  edges: GraphEdgeV2[];
  phase: number;
}) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full max-w-4xl"
      role="img"
      aria-label="Operational Twin"
    >
      {/* Etiquetas de capa */}
      <text x={40} y={40} fontSize={11} fontWeight={600} letterSpacing={1.5} fill="var(--text-tertiary)" style={{ textTransform: "uppercase" }}>
        Source Data
      </text>
      <text x={40} y={252} fontSize={11} fontWeight={600} letterSpacing={1.5} fill="var(--text-tertiary)" style={{ textTransform: "uppercase" }}>
        Operational Understanding
      </text>
      <text x={40} y={452} fontSize={11} fontWeight={600} letterSpacing={1.5} fill="var(--text-tertiary)" style={{ textTransform: "uppercase" }}>
        Production Flow
      </text>

      {/* Edges */}
      {edges.map((edge, i) => {
        if (phase < edge.revealAt) return null;
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        if (!from || !to) return null;
        const p1 = anchorPoint(from, to);
        const p2 = anchorPoint(to, from);
        const isFlag = edge.kind === "flag";
        // "disrupted" queda deliberadamente MÁS tenue que una flag de constraint —
        // una flag señala un problema real que reclama atención; una conexión
        // disrupted representa una parte del modelo que se apagó, no una alarma.
        const isDisrupted = edge.kind === "disrupted";
        const edgeOpacity = isDisrupted ? 0.22 : isFlag ? 0.55 : 0.35;
        return (
          <motion.line
            key={`${edge.from}-${edge.to}-${i}`}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={isDisrupted ? "var(--risk-high)" : isFlag ? STATUS_COLOR[to.status] : "var(--accent)"}
            strokeWidth={isDisrupted ? 1 : isFlag ? 1.5 : 1.25}
            strokeDasharray={isDisrupted ? "2 5" : isFlag ? "3 4" : undefined}
            strokeOpacity={edgeOpacity}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: edgeOpacity }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        );
      })}

      {/* Nodos */}
      {nodes.map((node) => {
        if (phase < node.revealAt) return null;
        const isUnavailable = node.status === "unavailable";
        const fill = isUnavailable ? "var(--bg-base)" : "var(--bg-surface)";
        return (
          <motion.g
            key={node.id}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: STATUS_OPACITY[node.status], scale: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {node.shape === "circle" ? (
              <circle
                cx={node.x}
                cy={node.y}
                r={CIRCLE_R}
                fill={fill}
                stroke={STATUS_BORDER[node.status]}
                strokeWidth={node.status === "normal" ? 1 : 1.75}
              />
            ) : (
              <rect
                x={node.x - PILL_W / 2}
                y={node.y - PILL_H / 2}
                width={PILL_W}
                height={PILL_H}
                rx={PILL_H / 2}
                fill={fill}
                stroke={STATUS_BORDER[node.status]}
                strokeWidth={node.status === "normal" ? 1 : 1.75}
              />
            )}
            <text
              x={node.x}
              y={node.shape === "circle" ? node.y - 6 : node.y - 4}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={600}
              letterSpacing={0.4}
              fill="var(--text-tertiary)"
              style={{ textTransform: "uppercase" }}
            >
              {node.label}
            </text>
            {node.count !== null && (
              <text
                x={node.x}
                y={node.shape === "circle" ? node.y + 15 : node.y + 16}
                textAnchor="middle"
                fontSize={16}
                fontWeight={700}
                fill={STATUS_COLOR[node.status]}
              >
                {node.count}
              </text>
            )}
            {node.sublabel && (
              <text
                x={node.x}
                y={node.shape === "circle" ? node.y + 15 : node.y + 16}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                letterSpacing={0.5}
                fill={STATUS_COLOR[node.status]}
                style={{ textTransform: "uppercase" }}
              >
                {node.sublabel}
              </text>
            )}
            {isUnavailable && (
              <text
                x={node.x + (node.shape === "circle" ? CIRCLE_R * 0.6 : PILL_W / 2 - 16)}
                y={node.shape === "circle" ? node.y - CIRCLE_R * 0.5 : node.y - PILL_H / 2 + 15}
                textAnchor="middle"
                fontSize={12}
                fontWeight={700}
                fill="var(--risk-high)"
              >
                ×
              </text>
            )}
          </motion.g>
        );
      })}
    </svg>
  );
}

export { WIDTH as GRAPH_WIDTH, HEIGHT as GRAPH_HEIGHT };
