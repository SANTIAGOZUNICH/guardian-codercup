"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, ArrowLeft } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";
import { parseGoalText } from "@/lib/engine/goal-parser";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";
import type { Goal, OperationalModel } from "@/lib/types";

const CHIPS = ["Can we deliver earlier?", "Simulate a production goal", "Check available capacity"];

const EXAMPLE_PLACEHOLDER = "Necesito producir 30.000 shampoos para TCL antes del viernes.";

function errorMessage(kind: "unknown_product" | "missing_quantity" | "missing_deadline", companyName: string): string {
  switch (kind) {
    case "unknown_product":
      return `No encontré ese producto dentro del Operational Twin de ${companyName}.`;
    case "missing_quantity":
      return "No pude identificar una cantidad. Probá indicando un número, por ejemplo: 30.000 unidades.";
    case "missing_deadline":
      return "No pude identificar una fecha límite. Probá con \"hoy\", \"mañana\", un día de la semana, o \"la próxima semana\".";
  }
}

export function AskGuardianScreen({
  model,
  companyName,
  snapshotAt,
  onGoalReady,
  onBack,
}: {
  model: OperationalModel;
  companyName: string;
  snapshotAt: string;
  onGoalReady: (goal: Goal) => void;
  onBack: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  function handleSubmit() {
    if (!text.trim()) return;
    const result = parseGoalText(text, { model, snapshotAt, calendar: DEFAULT_OPERATIONS_CALENDAR });
    if (!result.ok) {
      setError(errorMessage(result.error.kind, companyName));
      return;
    }
    setError(null);
    onGoalReady(result.goal);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-tertiary">
          Ask Guardian About the Future
        </p>
        <p className="mt-2 text-sm text-text-secondary">Describe an operational goal or hypothetical scenario.</p>
      </div>

      <Guardian state={focused || text ? "listening" : "idle"} size={100} />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-xl"
      >
        <div className="glass-panel flex items-end gap-3 rounded-[var(--radius-lg)] p-5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={EXAMPLE_PLACEHOLDER}
            rows={2}
            className="flex-1 resize-none bg-transparent text-[15px] text-text-primary outline-none placeholder:text-text-disabled"
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            aria-label="Enviar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-30"
          >
            <ArrowUp size={18} />
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-[var(--radius-sm)] border border-risk-high/30 bg-risk-high-soft px-4 py-3 text-sm text-risk-high">
            Guardian: {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setText(chip === "Simulate a production goal" ? EXAMPLE_PLACEHOLDER : chip)}
              className="rounded-full border border-border-default bg-white/[0.02] px-4 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:bg-white/[0.05]"
            >
              {chip}
            </button>
          ))}
        </div>
      </motion.div>

      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft size={15} />
        Back to Command Center
      </Button>
    </div>
  );
}
