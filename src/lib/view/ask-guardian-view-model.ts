import type { OperationSummaryV2 } from "@/lib/model/buildModelInputsFromGuidedSetupV2";
import type { Goal, OperationalModel, OperationsCalendar, Presentation, TwinCompleteness } from "@/lib/types";

export interface AskContextItem {
  label: string;
  value: string;
  tone: "normal" | "neutral";
}

export function buildAskModelContext(
  model: OperationalModel,
  summary: OperationSummaryV2 | null,
  completeness: TwinCompleteness | null,
  calendar: OperationsCalendar,
): AskContextItem[] {
  const unsupported = completeness?.missing.unsupportedProcesses.length ?? 0;
  const declaredProcesses = summary?.processesCount ?? new Set(model.resources.map((resource) => resource.process)).size + unsupported;
  const schedule = `${calendar.workingDays.length} días · ${calendar.workdayStart} · ${calendar.workdayHours} h`;
  const connectedMaterials = summary?.materialsConnected || (model.materials.length > 0 && model.inventory.length > 0);
  return [
    { label: "Productos", value: `${model.products.length}`, tone: "normal" },
    { label: "Procesos", value: `${declaredProcesses} declarados`, tone: "normal" },
    { label: "Equipos", value: `${model.resources.length}`, tone: "normal" },
    { label: "Personal", value: summary?.staffCount == null ? "No especificado" : `${summary.staffCount} personas`, tone: summary?.staffCount == null ? "neutral" : "normal" },
    { label: "Días y horarios", value: schedule, tone: "normal" },
    { label: "Materials", value: connectedMaterials ? "Conectados" : "No evaluado", tone: connectedMaterials ? "normal" : "neutral" },
  ];
}

export function buildSupportedAskExamples(model: OperationalModel, featuredExample?: string): string[] {
  const examples: string[] = [];
  if (featuredExample) examples.push(featuredExample);
  const product = model.products[0];
  if (product && !featuredExample) examples.push(`Necesito producir 5.000 ${product.name} para el viernes.`);
  const resource = model.resources[0];
  if (resource) examples.push(`¿Cuántos ${resource.name} tengo?`);
  examples.push("¿Qué información te falta de mi operación?");
  return examples.slice(0, 3);
}

export interface UnderstoodField {
  key: "product" | "quantity" | "grams" | "deadline" | "client";
  label: string;
  value: string;
}

export function buildUnderstoodFields(goal: Goal, presentation: Presentation | null): UnderstoodField[] {
  const fields: UnderstoodField[] = [
    { key: "product", label: "Producto", value: goal.productName },
    { key: "quantity", label: "Cantidad", value: `${goal.quantity.toLocaleString("es-AR")} unidades` },
  ];
  if (presentation) fields.push({ key: "grams", label: "Gramaje", value: `${presentation.gramsPerUnit.value.toLocaleString("es-AR")} g/unidad` });
  fields.push({ key: "deadline", label: "Fecha límite", value: goal.deadline });
  if (goal.client) fields.push({ key: "client", label: "Cliente", value: goal.client });
  return fields;
}

export function correctGoalQuantity(goal: Goal, quantity: number): Goal {
  return Number.isFinite(quantity) && quantity > 0 ? { ...goal, quantity } : goal;
}

/** Makes scenario-only presentation data available to the engine without mutating the OperationalModel. */
export function withScenarioPresentation(model: OperationalModel, presentation: Presentation | null): OperationalModel {
  if (!presentation || model.presentations.some((item) => item.id === presentation.id)) return model;
  return { ...model, presentations: [...model.presentations, presentation] };
}
