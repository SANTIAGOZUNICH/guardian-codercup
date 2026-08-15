"use client";

import { Guardian } from "@/components/guardian/Guardian";
import { ConstraintCard } from "./ConstraintCard";
import { buildConstraintViewModel, sortBySeverity } from "@/lib/view/constraint-view-model";
import type { OperationalModel, OrderConstraints } from "@/lib/types";

export function ConstraintScreen({
  model,
  orderConstraints,
}: {
  model: OperationalModel;
  orderConstraints: OrderConstraints[];
}) {
  const affected = sortBySeverity(orderConstraints.filter((oc) => oc.constraints.length > 0));
  const headline = affected[0];

  if (!headline) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
        <Guardian state="success" size={120} message="No detecté restricciones en los pedidos cargados." />
      </div>
    );
  }

  const order = model.orders.find((o) => o.id === headline.orderId);
  if (!order) return null;

  const vm = buildConstraintViewModel(model, order, headline);
  if (!vm) return null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <Guardian state="alert" size={104} message={vm.guardianMessage} />
      <ConstraintCard vm={vm} additionalCount={affected.length - 1} />
    </div>
  );
}
