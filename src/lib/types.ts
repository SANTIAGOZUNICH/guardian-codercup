// Modelo de datos mínimo del Operational Model de GUARDIAN.
// Ver plan: Company -> Orders -> Products -> ProductionProfiles -> Materials -> Inventory -> Resources -> Capacities

export type Priority = "alta" | "normal" | "baja";

export interface Company {
  name: string;
  industry: string;
}

export interface Order {
  id: string;
  client: string;
  productId: string;
  quantity: number;
  deliveryDate: string; // ISO date (YYYY-MM-DD)
  priority: Priority;
}

export interface Product {
  id: string;
  name: string;
  unit: string;
}

export interface Material {
  code: string;
  name: string;
  unit: string;
}

export interface InventoryItem {
  materialCode: string;
  stock: number;
  unit: string;
}

export type ResourceProcess = "Elaboración" | "Envasado" | "Codificado";

export interface Resource {
  id: string;
  name: string;
  type: string;
  process: ResourceProcess;
  quantityAvailable: number;
  capacity: number;
  capacityUnit: string;
}

/**
 * Receta operativa de un producto. Es "reference data": no viene de ningún
 * Excel cargado por la empresa en esta versión — está explícitamente
 * declarada en src/data/production-profiles.ts y marcada como referencia
 * en toda la UI que la consuma.
 */
export interface ProductionProfileStep {
  process: ResourceProcess;
  materialsPerUnit: { materialCode: string; qtyPerUnit: number }[];
  ratePerHour?: number;
  batchSize?: number;
  /**
   * Horas que tarda UN batch de esta etapa (solo aplica a etapas con `batchSize`).
   * Valor de referencia — no existe hoy ninguna fuente de datos con esta
   * dimensión temporal para procesos por lote, así que se declara acá
   * explícitamente en vez de inventarse dentro del motor.
   */
  hoursPerBatch?: number;
}

export interface ProductionProfile {
  productId: string;
  steps: ProductionProfileStep[];
}

export interface OperationalModel {
  company: Company;
  orders: Order[];
  products: Product[];
  materials: Material[];
  inventory: InventoryItem[];
  resources: Resource[];
  profiles: ProductionProfile[];
}

export interface OperationalModelCounts {
  orders: number;
  products: number;
  materials: number;
  resources: number;
}

export type RiskLevel = "bajo" | "medio" | "alto";

/**
 * Resultado del motor de faltantes para un pedido puntual.
 * Todos los valores numéricos deben surgir del motor (engine/shortage-engine.ts),
 * nunca hardcodeados en la UI.
 */
export interface ShortageAlert {
  orderId: string;
  client: string;
  productId: string;
  productName: string;
  quantity: number;
  deliveryDate: string;
  materialCode: string;
  materialName: string;
  requiredQty: number;
  availableQty: number;
  missingQty: number;
  unit: string;
  risk: RiskLevel;
}

/**
 * Calendario productivo explícito. Sin esto, cualquier cálculo de fecha de
 * finalización tiene que adivinar qué días se trabaja — y adivinar mal es
 * exactamente el bug que este tipo existe para prevenir.
 *
 * V1: sin feriados, sin turnos partidos, semana fija lunes a viernes.
 * `timezone` queda declarado como metadata para dejar la semántica
 * inequívoca, pero la aritmética de este motor es "wall-clock" naive (no
 * convierte entre husos horarios) — ver nota en evaluate-scenario.ts.
 */
export interface OperationsCalendar {
  timezone: string;
  /** "HH:mm", 24hs. */
  workdayStart: string;
  workdayHours: number;
  /** 0=domingo ... 6=sábado (convención de Date.getDay()). */
  workingDays: number[];
}

export type DataProvenance = "company_data" | "reference_profile" | "calculated";

/**
 * ============================================================================
 * SIMULATION CORE — tipos usados por evaluateScenario() (engine/evaluate-scenario.ts)
 * ============================================================================
 * Estos tipos son el contrato compartido entre Constraint Detection, el
 * Simulation Engine y Machine Unavailable — todos llaman a la misma función,
 * nunca duplican esta lógica.
 */

/**
 * Uso de UN recurso (máquina o personal, ambos son `Resource`) dentro de un
 * escenario. `unitsUsed` para un recurso de tipo "Máquina" entra en el
 * cálculo de throughput/horas. `unitsUsed` para un recurso de tipo
 * "Personal" es SOLO una restricción de disponibilidad (no puede exceder
 * `Resource.quantityAvailable`) — nunca modifica matemáticamente ninguna
 * hora ni capacidad calculada. No existe ningún dato que relacione personas
 * con throughput, así que el motor no inventa esa relación.
 */
export interface ResourceAllocation {
  resourceId: string;
  unitsUsed: number;
}

export interface StepEvaluation {
  process: ResourceProcess;
  /** Horas que toma esta etapa con la configuración evaluada. Infinity si está bloqueada. */
  hours: number;
  /** 0..1. NaN si la etapa está bloqueada (no hay forma de calcular utilización de algo con capacidad 0). */
  utilization: number;
  /** true si no hay throughput/capacidad asignada válida para esta etapa (ej. recurso en 0 unidades). */
  blocked: boolean;
}

export interface MaterialShortage {
  materialCode: string;
  required: number;
  available: number;
  missing: number;
  unit: string;
}

export interface CapacityIssue {
  resourceId: string;
  resourceName: string;
  process: ResourceProcess;
  reason: string;
}

/**
 * Resultado de evaluar UNA configuración de recursos contra UN pedido.
 *
 * Semántica deliberada (no son sinónimos):
 * - `materialsFeasible`: el stock alcanza para los materiales requeridos.
 * - `capacityFeasible`: la configuración de recursos puede físicamente
 *   producir la cantidad pedida (throughput > 0 en cada etapa, unidades
 *   asignadas dentro de lo disponible) — SIN mirar el deadline.
 * - `deadlineMet`: la fecha de finalización estimada cae en o antes del
 *   deadline del pedido. Puede ser `false` con `feasible: true` — un
 *   escenario puede ser operacionalmente realizable pero terminar tarde.
 * - `feasible`: `materialsFeasible && capacityFeasible`. El deadline NO
 *   participa de este campo a propósito.
 */
export interface ScenarioResult {
  orderId: string;
  materialsFeasible: boolean;
  capacityFeasible: boolean;
  deadlineMet: boolean;
  feasible: boolean;
  totalHoursNeeded: number;
  /** ISO datetime. null si `capacityFeasible` es false (no hay forma real de estimar una fecha). */
  completionAt: string | null;
  steps: StepEvaluation[];
  bottleneck: StepEvaluation;
  materialShortages: MaterialShortage[];
  capacityIssues: CapacityIssue[];
}

/**
 * ============================================================================
 * CONSTRAINT DETECTION — deriva de ScenarioResult, nunca lo recalcula
 * ============================================================================
 * Dos tipos de constraint, deliberadamente separados y NUNCA colapsados en
 * un único "risk: alto/medio/bajo": un pedido puede tener ambos a la vez, y
 * cada uno tiene una causa y un origen de datos distintos.
 */

export interface MaterialShortageConstraint {
  kind: "material_shortage";
  orderId: string;
  materialCode: string;
  materialName: string;
  required: number;
  available: number;
  missing: number;
  unit: string;
}

/**
 * Cubre tanto "no llega a tiempo" (capacityFeasible=true, completionAt tarde)
 * como "no se puede ni estimar cuándo termina" (capacityFeasible=false,
 * completionAt=null, hoursLate=null) — son la misma pregunta de negocio
 * ("¿va a estar a tiempo?") con dos causas de fondo distintas, capturadas acá
 * sin inventar un tercer tipo de constraint para "capacidad".
 */
export interface DeadlineAtRiskConstraint {
  kind: "deadline_at_risk";
  orderId: string;
  capacityFeasible: boolean;
  completionAt: string | null;
  effectiveDeadlineAt: string;
  hoursLate: number | null;
  bottleneck: StepEvaluation;
}

export type Constraint = MaterialShortageConstraint | DeadlineAtRiskConstraint;

/**
 * Severidad determinística: combinación lógica de qué constraints están
 * presentes, nada probabilístico y nada con un umbral no justificado.
 * `null` = sin constraints. No existe un tercer nivel "attention/medio"
 * todavía — agregarlo requeriría una regla explícita que hoy no existe
 * (ver reporte de Checkpoint 2).
 */
export type OrderSeverity = "critical" | "high";

export interface OrderConstraints {
  orderId: string;
  scenario: ScenarioResult;
  constraints: Constraint[];
  severity: OrderSeverity | null;
}
