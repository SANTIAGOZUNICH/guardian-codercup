"use client";

import { motion } from "framer-motion";

export type GraphNodeStatus = "normal" | "warning" | "danger";

export interface GraphNode {
  id: string;
  label: string;
  count: number;
  status?: GraphNodeStatus;
}

const STATUS_COLOR: Record<GraphNodeStatus, string> = {
  normal: "var(--accent-bright)",
  warning: "var(--risk-medium)",
  danger: "var(--risk-high)",
};

const STATUS_BORDER: Record<GraphNodeStatus, string> = {
  normal: "var(--border-strong)",
  warning: "var(--risk-medium)",
  danger: "var(--risk-high)",
};

const WIDTH = 640;
const HEIGHT = 460;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
const RADIUS = 175;

function nodePosition(index: number, total: number) {
  const angle = -90 + (360 / total) * index;
  const rad = (angle * Math.PI) / 180;
  return {
    x: CENTER.x + RADIUS * Math.cos(rad),
    y: CENTER.y + RADIUS * Math.sin(rad),
  };
}

/**
 * Grafo del Operational Model en construcción: nodo central (la empresa) con
 * conexiones animadas hacia cada categoría de datos, revelándose una por una
 * a medida que `revealed` avanza.
 */
export function NodeGraph({
  companyName,
  nodes,
  revealed,
}: {
  companyName: string;
  nodes: GraphNode[];
  revealed: number;
}) {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full max-w-2xl"
      role="img"
      aria-label="Operational Model en construcción"
    >
      {nodes.map((node, i) => {
        if (i >= revealed) return null;
        const pos = nodePosition(i, nodes.length);
        return (
          <motion.line
            key={`line-${node.id}`}
            x1={CENTER.x}
            y1={CENTER.y}
            x2={pos.x}
            y2={pos.y}
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeOpacity={0.4}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.4 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        );
      })}

      {/* Nodo central */}
      <motion.g
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <circle cx={CENTER.x} cy={CENTER.y} r={44} fill="var(--bg-elevated)" stroke="var(--accent)" strokeWidth={1.5} />
        <circle cx={CENTER.x} cy={CENTER.y} r={44} fill="var(--accent)" opacity={0.08} />
        <text
          x={CENTER.x}
          y={CENTER.y + 4}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill="var(--text-primary)"
        >
          {companyName.length > 16 ? companyName.slice(0, 15) + "…" : companyName}
        </text>
      </motion.g>

      {nodes.map((node, i) => {
        if (i >= revealed) return null;
        const pos = nodePosition(i, nodes.length);
        const status = node.status ?? "normal";
        return (
          <motion.g
            key={node.id}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <circle
              cx={pos.x}
              cy={pos.y}
              r={38}
              fill="var(--bg-surface)"
              stroke={STATUS_BORDER[status]}
              strokeWidth={status === "normal" ? 1 : 1.5}
            />
            <text
              x={pos.x}
              y={pos.y - 6}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              letterSpacing={0.5}
              fill="var(--text-tertiary)"
              style={{ textTransform: "uppercase" }}
            >
              {node.label}
            </text>
            <text
              x={pos.x}
              y={pos.y + 14}
              textAnchor="middle"
              fontSize={16}
              fontWeight={700}
              fill={STATUS_COLOR[status]}
            >
              {node.count}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}
