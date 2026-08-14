"use client";

import { Guardian } from "@/components/guardian/Guardian";
import { AlertCard } from "./AlertCard";
import type { ShortageAlert } from "@/lib/types";

export function AlertScreen({ alerts }: { alerts: ShortageAlert[] }) {
  const [headline, ...rest] = alerts;

  if (!headline) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
        <Guardian state="success" size={120} message="No detecté riesgos de faltante en los pedidos cargados." />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <Guardian
        state="alert"
        size={104}
        message={`Encontré un riesgo en el pedido de ${headline.client}.`}
      />
      <AlertCard alert={headline} additionalCount={rest.length} />
    </div>
  );
}
