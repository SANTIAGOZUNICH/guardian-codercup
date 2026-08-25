// Modelo de datos mínimo del Operational Model de GUARDIAN.
// Ver plan: Company -> Orders -> Products -> ProductionProfiles -> Materials -> Inventory -> Resources -> Capacities

export type Priority = "alta" | "normal" | "baja";

export interface Company {
  name: string;
  industry: string;
}

/** Asignación declarada para un proceso; no duplica el routing del producto. */
export interface ProcessResourceAssignment {
  process: ResourceProcess;
  resources: ResourceAllocation[];
}

/**
 * Metadata opcional de planificación futura. Los campos internos permanecen
 * opcionales para conservar ingestas parciales como UNKNOWN; sólo el helper
 * de schedulability decide cuándo el contrato está completo.
 */
export interface OrderPlanning {
  status: "planned";
  plannedStartAt?: string;
  processAssignments?: ProcessResourceAssignment[];
}

export interface Order {
  id: string;
  client: string;
  productId: string;
  quantity: number;
  deliveryDate: string; // ISO date (YYYY-MM-DD)
  priority: Priority;
  /**
   * `Presentation` elegida para este pedido — decide cuántos gramos de
   * producto representa cada unidad. Opcional: cuando el producto tiene
   * exactamente una `Presentation` declarada, `resolveOrderPresentation()` la
   * usa igual sin necesitar este campo explícito (ver
   * `lib/model/presentation.ts`). Nunca se "adivina" cuando hay más de una.
   */
  presentationId?: string;
  /** Trabajo futuro planificado. Ausente/incompleto => scheduling temporal SKIP. */
  planning?: OrderPlanning;
}

export interface Product {
  id: string;
  name: string;
  unit: string;
}

/**
 * ============================================================================
 * PRESENTATION — contenido por unidad, en gramos (GUARDIAN V1 — Product Contract)
 * ============================================================================
 * GUARDIAN V1 usa GRAMOS DE PRODUCTO POR UNIDAD como único puente entre el
 * Pedido (unidades) y la Elaboración (kg) — nunca ml, nunca densidad, nunca
 * conversión volumen→masa (decisión de dominio definitiva, reemplaza
 * cualquier conversación anterior sobre cubicaje).
 *
 * Un mismo `Product` puede tener varias `Presentation` (ej. "Crema Facial —
 * 50 g" y "Crema Facial — 200 g") — nunca embebidas dentro de `Product`,
 * mismo patrón que `profiles`/`materials`: un array top-level en
 * `OperationalModel`, cada una apuntando a su `productId`.
 *
 * `gramsPerUnit` es un `SourcedValue<number>` — "no declarado todavía",
 * "declarado por la empresa" y "referencia aceptada" (ej. 50 g de
 * referencia) son tres estados distintos, nunca colapsados. Ver
 * `resolveOrderPresentation` en `lib/model/presentation.ts` para la regla de
 * qué `Presentation` aplica a un pedido puntual.
 */
export interface Presentation {
  id: string;
  productId: string;
  /** Etiqueta legible, ej. "200 g". */
  label: string;
  gramsPerUnit: SourcedValue<number>;
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
 * ============================================================================
 * DATA ORIGIN — de dónde salió un valor de entrada (Checkpoint 9B.2)
 * ============================================================================
 * Distinto de `DataProvenance` (abajo): `DataProvenance` documenta, a nivel
 * de TIPO DE CAMPO, de dónde suele venir una categoría de datos (para la capa
 * de explicabilidad "Why this plan?"). `DataOrigin`/`SourcedValue` etiquetan
 * un VALOR CONCRETO, uno por uno — necesario porque, a partir de este
 * checkpoint, `batchSize`/`hoursPerBatch`/`ratePerHour` de UN MISMO producto
 * pueden mezclar datos declarados por la empresa con estimaciones de
 * referencia aceptadas explícitamente. Nunca incluye "calculated": un valor
 * de entrada (lo que el motor CONSUME) nunca es un resultado (lo que el motor
 * PRODUCE) — ver `ScenarioResult` para los campos calculados.
 */
export type DataOrigin = "company_data" | "reference_estimate";

/**
 * Envoltorio explícito para cualquier número de entrada que pueda venir de la
 * empresa O de una referencia aceptada. Nunca un campo vacío con un default
 * escondido: si el valor no existe, el campo entero (`SourcedValue<T> |
 * undefined`) está ausente — no hay forma de "adivinar" un origen para un
 * valor que no fue provisto explícitamente por ninguna capa superior.
 */
export interface SourcedValue<T> {
  value: T;
  source: DataOrigin;
}

/**
 * ============================================================================
 * PRODUCT / PRODUCTION REFERENCE / MATERIAL FORMULA (Checkpoint 9B.2)
 * ============================================================================
 * Tres preguntas deliberadamente separadas, cada una respondible sin las
 * otras dos:
 * - `Product` (ver arriba): ¿QUÉ fabrica el laboratorio? Ya vivía
 *   independiente de perfiles — se mantiene así.
 * - `ProductionReferenceStep`: ¿CÓMO se comporta operacionalmente ese
 *   producto en una etapa? (tiempos/capacidad) — nunca necesita materiales
 *   para existir.
 * - `MaterialFormulaStep`: ¿QUÉ materiales necesita esa etapa? — opcional,
 *   nunca bloquea el cálculo operacional (ver MaterialFeasibility, 9B.1).
 *
 * Cada campo de `ProductionReferenceStep` es un `SourcedValue<number>`
 * opcional — "no declarado" y "declarado por la empresa" y "declarado como
 * referencia aceptada" son tres estados distintos, nunca colapsados.
 */
/**
 * ============================================================================
 * BATCH UNIT — desacople TIEMPO/MATERIALES en etapas por lote (Checkpoint 9B.3)
 * ============================================================================
 * Qué representa `batchSize`, declarado explícitamente en vez de asumido:
 * - "units": `batchSize` ya está en unidades de producto ("hacemos 500
 *   unidades por batch") — el motor calcula `batchesNeeded` directo desde
 *   `order.quantity`, SIN necesitar ninguna Material Formula. Esto es lo que
 *   permite que "Hacemos 500 unidades por batch y cada batch tarda 3 horas"
 *   alcance para calcular tiempo, sin fórmula ni materias primas.
 * - "kg": `batchSize` es masa — el motor necesita convertir `order.quantity`
 *   (unidades) a masa vía `MaterialFormulaStep.materialsPerUnit` para saber
 *   cuántos batches hacen falta. Sin esa fórmula, la etapa queda `blocked`
 *   honestamente (ver `computeBatchesNeeded` en evaluate-scenario.ts) — NUNCA
 *   `hours: 0` fabricado.
 *
 * Ausente (`undefined`) se comporta como "kg" — el modelado histórico de
 * Laboratorio Guardian (reactores medidos en kg) sigue funcionando sin cambios;
 * "units" es la opción nueva que una empresa puede declarar explícitamente
 * cuando su Production Reference ya está en unidades de producto.
 */
export type BatchUnit = "units" | "kg";

export interface ProductionReferenceStep {
  process: ResourceProcess;
  /** Cantidad que produce UN batch, en la unidad que indica `batchUnit` — solo aplica a etapas por lote. */
  batchSize?: SourcedValue<number>;
  /** Qué representa `batchSize` — ver `BatchUnit` arriba. */
  batchUnit?: BatchUnit;
  /** Horas que tarda UN batch — solo aplica a etapas por lote, junto con `batchSize`. */
  hoursPerBatch?: SourcedValue<number>;
  /** Techo de unidades/hora específico del producto (nunca reemplaza `resource.capacity`, solo la acota — ver evaluate-scenario.ts). Solo aplica a etapas continuas. */
  ratePerHour?: SourcedValue<number>;
  /**
   * A qué `Presentation` corresponde `ratePerHour` — REGLA CRÍTICA — NO
   * ESCALADO FALSO (Product Contract V1): un rate declarado para 50 g NUNCA
   * se reutiliza silenciosamente para 200 g. Cuando está presente, el motor
   * solo aplica `ratePerHour` si coincide con la `Presentation` resuelta del
   * pedido (ver `resolveOrderPresentation` + `computeStep` en
   * evaluate-scenario.ts) — si no coincide, cae de vuelta a la capacidad
   * física cruda de la máquina (nunca inventa una reproporción). `undefined`
   * = el rate no está atado a ninguna presentación específica (válido
   * directo solo cuando el producto tiene una única `Presentation`
   * declarada — si tiene varias, un rate sin `presentationId` es ambiguo y
   * tampoco se aplica silenciosamente).
   */
  presentationId?: string;
  /**
   * ============================================================================
   * RATE VARIANTS — precisión progresiva por producto/presentación/recurso
   * ============================================================================
   * `ratePerHour`/`presentationId` arriba siguen siendo el nivel "producto
   * genérico" (Nivel 1-2 del Product Contract). `rateVariants` permite
   * declarar valores MÁS específicos sin romper esa simplicidad — un
   * `ProductionReferenceStep` compartido (ej. el que arma Guided Setup V2
   * para todos los productos) puede igual traer rates distintos por
   * producto, por presentación, o por presentación+máquina puntual. Ver
   * `resolveEffectiveRate()` en evaluate-scenario.ts para el orden de
   * especificidad exacto. Nunca se resuelve por escalado — cada variante es
   * un valor declarado, nunca derivado matemáticamente de otro.
   */
  rateVariants?: RateVariant[];
}

/**
 * Un valor de `ratePerHour` atado a un contexto más específico que "todo el
 * producto". `productId`/`presentationId`/`resourceId` ausentes = ese nivel
 * no restringe la variante (nunca se completan con un default oculto). Una
 * variante con `presentationId` seteado siempre es más específica que una
 * con solo `productId` — ver el ranking de especificidad en
 * `resolveEffectiveRate()`. Se resuelve por MATCH EXACTO contra el pedido
 * evaluado, nunca por proximidad ni interpolación.
 */
export interface RateVariant {
  /** Nivel producto — aplica a cualquier presentación de este producto que no tenga una variante más específica. */
  productId?: string;
  /** Nivel presentación — más específico que `productId` solo. */
  presentationId?: string;
  /** Nivel recurso — combinable con `presentationId` o `productId` para la máxima especificidad (Nivel 4). */
  resourceId?: string;
  ratePerHour: SourcedValue<number>;
}

export interface MaterialRequirement {
  materialCode: string;
  qtyPerUnit: number;
}

/** BOM de UNA etapa — independiente de si esa etapa tiene Production Reference declarada. */
export interface MaterialFormulaStep {
  process: ResourceProcess;
  materialsPerUnit: MaterialRequirement[];
}

/**
 * ============================================================================
 * REFERENCE CATALOG (Checkpoint 9B.3)
 * ============================================================================
 * Catálogo pequeño y explícito de valores de referencia para equipos típicos
 * de un laboratorio cosmético — nunca una tabla gigantesca ni números
 * inventados sin fuente. Cada entrada es auditable: qué categoría de equipo,
 * qué parámetro estima, en qué unidad, con qué valor o rango, de dónde sale
 * esa estimación, para qué tipo de operación aplica, y una versión para poder
 * rastrear cambios. Ver `src/data/reference-catalog.ts` para el catálogo
 * concreto (el seed inicial) y `src/lib/engine/reference-catalog.ts` para las
 * funciones puras que lo consultan y resuelven.
 *
 * Que una entrada EXISTA en el catálogo (`REFERENCE AVAILABLE`) nunca implica
 * que el motor pueda usarla — eso requiere aceptación explícita del usuario
 * (`REFERENCE ACCEPTED` → `REFERENCE IN USE`, ver `applyAcceptedReference` en
 * reference-catalog.ts). `evaluateScenario()` nunca busca un default acá por
 * su cuenta.
 */
export interface ReferenceRange {
  min: number;
  max: number;
}

/** Estrategia explícita para resolver un rango a un número concreto — nunca Monte Carlo, nunca probabilístico (ver reference-catalog.ts). */
export type ReferenceStrategy = "conservative" | "midpoint" | "optimistic";

/** Qué campo de `ProductionReferenceStep` estima esta entrada — acotado a los 3 campos que el motor realmente consume. */
export type ReferenceParameter = "batchSize" | "hoursPerBatch" | "ratePerHour";

export interface ReferenceCatalogEntry {
  /** Identificador estable, ej. "filling-machine-automatic-rate". */
  id: string;
  /** Categoría de equipo/proceso, ej. "reactor", "llenadora", "etiquetadora", "codificadora". Texto libre deliberadamente — el catálogo crece sin tocar un enum cerrado. */
  category: string;
  process: ResourceProcess;
  parameter: ReferenceParameter;
  /** Solo relevante cuando `parameter === "batchSize"` — ver `BatchUnit`. */
  batchUnit?: BatchUnit;
  unit: string;
  value: number | ReferenceRange;
  /** Descripción auditable de dónde sale este valor — nunca "porque sí". */
  source: string;
  /** A qué tipo de operación aplica razonablemente, ej. "Laboratorio cosmético pequeño/mediano, llenadora automática estándar". */
  applicability: string;
  /** Para rastrear cambios de este valor a través del tiempo, ej. "9B.3-seed-1". */
  version: string;
  /** true = fixture explícito de test, NUNCA debe usarse fuera de tests (ver reference-catalog.ts). */
  isTestReference?: boolean;
}

/**
 * Contenedor por producto — nunca global, nunca compartido entre empresas
 * (cada `OperationalModel` trae su propio array `profiles`, construido
 * explícitamente por quien arma el Twin — ver buildOperationalModel.ts).
 * `productionReference` y `materials` son independientes: un producto puede
 * tener uno sin el otro, o ninguno de los dos.
 */
export interface ProductionProfile {
  productId: string;
  productionReference: ProductionReferenceStep[];
  materials: MaterialFormulaStep[];
}

export interface OperationalModel {
  company: Company;
  orders: Order[];
  products: Product[];
  /** Ver `Presentation` arriba. Array top-level, nunca embebido en `Product` — mismo patrón que `profiles`. */
  presentations: Presentation[];
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

/**
 * Documenta, a nivel de TIPO DE CAMPO, de qué categoría suele venir un dato
 * (usado por la tabla estática `DATA_PROVENANCE` en data-provenance.ts, para
 * la capa de explicabilidad). Checkpoint 9B.2 renombra `reference_profile` a
 * `reference_estimate` — incluso para valores estáticos (ej. el calendario
 * productivo por defecto), sigue siendo "un valor de referencia, usado
 * porque la empresa no declaró el suyo", ahora el mismo vocabulario que
 * `DataOrigin` usa para valores individuales. Nunca se agregó "not_connected"
 * acá (decisión de 9B.1, se mantiene): esa pregunta es de `TwinCapabilities`,
 * no de provenance — "¿tengo este dato?" es distinto de "¿de dónde salió?".
 */
export type DataProvenance = "company_data" | "reference_estimate" | "calculated" | "user_provided";

/**
 * ============================================================================
 * TWIN COMPLETENESS — Guided Setup (Checkpoint 7)
 * ============================================================================
 * Metadata paralela al OperationalModel (nunca dentro de él, mismo patrón que
 * `snapshotAt` en GuardianApp) que registra honestamente qué se sabe y qué no
 * se sabe todavía. Nunca un porcentaje inventado de "completitud" — solo
 * hechos: cuántas cosas se conocen y cuáles faltan, nombradas explícitamente.
 *
 * `known.capacities` es la cantidad de recursos con capacidad CONOCIDA — puede
 * ser menor que `known.resources` (un recurso puede existir sin que se sepa
 * su capacidad). Ese recurso igual entra al Twin con `capacity: 0` (el motor
 * necesita un número), pero su nombre queda en `missing.resourceCapacities`
 * para que la UI nunca confunda "desconocido" con "la capacidad real es cero".
 */
export interface TwinCompleteness {
  known: {
    processes: number;
    resources: number;
    capacities: number;
    products: number;
  };
  missing: {
    /** Nombres de recursos cuya capacidad el usuario no supo indicar. */
    resourceCapacities: string[];
    /** true si el usuario eligió "No lo tengo ahora" en la pregunta de inventario — nunca stock=0 real. */
    missingInventory: boolean;
    /** Texto tal como lo describió el usuario para un proceso que no mapea a ningún ResourceProcess soportado. */
    unsupportedProcesses: string[];
    /** Nombres de producto que el usuario mencionó sin que exista un ProductionProfile de referencia para ellos. */
    productsWithoutProfile: string[];
  };
}

/**
 * ============================================================================
 * TWIN CAPABILITIES (Checkpoint 9B.1)
 * ============================================================================
 * "Capability" responde una pregunta distinta de `TwinCompleteness`:
 * TwinCompleteness cuenta CUÁNTO se sabe (números); TwinCapabilities dice
 * QUÉ TIPO de análisis GUARDIAN puede intentar con lo que hay — un booleano
 * por dimensión, nunca un porcentaje. Se deriva 100% de `OperationalModel`,
 * nunca se persiste por separado (ver `buildTwinCapabilities` en
 * lib/model/twin-capabilities.ts) — exactamente el mismo principio que ya
 * usa `TwinCompleteness`.
 *
 * IMPORTANTE — capability ≠ calidad del resultado: `materials: true` solo
 * dice "hay BOM declarado para al menos un producto", nunca "los materiales
 * alcanzan". Un Twin puede tener `materials: true` y aun así terminar en
 * `MaterialFeasibility: "fail"` para un pedido puntual — son preguntas
 * distintas (¿tengo el dato? vs. ¿qué dice el dato?).
 */
export interface TwinCapabilities {
  /** Al menos un producto declarado (Checkpoint 9B.2) — independiente de si tiene Production Reference o Material Formula. */
  products: boolean;
  /** Al menos un recurso de tipo Máquina declarado en algún proceso. */
  productionFlow: boolean;
  /** Al menos una máquina con capacidad > 0 declarada (no placeholder). */
  resourceCapacity: boolean;
  /** Al menos un recurso de tipo Personal declarado. Nunca bloquea ningún cálculo — puro contexto, igual que hoy. */
  staffing: boolean;
  /**
   * Siempre `true` en la arquitectura actual: `OperationsCalendar` no vive
   * dentro de `OperationalModel` todavía — el motor siempre tiene un
   * calendario disponible vía `DEFAULT_OPERATIONS_CALENDAR` (reference_estimate).
   * Este campo existe para que un futuro calendario declarado por la empresa
   * tenga un lugar natural acá sin cambiar la forma de `TwinCapabilities`.
   */
  scheduling: boolean;
  /** Al menos un producto con ProductionProfile que declara batchSize/hoursPerBatch o ratePerHour — el dato mínimo de TIEMPO, independiente de materiales. */
  productionReference: boolean;
  /** Al menos un pedido cargado en el Twin. */
  orders: boolean;
  /** Al menos un producto con BOM declarado (materialsPerUnit no vacío en algún step de su profile). */
  materials: boolean;
  /** Hay datos de inventario cargados (aunque sea parcial/incompleto). */
  inventory: boolean;
}

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
 * ============================================================================
 * MATERIAL FEASIBILITY — tri-state (Checkpoint 9B.1)
 * ============================================================================
 * Ausencia de datos NUNCA es equivalente a "pass". Un producto sin BOM
 * declarado, o con BOM pero sin inventario conectado, no tiene forma real de
 * evaluarse — eso es categóricamente distinto de "se evaluó y no hay
 * faltante". Ver `canEvaluateMaterials()` en evaluate-scenario.ts para la
 * regla exacta de cuándo una evaluación real es posible.
 *
 * - "pass": se evaluó contra BOM + inventario reales, sin faltantes.
 * - "fail": se evaluó contra BOM + inventario reales, con al menos un faltante.
 * - "not_evaluated": no hay BOM y/o inventario suficiente para evaluar — NUNCA
 *   se interpreta como "no hay problema", ni tampoco como "hay un problema".
 */
export type MaterialFeasibility = "pass" | "fail" | "not_evaluated";

/**
 * ============================================================================
 * OPERATIONAL FEASIBILITY (Checkpoint 9B.3)
 * ============================================================================
 * Responde una pregunta previa a `capacityFeasible`: "¿el producto siquiera
 * tiene una Production Reference declarada para intentar el cálculo?" —
 * "not_evaluated" cuando `profile` no existe o `profile.productionReference`
 * está vacío. En ese estado, ningún otro campo numérico de `ScenarioResult`
 * representa un cálculo real (ver comentarios de cada campo abajo) — nunca
 * se inventa un 0, un Infinity visible como resultado final, ni una fecha.
 */
export type OperationalFeasibility = "evaluated" | "not_evaluated";

/**
 * Resultado de evaluar UNA configuración de recursos contra UN pedido.
 *
 * Semántica deliberada (no son sinónimos):
 * - `operationalFeasibility`: ver arriba — "not_evaluated" es la puerta de
 *   entrada; cuando es así, `capacityFeasible`/`deadlineMet`/`feasible` quedan
 *   en `false` (nunca calculados, nunca un true fabricado), `totalHoursNeeded`
 *   y `completionAt` quedan en `null` (nunca 0, nunca una fecha inventada), y
 *   `bottleneck` queda en `null` (no hay ninguna etapa que comparar).
 * - `materialsFeasible`: ver `MaterialFeasibility` arriba — nunca un booleano,
 *   para que "no evaluado" nunca pueda confundirse con "sin faltantes".
 *   Independiente de `operationalFeasibility`: un producto sin Production
 *   Reference puede igual tener Material Formula declarada, y viceversa.
 * - `capacityFeasible`: la configuración de recursos puede físicamente
 *   producir la cantidad pedida (throughput > 0 en cada etapa, unidades
 *   asignadas dentro de lo disponible) — SIN mirar el deadline. Esto es
 *   independiente de materiales y siempre se puede calcular con o sin BOM,
 *   pero SOLO cuando `operationalFeasibility === "evaluated"`.
 * - `deadlineMet`: la fecha de finalización estimada cae en o antes del
 *   deadline del pedido. Puede ser `false` con `capacityFeasible: true` — un
 *   escenario puede ser operacionalmente realizable pero terminar tarde.
 * - `feasible`: `materialsFeasible === "pass" && capacityFeasible`. Deliberadamente
 *   estricto — nunca es `true` cuando los materiales no fueron confirmados,
 *   así este campo nunca sugiere una validación que GUARDIAN no hizo. El
 *   deadline NO participa de este campo a propósito (ver `PlanStatus` para la
 *   clasificación que sí lo combina todo, con nombres que nunca prometen de más).
 */
export interface ScenarioResult {
  orderId: string;
  operationalFeasibility: OperationalFeasibility;
  materialsFeasible: MaterialFeasibility;
  capacityFeasible: boolean;
  deadlineMet: boolean;
  feasible: boolean;
  /** Horas totales estimadas. null cuando `operationalFeasibility` es "not_evaluated" — nunca 0 (eso significaría "instantáneo"). */
  totalHoursNeeded: number | null;
  /** ISO datetime. null si `capacityFeasible` es false o si no se evaluó (no hay forma real de estimar una fecha). */
  completionAt: string | null;
  steps: StepEvaluation[];
  /** null cuando `steps` está vacío — no hay ninguna etapa que pueda ser "la más lenta". */
  bottleneck: StepEvaluation | null;
  materialShortages: MaterialShortage[];
  capacityIssues: CapacityIssue[];
}

export type PriorityStrategy = "as-is" | "prioritize-goal";

/** Intervalo derivado de simulación; nunca se persiste en OperationalModel. */
export interface ScheduleTraceEntry {
  workId: string;
  workType: "existing" | "goal";
  process: ResourceProcess;
  resources: ResourceAllocation[];
  startAt: string;
  endAt: string;
  processingHours: number;
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
  /** null cuando el producto no tiene Production Reference evaluable (`operationalFeasibility: "not_evaluated"`). */
  bottleneck: StepEvaluation | null;
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
  /**
   * `Presentation` resuelta para este Goal — decide cuántos gramos representa
   * cada unidad (ver `resolveOrderPresentation`). Ausente hasta que Ask
   * Guardian la resuelve (directa si el producto tiene una única
   * Presentation, o preguntando al usuario si hace falta) — nunca se corre
   * la simulación con esto sin resolver cuando el producto la necesita.
   */
  presentationId?: string;
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
  /** Ausente en consumidores legacy equivale a `as-is`. */
  priorityStrategy?: PriorityStrategy;
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
 * - fully_viable: materialsFeasible === "pass" && capacityFeasible && deadlineMet.
 *   Solo existe cuando materiales fueron REALMENTE evaluados y dieron pass —
 *   nunca cuando no se evaluaron (ver `operationally_viable` para ese caso).
 * - operationally_viable (Checkpoint 9B.1): capacityFeasible && deadlineMet,
 *   pero materialsFeasible === "not_evaluated". Deliberadamente un estado
 *   propio, nunca colapsado en "fully_viable" — la palabra "fully" nunca debe
 *   sugerir una validación de materiales que GUARDIAN no hizo.
 * - conditionally_viable: llegaría a tiempo (capacityFeasible && deadlineMet)
 *   pero está CONFIRMADO bloqueado por materiales (materialsFeasible === "fail")
 *   — "funcionaría SI se resuelve el faltante". Nunca se usa para "no evaluado".
 * - deadline_missed: es físicamente ejecutable (capacityFeasible) pero no
 *   llega a tiempo (con cualquier estado de materiales).
 * - infeasible: ni siquiera es físicamente ejecutable (capacityFeasible=false).
 */
export type PlanStatus = "fully_viable" | "operationally_viable" | "conditionally_viable" | "deadline_missed" | "infeasible";

export interface EvaluatedScenario {
  config: ScenarioConfig;
  result: ScenarioResult;
  contention: ContentionInfo;
  /** Suma de unitsUsed de máquina por encima de 1 por proceso — un proxy honesto de "más recursos adicionales". */
  extraResourcesUsed: number;
  status: PlanStatus;
  /** Timeline temporal derivado. Ausente cuando no hay workload schedulable. */
  scheduleTrace?: ScheduleTraceEntry[];
  goalScheduledStartAt?: string;
}

/**
 * Qué tipo de resultado obtuvo el Goal en conjunto — determina qué pantalla
 * mostrar (Recommended Plans / Best Conditional Plan / No Plan Meets Deadline
 * / Infeasible). `candidates` ya viene ordenado, listo para mostrar tal cual.
 */
export type GoalOutcomeKind = "fully_viable" | "operationally_viable" | "conditionally_viable" | "deadline_missed" | "infeasible";

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
  /** Estado de materiales del Goal (constante entre escenarios del mismo goal — ver MaterialFeasibility). */
  materialsFeasible: MaterialFeasibility;
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
  /** Los 3 campos reales del `ScenarioResult` elegido — nunca recalculados, solo capturados tal cual quedaron (Reference-Driven Redesign). */
  capacityFeasible: boolean;
  deadlineMet: boolean;
  materialsFeasible: MaterialFeasibility;
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
