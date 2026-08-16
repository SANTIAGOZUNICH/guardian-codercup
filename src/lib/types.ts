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

/**
 * ============================================================================
 * ASK GUARDIAN — Goal Parser
 * ============================================================================
 */

export interface Goal {
  intent: "production_goal";
  productId: string;
  productName: string;
  quantity: number;
  client?: string;
  /** ISO date (YYYY-MM-DD), ya resuelto contra snapshotAt — nunca contra la hora real del server. */
  deadline: string;
  /** Texto original tal como lo escribió el usuario, para trazabilidad ("User goal"). */
  rawText: string;
}

export type GoalParseError =
  | { kind: "unknown_product"; rawText: string }
  | { kind: "missing_quantity"; rawText: string }
  | { kind: "missing_deadline"; rawText: string };

export type GoalParseResult = { ok: true; goal: Goal } | { ok: false; error: GoalParseError };

/**
 * Contrato común para cualquier intérprete de lenguaje natural → Goal.
 * El parser determinístico lo implementa hoy; un NLU con LLM podría
 * implementarlo mañana como capa adicional (fallback o primario) sin que
 * el resto del Simulation Engine se entere de la diferencia.
 */
export interface GoalParser {
  parse(text: string, ctx: { model: OperationalModel; snapshotAt: string; calendar: OperationsCalendar }): GoalParseResult;
}

/**
 * ============================================================================
 * SIMULATION ENGINE — genera y rankea configuraciones para un Goal
 * ============================================================================
 * Cada escenario se evalúa con la MISMA evaluateScenario() que usa
 * Constraint Detection — cero lógica de cálculo duplicada.
 */

export interface ScenarioConfig {
  id: string;
  label: string;
  resourceConfig: ResourceAllocation[];
}

/**
 * Contexto sobre pedidos existentes — deliberadamente NO es una afirmación
 * de impacto. Este motor no tiene scheduling temporal real, así que solo
 * podemos decir con certeza qué pedidos existentes usan los mismos procesos
 * que este escenario — nunca "a cuántos afecta" ni "cuánto se atrasan".
 * Es constante entre todos los escenarios de un mismo Goal (todos requieren
 * los mismos procesos del profile del producto) — por eso NUNCA participa
 * del ranking, solo se muestra como contexto informativo.
 */
export interface ContentionInfo {
  sharedProcesses: ResourceProcess[];
  orderIds: string[];
}

/**
 * Clasificación determinística de un escenario evaluado — reemplaza
 * cualquier lógica dispersa tipo `if (!materials && deadline...)` en JSX.
 * - fully_viable: materialsFeasible && capacityFeasible && deadlineMet.
 * - conditionally_viable: llegaría a tiempo (capacityFeasible && deadlineMet)
 *   pero está bloqueado por materiales — "funcionaría SI se resuelve el faltante".
 * - deadline_missed: es físicamente ejecutable (capacityFeasible) pero no
 *   llega a tiempo (con o sin problema de materiales adicional).
 * - infeasible: ni siquiera es físicamente ejecutable (capacityFeasible=false).
 */
export type PlanStatus = "fully_viable" | "conditionally_viable" | "deadline_missed" | "infeasible";

export interface EvaluatedScenario {
  config: ScenarioConfig;
  result: ScenarioResult;
  contention: ContentionInfo;
  /** Suma de unitsUsed de máquina por encima de 1 por proceso — un proxy honesto de "más recursos adicionales". */
  extraResourcesUsed: number;
  status: PlanStatus;
}

/**
 * Qué tipo de resultado obtuvo el Goal en conjunto — determina qué pantalla
 * mostrar (Recommended Plans / Best Conditional Plan / No Plan Meets Deadline
 * / Infeasible). `candidates` ya viene ordenado, listo para mostrar tal cual.
 */
export type GoalOutcomeKind = "fully_viable" | "conditionally_viable" | "deadline_missed" | "infeasible";

export interface GoalOutcome {
  kind: GoalOutcomeKind;
  candidates: EvaluatedScenario[];
}

export interface GoalSimulationResult {
  goal: Goal;
  /** Config actual (usar todo lo disponible) evaluada contra el goal — referencia antes de generar alternativas. */
  baseline: EvaluatedScenario;
  /** Todas las configuraciones generadas y evaluadas, sin ordenar todavía. */
  scenarios: EvaluatedScenario[];
  /** scenarios, ordenado por rankScenarios(). */
  ranked: EvaluatedScenario[];
  /** true si algún escenario generado cumple materialsFeasible (constante entre escenarios del mismo goal). */
  materialsFeasible: boolean;
  outcome: GoalOutcome;
}

export interface OrderConstraints {
  orderId: string;
  scenario: ScenarioResult;
  constraints: Constraint[];
  severity: OrderSeverity | null;
}

/**
 * Solo estado de sesión (no hay persistencia real) — lo que Command Center
 * muestra en su card "Last Simulation" después de elegir un plan.
 */
export interface LastSimulation {
  goalSummary: string;
  chosenPlanLabel: string;
  completionLabel: string;
  /** Etiqueta corta de la disrupción activa (ej. "Llenadora 2 unavailable"), o null si no hay ninguna. */
  disruptionLabel: string | null;
}

/**
 * ============================================================================
 * OPERATIONAL DISRUPTION — Machine Unavailable (Checkpoint 6)
 * ============================================================================
 * Único tipo de disrupción soportado en V1. Deliberadamente mínimo: no es
 * una arquitectura genérica de "events" — si en el futuro se agregan otros
 * tipos (material delay, absenteeism, etc.), se define cada uno como su
 * propio tipo cuando exista, no se generaliza de antemano sin necesidad real.
 *
 * `effectiveAt` queda declarado para no cerrar la puerta a una futura V2 con
 * disponibilidad parcial en el tiempo, pero en V1 NUNCA se completa ni se
 * usa: la disrupción aplica a todo el horizonte simulado (Option A — ver
 * reporte de Checkpoint 6). No hay scheduling temporal parcial dentro de un
 * escenario.
 */
export interface MachineUnavailableDisruption {
  type: "machine_unavailable";
  resourceId: string;
  unitsUnavailable: number;
  effectiveAt?: string;
}

export type Disruption = MachineUnavailableDisruption;
