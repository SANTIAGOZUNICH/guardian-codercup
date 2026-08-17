import { cn } from "@/lib/cn";

export type StatusDotTone = "normal" | "warning" | "danger" | "unavailable";

const TONE_CLASS: Record<StatusDotTone, string> = {
  normal: "bg-accent-bright",
  warning: "bg-risk-medium",
  danger: "bg-risk-high",
  unavailable: "bg-text-disabled",
};

/** Punto de estado compartido (Checkpoint 9A, promovido desde STATUS_DOT local de CommandCenter). */
export function StatusDot({ tone, className }: { tone: StatusDotTone; className?: string }) {
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_CLASS[tone], className)} />;
}
