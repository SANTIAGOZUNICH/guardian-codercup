import type { OperationalModel, OperationsCalendar, TwinCompleteness } from "@/lib/types";
import type { OperationSummaryV2 } from "@/lib/model/buildModelInputsFromGuidedSetupV2";

export type ModelBuildingNodeStatus = "integrated" | "unknown" | "not_evaluated";

export interface ModelBuildingNode {
  id: "products" | "processes" | "equipment" | "capacities" | "staff" | "schedule" | "materials";
  label: string;
  value: string;
  status: ModelBuildingNodeStatus;
}

export interface ModelBuildingViewModel {
  nodes: ModelBuildingNode[];
  stages: readonly ["Conectando datos", "Mapeando relaciones", "Modelo operativo integrado"];
}

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function formatDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 0) return "No especificado";
  const consecutive = sorted.every((day, index) => index === 0 || day === sorted[index - 1] + 1);
  if (consecutive && sorted.length > 2) return `${DAY_LABELS[sorted[0]]}–${DAY_LABELS[sorted.at(-1)!]}`;
  return sorted.map((day) => DAY_LABELS[day]).join(", ");
}

function formatSchedule(calendar: OperationsCalendar): string {
  const days = formatDays(calendar.workingDays);
  if (days === "No especificado" || calendar.workdayHours <= 0) return "No especificado";
  const [hours, minutes] = calendar.workdayStart.split(":").map(Number);
  const endMinutes = hours * 60 + minutes + Math.round(calendar.workdayHours * 60);
  const end = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  return `${days} · ${calendar.workdayStart}–${end}`;
}

export function buildModelBuildingViewModel(
  model: OperationalModel,
  calendar: OperationsCalendar,
  completeness: TwinCompleteness | null,
  operationSummary: OperationSummaryV2 | null,
): ModelBuildingViewModel {
  const processCount = operationSummary?.processesCount
    ?? (completeness ? completeness.known.processes + completeness.missing.unsupportedProcesses.length : new Set(model.profiles.flatMap((profile) => profile.productionReference.map((step) => step.process))).size);
  const equipmentCount = operationSummary?.resourcesCount
    ?? model.resources.filter((resource) => resource.type === "Máquina").reduce((total, resource) => total + resource.quantityAvailable, 0);
  const capacityCount = completeness?.known.capacities
    ?? model.resources.filter((resource) => resource.type === "Máquina" && resource.capacity > 0).length;
  const staffCount = operationSummary?.staffCount ?? null;
  const schedule = formatSchedule(calendar);
  const materialsConnected = model.materials.length > 0 && model.inventory.length > 0;

  return {
    stages: ["Conectando datos", "Mapeando relaciones", "Modelo operativo integrado"],
    nodes: [
      { id: "products", label: "Productos", value: `${operationSummary?.productsCount ?? model.products.length} productos`, status: "integrated" },
      { id: "processes", label: "Procesos", value: processCount > 0 ? `${processCount} procesos` : "No especificado", status: processCount > 0 ? "integrated" : "unknown" },
      { id: "equipment", label: "Equipos", value: equipmentCount > 0 ? `${equipmentCount} equipos` : "No especificado", status: equipmentCount > 0 ? "integrated" : "unknown" },
      { id: "capacities", label: "Capacidades", value: capacityCount > 0 ? `${capacityCount} declaradas` : "No especificado", status: capacityCount > 0 ? "integrated" : "unknown" },
      { id: "staff", label: "Personal", value: staffCount === null ? "No especificado" : `${staffCount} personas`, status: staffCount === null ? "unknown" : "integrated" },
      { id: "schedule", label: "Días y horarios", value: schedule, status: schedule === "No especificado" ? "unknown" : "integrated" },
      { id: "materials", label: "Materiales", value: materialsConnected ? "Datos conectados" : "No evaluado", status: materialsConnected ? "integrated" : "not_evaluated" },
    ],
  };
}
