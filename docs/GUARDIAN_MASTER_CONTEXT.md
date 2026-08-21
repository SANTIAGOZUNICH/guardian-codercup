# GUARDIAN — MASTER PROJECT CONTEXT

> Fuente de verdad PERMANENTE de intención, arquitectura y continuidad del proyecto.
> Este documento describe EL ESTADO ACTUAL + EL OBJETIVO FINAL — no es un changelog, no acumula historia.
> Actualizar cuando cambie una decisión permanente. Ver protocolo de sesión en la sección 31.

## 1. Qué es GUARDIAN

Un simulador operacional inteligente para laboratorios cosméticos. El usuario le cuenta a GUARDIAN cómo funciona su laboratorio (productos, equipos, tiempos, personal), GUARDIAN construye un modelo simplificado de esa operación (el "Modelo Operacional"), y después se le puede preguntar qué podría pasar: si llega a una fecha, cuánto tarda, cuál es su cuello de botella, qué pasa si pierde una máquina.

## 2. Usuario objetivo

Personas que trabajan en laboratorios cosméticos — dueño, producción, elaboración, envasado, calidad, administración, responsable técnico. Nunca se asume que sean técnicas, programadoras o analistas de datos. Dos perfiles conviven: alguien que conoce muy bien su operación (alta información) y alguien que sabe poco y quiere una aproximación honesta (baja información). Ambos deben poder usar la app sin que ninguno bloquee al otro.

## 3. Problema que resuelve

Capacidad, tiempo, deadline, cuello de botella, disrupciones (pérdida de una máquina), información faltante (sin bloquear), y preguntas generales de conocimiento cosmético.

## 4. Objetivo final

Simulador operacional inteligente para laboratorios cosméticos — no un ERP, no un MRP, no un chatbot genérico.

## 5. Qué NO es

ERP. MRP completo. LIMS. Suite GMP. Chatbot general. Digital Twin industrial exhaustivo. No se planea agregar trazabilidad regulatoria completa, formulador profesional, compras, contabilidad ni mantenimiento industrial.

## 6. Principio de precisión progresiva

Poca información → aproximación honesta (nunca bloquea, nunca inventa). Más información → simulación más precisa. Nunca al revés: poca información nunca produce un número falsamente preciso. Esto aplica en capas: gramaje por unidad, capacidad de máquina, y — desde el checkpoint de Production References — también a qué tan específico es un rate de producción (ver sección 9).

## 7. Modelo de unidades

- **Pedido**: unidades (`Order.quantity`).
- **Contenido por unidad**: gramos (`Presentation.gramsPerUnit`) — GUARDIAN V1 usa GRAMOS DE PRODUCTO POR UNIDAD exclusivamente. Nunca ml, nunca densidad, nunca conversión volumen→masa (decisión de dominio definitiva).
- **Elaboración**: kilogramos. `massKg = units × gramsPerUnit / 1000`. Ejemplo: 10.000 unidades × 200 g = 2.000 kg. Si el reactor procesa 500 kg/batch: `ceil(2000/500) = 4 batches`; a 3h/batch = 12h base.
- **Envasado**: unidades/hora, pero esa velocidad puede estar atada a un producto/presentación/recurso específico (ver sección 9) — nunca se extrapola ni se asume escalado lineal entre presentaciones.

Materiales primas se miden en la unidad que declare cada `Material`/`InventoryItem` (típicamente kg/L/unidades) — completamente independiente del modelo de gramos por unidad de producto.

**Regla conceptual — Tipo de producto vs. gramaje**: el TIPO DE PRODUCTO (ej. "Shampoo") es información general de la empresa — no lleva un gramaje fijo asociado, porque una misma empresa puede fabricar "Shampoo 200g", "Shampoo 500g" y "Shampoo 1kg" bajo el mismo tipo. `Presentation.gramsPerUnit` es información del pedido/escenario específico. Guided Setup → Productos (sección 18) por eso solo pide el nombre del tipo, nunca gramaje; el paso Contenido por unidad (Presentations) sigue siendo donde se resuelve el gramaje cuando el usuario ya lo conoce al momento del setup. Cuando no se conoce ahí tampoco, Ask Guardian ya lo pide antes de simular (sección 16, punto 1) — nunca corre una simulación con datos de masa incompletos.

## 8. Presentations

`Presentation { id, productId, label, gramsPerUnit: SourcedValue<number> }` — array top-level en `OperationalModel.presentations`, nunca embebido en `Product` (mismo patrón que `profiles`). Un producto puede tener 0, 1 o varias presentaciones.

Resolución de la presentación de UN pedido (`resolveOrderPresentation()` en `src/lib/model/presentation.ts`):
1. `order.presentationId` explícito, si existe.
2. Si el producto tiene exactamente una `Presentation` declarada → se usa esa, sin ambigüedad.
3. Cero presentaciones → `{ ok: false, reason: "unknown" }`.
4. Más de una sin especificar cuál → `{ ok: false, reason: "ambiguous", candidates }`.

Nunca se adivina. `computeOrderMassKg()` es la única fórmula de masa de V1 (nunca vía BOM de materiales — esos son independientes, ver sección 10).

Referencia de 50 g (`REFERENCE_PRESENTATION_GRAMS`) ofrecible cuando el usuario no sabe el gramaje, con `gramsPerUnit.source: "reference_estimate"`; un valor tipeado por el usuario siempre es `"company_data"`.

## 9. Production References — cómo se resuelven (Checkpoint de precisión por producto/presentación)

`ProductionReferenceStep` (uno por proceso dentro de un `ProductionProfile`) tiene:
- `batchSize`/`batchUnit`/`hoursPerBatch` — etapas por lote (Elaboración).
- `ratePerHour` + `presentationId?` — Nivel 1/1.5: rate genérico del producto, opcionalmente atado a una presentación (regla histórica: si `presentationId` está seteado, NUNCA se reutiliza para otra presentación).
- `rateVariants?: RateVariant[]` — precisión adicional, sin romper lo anterior.

`RateVariant { productId?, presentationId?, resourceId?, ratePerHour: SourcedValue<number> }`. Especificidad, de más a menos (`resolveEffectiveRate()` en `src/lib/engine/evaluate-scenario.ts`):
1. presentación + recurso exactos (Nivel 4 — ej. "Llenadora 1 con Shampoo 250g = 1100 u/h").
2. presentación exacta, cualquier recurso (Nivel 3).
3. producto + recurso exactos, sin presentación (Nivel 4 sin gramaje).
4. producto exacto, cualquier recurso, sin presentación (Nivel 2).
5. `step.ratePerHour` genérico (Nivel 1, con la regla anti-escalado de `presentationId` de siempre).
6. `null` → el caller cae a `machine.capacity` cruda (Nivel 0, "referencia general de la máquina").

**Nunca se combinan, interpolan ni escalan matemáticamente entre niveles.** Cada nivel es un valor declarado tal cual, o no se usa. Un rate declarado para 50 g nunca se reutiliza para 200 g así exista un rate cercano — si no hay match, cae al nivel siguiente.

**Regla del placeholder de capacidad**: `Resource.capacity === 0` es el sentinel "todavía no se sabe" (nunca "la capacidad real es cero", ver `buildResources()` en `buildModelInputsFromGuidedSetupV2.ts`). Cuando hay un rate resuelto (variante o genérico) pero `machine.capacity` es ese placeholder, el motor usa el rate SIN acotarlo contra 0 — capar contra un 0 falso bloquearía en falso un dato real. Cuando `machine.capacity` es un número real conocido, sigue acotando como siempre ("nunca reemplaza `resource.capacity`, solo la acota").

Company Data siempre gana sobre Reference Estimate cuando compiten datos EQUIVALENTES en especificidad — en la práctica esto nunca genera conflicto porque el merge de variantes es upsert-por-clave (nunca hay dos variantes con la misma combinación `productId`/`presentationId`/`resourceId`), así que no existe un escenario real de "dos datos igual de específicos y contradictorios" que el motor deba arbitrar.

Guided Setup V2 sigue compartiendo una Production Reference entre todos los productos (limitación documentada, ver sección 18) — `rateVariants` vive DENTRO de ese step compartido, permitiendo que distintos productos/presentaciones tengan rates distintos sin necesitar profiles separados por producto.

**Regla permanente — `batchUnit: "kg"` es el modo real de Elaboración en Guided Setup V2 (Checkpoint Pantalla 6, 2026-08-21)**: `computeBatchesNeeded()` en `evaluate-scenario.ts` NUNCA depende de un Material Formula/BOM para `batchUnit: "kg"` — usa `massKg` (`computeOrderMassKg`, units × gramsPerUnit / 1000, la única fórmula de masa de V1, sección 7/8). Sin `gramsPerUnit` resuelto, la etapa queda `blocked` honestamente (mismo mecanismo por el que Ask Guardian ya pregunta gramaje antes de simular, sección 16) — nunca requiere BOM. `mergeBatchInfoMention()` (`guided-setup-v2.ts`) ya usaba `"kg"` por defecto para una entrada nueva sin `batchUnit` explícito (camino NLU/ADVANCED); Guided Setup NOVICE (`setBatchField` en `GuidedSetupScreen.tsx`) ahora usa el mismo default — antes usaba `"units"`, inconsistente con el catálogo de referencia (`reactor-batch-size-kg`, 300-600 kg) que ya asumía kg y quedaba inalcanzable desde la UI manual. Este es un fix de consistencia, no un cambio de motor.

**Capacidad física por equipo en una etapa por lote es solo informativa (limitación real, ver sección 25)**: `computeStep()` en `evaluate-scenario.ts` NUNCA lee `machine.capacity` para un step con `batchSize` definido (esa rama solo cuenta slots de máquina disponibles vía `validMachineUnits`) — a diferencia de las etapas continuas, donde `machine.capacity` sí participa del throughput. Por eso Pantalla 6 (Capacidades) puede pedir una "capacidad (kg)" de referencia POR REACTOR (`EquipmentEntryV2.capacity`/`capacityUnit`), pero el tamaño/tiempo de lote que efectivamente alimenta la simulación (`ProductionReferenceStep.batchSize`/`hoursPerBatch`) sigue siendo UNA sola declaración compartida por todo el proceso (`answers.batchInfo`, keyeado por `ResourceProcess`) — nunca por reactor individual. La UI lo dice explícitamente ("Aplica a todo el proceso de Elaboración") en vez de fingir una precisión que el motor todavía no tiene.

## 10. Materials Intelligence

Opcional. Sin `MaterialFormulaStep` (BOM) + `InventoryItem` (stock) real para un producto, `MaterialFeasibility = "not_evaluated"` — nunca `"pass"` fabricado, nunca `"fail"` inventado. `canEvaluateMaterials()` en `evaluate-scenario.ts` exige AMBOS (BOM real Y algún inventario cargado) antes de intentar la comparación. Capacidad, tiempo, deadline y bottleneck se siguen evaluando igual, con o sin materiales.

**Materials Simulation Rule (permanente, Checkpoint Pantalla 4 + Materials, 2026-08-20) — "LA AUSENCIA DE INFORMACIÓN DE MATERIAS PRIMAS NO ES UNA RESTRICCIÓN"**: máquina de estados de 3 casos, nunca colapsados en un boolean:
- **ABSENTE** (`not_evaluated`) → SKIP. El resultado principal (`PlanCard`, `BaselineCard`, tira de última simulación en Command Center, mensajes de Guardian) NUNCA menciona materiales cuando no hay datos — ni como advertencia, ni como error, ni bajando la viabilidad del plan. `PlanStatus === "operationally_viable"` (capacidad+deadline cumplidos, materiales `not_evaluated`) se muestra con el mismo tono positivo que `"fully_viable"` (`isConfident` en `PlanCard.tsx`), nunca como si hubiera fallado el deadline.
- **PRESENTE + SUFICIENTE** (`"pass"`) → puede mostrarse discretamente ("Materiales: Disponibles" / "Materiales verificados"), nunca con protagonismo sobre capacidad/tiempo/deadline/bottleneck.
- **PRESENTE + FALTANTE REAL** (`"fail"`) → es la ÚNICA restricción legítima de materiales, con cifras reales (necesario/disponible/faltante) — sigue gatillando `material_shortage` en `constraint-detection.ts` como siempre.
- **Datos parciales nunca se convierten en un faltante inventado**: inventario sin fórmula, o fórmula sin inventario, siguen cayendo en `not_evaluated` (`canEvaluateMaterials()` exige ambos) — regla conservadora, nunca se asume faltante sin poder calcularlo.

Todos los componentes de vista leen el tri-state real (`MaterialFeasibility`, vía `BaselineView.materialsStatus`/`PlanCardView.materialsStatus`) y condicionan el renderizado a `!== "not_evaluated"` — nunca infieren un booleano "disponible/faltante" que colapsaría `"fail"` y `"not_evaluated"` en el mismo label.

## 11. Data Provenance

`DataOrigin = "company_data" | "reference_estimate"` para valores de entrada individuales (`SourcedValue<T>`). `DataProvenance = "company_data" | "reference_estimate" | "calculated" | "user_provided"` para la tabla estática de explicabilidad (`data-provenance.ts`). "Not Evaluated" es un cuarto estado real solo para `MaterialFeasibility`, nunca colapsado con "fail".

## 12. Operational Twin (Modelo Operacional)

`OperationalModel { company, orders, products, presentations, materials, inventory, resources, profiles }`. Representa la operación DECLARADA — nunca infiere equipos, productos ni capacidades que el usuario no haya dado o aceptado explícitamente como referencia. Se construye vía `buildOperationalModel()` (Import Data / Excel) o `buildModelInputsFromGuidedSetupV2()` (entrevista guiada) → ambos producen el mismo tipo, consumido por el mismo motor.

## 13. Simulation Engine

`src/lib/engine/simulation-engine.ts` + `evaluate-scenario.ts`. `evaluateScenario()` es el único cálculo matemático real (constraint detection, simulación de goals y Machine Unavailable llaman TODOS a esta misma función). 100% determinístico — mismo input, mismo output, siempre. `simulateGoal()` genera todas las configuraciones de recursos físicamente válidas, las evalúa, y las rankea (`rankScenarios()`) por: capacidad física > materiales > deadline > fecha de finalización > recursos extra > utilización del bottleneck. Calendario productivo (`OperationsCalendar`) explícito: lunes a viernes por defecto, jornada configurable, aritmética "wall-clock" naive (sin conversión real de huso horario).

## 14. Constraint Engine

`src/lib/engine/constraint-detection.ts`. Detecta dos tipos independientes de restricción por pedido real: `material_shortage` (falta confirmada de materia prima) y `deadline_at_risk` (no llega a tiempo, con o sin capacidad física). Severidad determinística (`critical`/`high`/`null`), nunca probabilística.

## 15. Machine Unavailable

`src/lib/engine/disruption.ts` + `disruption-parser.ts`. Único tipo de disrupción soportado en V1: una máquina puntual deja de estar disponible para todo el horizonte simulado (sin disponibilidad parcial en el tiempo). `applyDisruption()` transforma el Twin (nunca simula por sí solo); el resultado se re-evalúa con el mismo `evaluateScenario()`/`simulateGoal()` de siempre.

## 16. Ask Guardian

Routing en 4 categorías (`src/components/ask-guardian/AskGuardianScreen.tsx`):
1. **Simulación operacional** — parser determinístico (`goal-parser.ts`) primero, IA (`interpretWithAI`, contexto `ask_guardian`) como fallback con corrección de typos. Si el producto no tiene gramaje resuelto, pregunta antes de simular (nunca corre una simulación con datos incompatibles).
2. **Consulta operacional** — `src/lib/engine/operational-query.ts`, 100% determinístico (cuello de botella, conteo de recursos, faltantes de información, procedencia de datos) — nunca vía LLM.
3. **Conocimiento cosmético** — `/api/ask-guardian-knowledge`, respuesta conceptual de Gemini, nunca modifica el Twin, nunca inventa concentraciones/compatibilidades/claims/resultados regulatorios.
4. **Fuera de alcance** — mensaje fijo, nunca un chatbot genérico.

El status `"unsupported"` de la IA operacional también reintenta conocimiento cosmético antes de mostrar el mensaje genérico (una pregunta de cosmética a veces se clasifica ahí por error — ej. "reemplazar el ácido hialurónico" leído como sustitución de materia prima).

## 17. Gemini

Gemini INTERPRETA lenguaje natural (typos, fonética, frases coloquiales) y responde conocimiento cosmético conceptual. El Engine determinístico CALCULA — Gemini nunca hace ni estima matemática de capacidad/tiempo/fecha. Variable: `GUARDIAN_API_KEY`, server-side únicamente (`.env.local`, gitignored), nunca expuesta al browser. Si no está configurada, la app sigue funcionando en modo puramente determinístico (nunca rompe).

## 18. Entry Flow — Intake (Pantalla 2) + Guided Setup

**Flujo de entrada (Checkpoint 2B, 2026-08-19)**: `Login → Intake ("Contanos sobre tu laboratorio") → Guided Setup (arranca en Productos)`. `OnboardingScreen` (bienvenida sin decisión, "Hola X, soy Guardian...") y `EntryChoiceScreen` (elegir Import vs Guided Setup) se ELIMINARON del flujo y del repo (`src/components/onboarding/`, la mitad de `src/components/upload/` — carpetas vacías tras el borrado). El step `"intro"` de `GuidedSetupScreen` también se eliminó — su UI (texto libre) se mudó a Intake.

`IntakeScreen` (`src/components/intake/IntakeScreen.tsx`, fase `"intake"` en `GuardianApp.tsx`) es el único punto de entrada post-Login. Tres caminos que PUEDEN combinarse:
1. **Texto libre** — mismo NLU/Gemini que antes vivía en el step "intro" (typos incluidos). La extracción se aplica con `applyNluExtraction` (`src/lib/model/guided-setup-v2.ts`), función pura extraída para que Intake y (si algún día vuelve a hacer falta) Guided Setup compartan una sola implementación — nunca dos merges que puedan divergir.
2. **Cargar archivos** — reusa el importador real de 3 planillas (`parseExcel.ts` + `buildOperationalModel`/`buildDemoModel`), el mismo que tenía `UploadScreen` (eliminado, su lógica vive ahora acá). Solo se ofrece `.xlsx` en 3 slots nombrados (Pedidos/Inventario/Recursos) — nunca CSV/PDF/DOCX, la app no sabe leerlos.
3. **Preguntas guiadas** — botón "Comenzar con preguntas" navega directo a Productos (`onStartGuidedSetup(answers)`), pasando lo ya extraído por texto libre como `initialAnswers` a `GuidedSetupScreen` (nunca vuelve a preguntar lo ya entendido).

**Límite real, documentado en vez de fingido**: texto libre y archivos son dos pipelines de datos estructuralmente distintos (`GuidedSetupV2Answers` vía NLU vs `RawModelInput` directo desde Excel) — no hay merge real entre ambos. Si el usuario escribe texto Y completa los 3 archivos, "Construir con estos archivos" usa EXCLUSIVAMENTE los archivos (fuente completa y autoritativa); el texto no se pierde en silencio — Intake muestra una nota explícita avisándolo y sugiriendo la opción 3 para combinar. Datos demo también pasan por `onModelReady`, nunca muestran "Laboratorio Genus" (usan el `companyName` real de la sesión).

Guided Setup en sí (`src/lib/model/guided-setup-v2.ts` + `GuidedSetupScreen.tsx`), dos modos, MISMO estado y motor:
- **NOVICE**: responde bloque por bloque — Productos → Procesos (Pantalla 4) → Equipos (Pantalla 5) → Capacidades (Pantalla 6, unidad adaptada por tipo de proceso + variantes por producto, progressive disclosure) → Tiempos de tanda → Personal → Horario → Materiales (opcional).
- **ADVANCED**: ahora vive en Intake (ver arriba), no dentro de Guided Setup.

**Regla permanente — Procesos vs. Presentaciones (Checkpoint Pantalla 4, 2026-08-20)**: el step obligatorio entre Productos y Equipos es **Procesos** (`processesRaw: string[]`, texto libre del usuario — Elaboración/Envasado/Codificado son EJEMPLOS/sugerencias, nunca un catálogo cerrado ni una selección forzada), NUNCA "Contenido por unidad" (`gramsPerUnit`/presentación). El flujo real es `Productos → Procesos → Equipos → ...`, nunca `Productos → Presentaciones obligatorias → Procesos` — `gramsPerUnit` pertenece al pedido/escenario (sección 7), no a la definición genérica del producto, así que no tiene sentido pedirlo en este punto de la entrevista. El texto libre de Procesos se normaliza vía `normalizeProcessName()` (matching por keyword, reusado de Guided Setup V1) a un `ResourceProcess` conocido solo cuando matchea con confianza — nunca fuerza un match; lo no reconocido se reporta honestamente en `TwinCompleteness.missing.unsupportedProcesses`, nunca se descarta en silencio ni se le finge soporte. El orden declarado en Procesos gobierna el orden real de la Production Reference compartida (`resolveProcessOrder()` en `buildModelInputsFromGuidedSetupV2.ts`) cuando hay equipo real para ese proceso; cualquier proceso con equipo pero sin declaración explícita de orden cae al final. `gramsPerUnit` se sigue resolviendo, cuando aplica, en Ask Guardian antes de simular (sección 16, punto 1) — nunca durante Productos/Procesos.

**Regla permanente — Equipos se agrupan por Procesos, nunca por un catálogo fijo (Checkpoint Pantalla 5, 2026-08-20)**: `EquipmentEntryV2.processRaw: string` guarda la etapa EXACTA de `processesRaw` (Pantalla 4) bajo la que el usuario agrupó ese equipo — nunca un `ResourceProcess` forzado en este punto. La traducción a un `ResourceProcess` real (para que el equipo entre a la Production Reference) ocurre recién en `buildModelInputsFromGuidedSetupV2.ts` vía `normalizeProcessName(processRaw)`; un equipo bajo una etapa que no normaliza (ej. "Pesada") simplemente no genera un `Resource` — la etapa ya quedó honestamente reportada en `TwinCompleteness.missing.unsupportedProcesses` (sección 18), nunca un segundo error por equipo. Alta rápida (`addEquipmentToProcess()`): solo nombre + etapa, SIN pedir categoría/capacidad — `capacity: null` siempre (UNKNOWN, nunca inventada); la categoría se infiere best-effort por keyword sobre el nombre (`guessEquipmentCategory()`, mismo principio "nunca fuerza un match" que el resto del dominio) únicamente para que el step de Capacidades pueda seguir ofreciendo una referencia. Renombrar una etapa en Pantalla 4 reasigna (`remapEquipmentProcess()`) el equipo ya agrupado bajo el nombre viejo — nunca queda huérfano. Un proceso sin ningún equipo cargado ("Sin equipos cargados todavía.") nunca bloquea ni se marca como error — mismo principio que "No lo sé" en el resto de la entrevista. Sin ilustraciones de maquinaria real: solo iconografía genérica por keyword (`ProcessIcon`, un ícono por tipo de etapa) — la información vive en el texto, nunca en un dibujo.

**Regla permanente — Capacidades adapta la unidad al tipo REAL de proceso, nunca u/h para todo (Checkpoint Pantalla 6, 2026-08-21)**: `GuidedSetupCapacitiesStep.tsx` agrupa por `processesRaw` (misma fuente de verdad que Pantalla 5) y clasifica cada grupo vía `normalizeProcessName()` en tres tipos (`processKind()`): **batch** (Elaboración) — capacidad por reactor en kg (informativa, ver sección 9) + UNA declaración de tiempo/tamaño de lote compartida por proceso (`BatchTimingCard`, reusa `answers.batchInfo`/`setBatchField`, ahora en `batchUnit: "kg"`); **continuous** (Envasado/Codificado/cualquier proceso reconocido) — velocidad general en u/h por equipo + `CapacityVariantsBlock` preservado sin cambios (Product Contract, `rateVariants`/`resolveEffectiveRate` intactos); **unsupported** (proceso custom que no normaliza, ej. "Pesada") — capacidad opcional SIN unidad asumida, nunca inventa semántica que el motor no entiende. `gramsPerUnit` nunca se pide acá — sigue perteneciendo al pedido/escenario (sección 7), Ask Guardian lo pide antes de simular cuando hace falta.

"No lo sé" nunca bloquea el onboarding — ofrece una referencia cuando existe, o deja el campo como faltante explícito (nunca 0 real). La entrevista sigue compartiendo una Production Reference entre todos los productos declarados (limitación real y documentada) — `rateVariants` es la vía para que ese step compartido tenga precisión por producto/presentación/recurso sin necesitar profiles separados.

**Progreso compartido "Paso X de Y"**: `src/lib/model/guided-setup-progress.ts` — `INTAKE_STEP_NUMBER=1` + `GUIDED_SETUP_QUESTION_STEPS=8` (products..materials, excluye review) = `TOTAL_ONBOARDING_STEPS=9`. Intake siempre es "Paso 1"; Productos calcula `currentStep = stepIndex + 1 + INTAKE_STEP_NUMBER` → "Paso 2 de 9".

**Visual — step "Productos" (Checkpoint 2A, ahora Pantalla 3, 2026-08-19)**: continuación directa del lenguaje visual del Login/Intake (mismo `GuardianLogo`, mismo Guardian 3D real vía `variant="asset"`, mismo `--accent-gradient` reservado para el CTA protagonista "Continuar"). Layout de dos columnas (`ProductsStepScreen`, `src/components/guided-setup/GuidedSetupProductsStep.tsx`): izquierda con marca/promesa/Guardian/card contextual (~33%), derecha con el panel "Configuración guiada" — progreso real, pregunta, input+chips (sin íconos por producto — chips de texto puro, nunca un catálogo cerrado), y los dos bloques de contexto sobre gramaje. El resto de los steps (`capacities`, `batchTimes`, `staffing`, `schedule`, `materials`, `review`) sigue con el layout centrado original hasta que cada uno tenga su propio checkpoint visual — extender ese mismo patrón (un componente dedicado por step, montado condicionalmente en `GuidedSetupScreen.tsx`) en vez de rediseñar el archivo monolítico de una sola vez.

## 19. Reference Catalog

`src/data/reference-catalog.ts` + `src/lib/engine/reference-catalog.ts`. Catálogo pequeño y explícito de estimaciones editoriales (reactor, llenadora, etiquetadora, codificadora) — nunca un benchmark de industria. Tres pasos separados: REFERENCE AVAILABLE (existe en el catálogo) → USER ACCEPTS (decisión explícita de la UI) → REFERENCE IN USE (`applyAcceptedReference()`, el único camino que adjunta un valor con `source: "reference_estimate"`).

## 20. Idioma

UI 100% en español (rioplatense neutro, profesional, simple). Verificado exhaustivamente: Login, Intake, Guided Setup, Command Center, Constraints, Ask Guardian (+ subpantallas), Disruption, Recommended Plans, Why This Plan, labels del grafo del Twin, formateo de fechas (`dom/lun/mar/mié/jue/vie/sáb`, `ene`...`dic`).

## 21. Branding

GUARDIAN es un producto independiente. Sin referencias visibles a "Genus"/"Laboratorio Genus" (renombrado a datos demo neutros — "Laboratorio Guardian" como empresa demo, cliente demo "Belleza Norte SA"). Identificadores de código también renombrados (`buildDemoModel`, `DEMO_PRODUCTION_PROFILES`, etc.) para consistencia, no solo lo visible al usuario.

## 22. Visual Direction

Oscuro, premium, tecnológico, moderadamente futurista, industrial pero claro. Guardian (el personaje/ícono) es neutral e inteligente — nunca infantil, nunca agresivo. La dirección visual actual (glass panels, acentos, animaciones de reveal progresivo en el grafo del Twin) está aprobada — el próximo bloque de trabajo (post functional freeze) es pulido visual/demo experience, no redefinir esta dirección desde cero.

**Login / First Impression (checkpoint dedicado, 2026-08-18) — dirección visual aprobada, referencia para el resto del pulido visual:**
- Composición de dos columnas en desktop (izquierda: marca + promesa + Guardian + beneficios; derecha: panel de acceso), colapsa a una columna en viewports angostos.
- Acento violeta secundario (`--accent-violet: #8b6cf5`) sumado al azul existente, combinados en `--accent-gradient` (`linear-gradient(135deg, var(--accent), var(--accent-violet))`) — reservado exclusivamente para el CTA protagonista de una pantalla (`Button variant="gradient"`), nunca decorativo en cascada.
- Marca hexagonal reutilizable (`GuardianLogo`, `src/components/ui/GuardianLogo.tsx`) — hexágono + trazo abierto tipo "G", mismo gradiente azul→violeta; usada en el lockup de marca y como separador decorativo dentro del panel de acceso.
- Guardian (el robot) mantiene su API de estados sin cambios (`state`/`size`/`message`/`className`). El chassis SVG/CSS (9A/9B) sigue siendo el default (`variant="svg"`, implícito) en las 15 pantallas que lo usan. Se le sumaron detalles menores (costuras de torso, núcleo del pecho con forma hexagonal en vez de círculo) que ecoan el lenguaje del `GuardianLogo`.
- **Guardian Character Integration (checkpoint dedicado, 2026-08-19)**: `Guardian` gana `variant?: "svg" | "asset"` (default `"svg"`, cero cambio para las pantallas existentes). `variant="asset"` renderiza un PNG real (`public/guardian/guardian-idle.png`, recorte a bounding box + alpha real verificado, sin rectángulo de fondo) vía `next/image` con `priority`, flotación sutil (±4px, 4.4s) + micro-inclinación, glow ambiental y una plataforma lumínica inferior — usado únicamente en Login (`size={300}`) por ahora. Assets por estado se resuelven vía `STATE_ASSET: Record<GuardianState, string>` en `Guardian.tsx`: hoy todas las entradas apuntan a `guardian-idle.png` (nunca se inventa/filtra una imagen falsa para simular otro estado); sumar `guardian-listening.png`, etc. es agregar una línea a ese mapa, sin cambios de arquitectura.
- Panel de acceso: `border-border-default` + `bg-bg-elevated` + `shadow-elevation-2`, esquinas redondeadas — elevación sutil, no glassmorphism exagerado.
- Densidad reducida a propósito: máximo 3 claims de beneficio, sin footer legal ni métricas inventadas.
- Movimiento controlado (entrada escalonada, sin partículas ni motion de fondo constante) — vía el hook existente `useMotionSafe`, respeta `prefers-reduced-motion`.
- Patrón de extensión de componentes compartidos: `Input`/`Button` se extendieron de forma aditiva y retrocompatible (`icon`/`trailing` en `Input`, `variant="gradient"` en `Button`) en vez de crear variantes paralelas — este es el patrón a seguir en los próximos checkpoints de pulido visual (Guided Setup, Review, Command Center) para evitar deuda visual.

**Pantalla 2 — Intake "Contanos sobre tu laboratorio" (Checkpoint 2B, 2026-08-19)**: mismo lenguaje que Login/Productos — dos columnas, `GuardianLogo`, Guardian 3D (`variant="asset"`), `--accent-gradient` reservado solo para "Comenzar con preguntas". Reemplaza a Onboarding+EntryChoice (ver sección 18).

**Pantalla 4 — Procesos / Flujo operativo (Checkpoint Pantalla 4, 2026-08-20)**: mismo lenguaje visual que Productos (`ProcessesStepScreen`, `src/components/guided-setup/GuidedSetupProcessesStep.tsx`) — dos columnas, `GuardianLogo`, Guardian con placa de la empresa, progreso real vía `guided-setup-progress.ts`. Panel derecho: input + botón "Agregar" (Enter también agrega) con chips de sugerencia (`PROCESS_SUGGESTIONS`, filtradas contra lo ya agregado, nunca auto-seleccionadas), lista horizontal de nodos conectados por flechas (`ArrowRight`) — cada nodo editable con click-to-edit, X para quitar, chevrons izquierda/derecha para reordenar (sin librería de drag-and-drop, decisión deliberada de mantener la UI simple). Resumen "Así entendí tu flujo de trabajo" + card de Tip. Verificado sin overflow horizontal en 1440×900 y 1366×768 (overflow vertical moderado y aceptado en 1366×768 con 5 nodos).

**Pantalla 5 — Equipos (Checkpoint Pantalla 5, 2026-08-20)**: mismo lenguaje visual que Productos/Procesos (`EquipmentStepScreen`, `src/components/guided-setup/GuidedSetupEquipmentStep.tsx`) — dos columnas, `GuardianLogo`, Guardian con placa (`size=200`, sigue por encima de `MIN_SIZE_FOR_PLATE`), progreso real. Panel derecho: una card por cada etapa de `processesRaw` (Pantalla 4 es la fuente de verdad — nunca las 3-5 etapas hardcodeadas de la referencia visual), con un ícono genérico por tipo de etapa (`ProcessIcon`, nunca una ilustración de maquinaria real) y los equipos de esa etapa como chips de texto (click en "..." → Editar/Eliminar; click-to-edit inline; "+ Agregar equipo" revela un input inline, Enter agrega y el input queda abierto para altas consecutivas rápidas). Nunca pregunta capacidad/velocidad/tiempos/gramaje acá — banner discreto avisando que eso es del próximo paso. Verificado sin overflow horizontal en 1440×900 y 1366×768 (overflow vertical ~0px en 1440×900 y moderado/aceptado en 1366×768, mismo criterio que Pantalla 4, con un caso denso de 4 etapas × 6 equipos).

**Pantalla 6 — Capacidades y tiempos (Checkpoint Pantalla 6, 2026-08-21)**: mismo lenguaje visual (`CapacitiesStepScreen`, `src/components/guided-setup/GuidedSetupCapacitiesStep.tsx`; ícono `Gauge`, Guardian `size=160` — sigue por encima de `MIN_SIZE_FOR_PLATE`) — dos columnas, progreso real, mismo patrón de card-por-etapa que Pantalla 5 (reusa `ProcessIcon`). Cada card adapta sus campos al tipo de proceso (ver `processKind()`, sección 9/18) en vez de asumir u/h para todo — reemplaza al viejo `CapacitiesStep` (que sí asumía u/h siempre, un bug real que este checkpoint corrige, no solo un rediseño). Reusa/exporta primitivos ya existentes de `GuidedSetupScreen.tsx` (`ReferenceOffer`, `CapacityVariantsBlock`, `BATCH_PROCESS`, `useAutofillSafeName`) en vez de duplicarlos. Verificado sin overflow horizontal en 1440×900 y 1366×768; overflow vertical real y esperable en el caso más denso posible (4 etapas, 6 equipos, 3 con el prompt de precisión progresiva expandido) — mayor que en Pantallas 4/5 porque esta pantalla tiene genuinamente más contenido por fila (card de lote compartida + oferta de referencia + prompt "¿cambia por producto?"), y el piso de compresión adicional está limitado por la altura fija del componente `Button` compartido (`h-12`, sin `tailwind-merge` en `cn()` — no es seguro sobreescribirla vía `className`, ver sección 23) — no se tocó ese componente global por quedar fuera de alcance de este checkpoint.

**REGLA PERMANENTE — Guardian conserva la identidad del laboratorio (2026-08-19, vigente desde el Hotfix Personalización Global, rediseñada visualmente en el Name Plate Hotfix)**: después del Login, Guardian puede presentar la identidad del laboratorio mediante una placa corporativa física sostenida por el personaje con ambas manos — mismo personaje siempre, misma personalización; los estados cambian movimiento/pose/luz, nunca la identidad. El nombre proviene siempre de `CompanyNameContext` (`CompanyNameProvider`/`useCompanyName`, `src/lib/context/CompanyNameContext.tsx`), montado una vez en `GuardianApp.tsx` con `value={session?.companyName ?? null}`. `Guardian` (`GuardianProps.companyName?: string`) resuelve `companyName ?? useCompanyName() ?? undefined` — un valor explícito por prop sigue ganando (override puntual), pero NINGÚN call site necesita pasarlo a mano: Productos y el header compartido de Guided Setup lo reciben automáticamente. La placa solo aparece cuando la escala del Guardian permite legibilidad suficiente (ver abajo). Login no la muestra — `companyName` todavía no existe al momento de loguearse.

**Placa corporativa sostenida (Name Plate Hotfix, 2026-08-19 — reemplaza la pechera pegada al torso del Hotfix anterior, que NO quedó aprobada)**: segundo asset real, `public/guardian/guardian-plate.png` — mismo Guardian oficial (cabeza/cara/ojos/materiales/propulsor idénticos), brazos flexionados sosteniendo con ambas manos una placa rectangular vacía a la altura del pecho. Verificado con medición de manos en el asset original (`guardian-idle.png`: manos a 25.4%/73.1% del ancho, separadas 552px, gesto de brazos abiertos) que ESE asset no permitía una pechera creíble — se pidió y se recibió un asset nuevo con la pose correcta, confirmada visualmente antes de integrar (checkpoint obligatorio "¿las manos parecen sujetar el cartel?" superado). El nuevo PNG llegó con alpha ruidoso (halo de fondo del origen, ~23% de píxeles en rango medio) — se limpió con máscara por umbral + cierre morfológico vía Pillow antes de recortar/guardar. `GuardianPlateName` en `Guardian.tsx` ubica el texto en el hueco vacío de la placa (medido a mano con overlay de grilla: rectángulo útil x 17.4%-79.0%, y 51.9%-63.3%), centrado y creciendo simétrico para 1 línea (nombres cortos, `plateFontSize()` prioriza tamaño grande) o 2 líneas (nombres largos, según la PALABRA más larga — nunca 3, nunca overflow). `MIN_SIZE_FOR_PLATE = 130`: por debajo de ese alto renderizado Guardian vuelve al asset original sin placa (brazos abiertos) en vez de forzar texto ilegible — así el header compartido de Guided Setup (84px) no muestra placa, pero Intake (240px) y Productos (220px) sí. El nombre exacto ingresado en Login se muestra literal — nunca se antepone "Laboratorio" ni se abrevia.

**Limitación real y call sites deliberadamente sin migrar**: Call sites de estado-dependiente (`alert`/`success` en `ConstraintScreen`/`DisruptionScreen`/`RecommendedPlansScreen`/`ModelBuildingScreen`/`AskGuardianScreen`) y los íconos de marca muy chicos (`CommandCenter` 40px, `AppShell` 30-44px) se dejaron deliberadamente en `variant="svg"` — migrar los primeros perdería la señal de color de alerta/éxito que el chassis SVG anima explícitamente; migrar los segundos degradaría un ícono de marca pequeño a una foto photorealista ilegible a esa escala. Migrarlos es seguro para un checkpoint futuro si se decide llevar también el color de estado al asset 3D (hoy `guardian-plate.png` es un único render "idle/listening", igual que `guardian-idle.png` — ver `STATE_ASSET`/mapa de assets por estado, sección de arquitectura).

## 23. Current Architecture

Basado en el código real del repo (`src/`):
- **Dominio**: `src/lib/types.ts` (tipos centrales: `OperationalModel`, `Presentation`, `RateVariant`, `ProductionReferenceStep`, `ScenarioResult`, etc.), `src/lib/model/presentation.ts` (resolución de gramaje), `src/lib/model/buildOperationalModel.ts`, `src/lib/model/buildModelInputsFromGuidedSetupV2.ts`, `src/lib/model/guided-setup-v2.ts`.
- **Motor**: `src/lib/engine/evaluate-scenario.ts` (cálculo único), `simulation-engine.ts` (generación/ranking de escenarios), `constraint-detection.ts`, `disruption.ts` + `disruption-parser.ts`, `goal-parser.ts`, `presentation-parser.ts` (gramos en texto libre), `operational-query.ts`, `shortage-engine.ts`, `reference-catalog.ts`.
- **NLU/IA**: `src/lib/nlu/types.ts` (schemas Zod), `prompt.ts`, `client.ts`, `knowledge-{types,prompt,client}.ts`; rutas server `src/app/api/nlu/route.ts` y `src/app/api/ask-guardian-knowledge/route.ts`.
- **View models**: `src/lib/view/*.ts` — traducen resultados del motor a lo que la UI pinta, cero cálculo propio.
- **UI**: `src/components/{login,intake,guided-setup,model,command-center,constraint,ask-guardian,shell,guardian,ui}/`.
- **Datos demo**: `src/data/production-profiles.ts`, `operations-reference.ts`, `reference-catalog.ts`; generador `scripts/generate-demo-data.mjs` → `public/demo/*.xlsx`.

## 24. Current Functional State

**GUARDIAN V1 — FUNCTIONAL FREEZE: READY.** Todo lo listado en las secciones 6-19 está implementado y verificado (tests + build + lint + walkthrough manual). Production References por producto/presentación/recurso (sección 9) es el último gap funcional cerrado en este checkpoint.

## 25. Known Limitations

- Guided Setup V2 comparte una Production Reference entre todos los productos declarados (mitigado por `rateVariants`, no eliminado — Import Data/Excel sigue siendo el camino para profiles totalmente independientes por producto).
- `operational-query.ts` responde "cuál es mi cuello de botella" de forma agregada (proceso más frecuente entre pedidos con restricción de deadline), no por pedido puntual.
- No hay benchmark automatizado de calidad de las respuestas de conocimiento cosmético (son no determinísticas).
- `PlanCardView`/`BaselineCard` colapsan visualmente `MaterialFeasibility: "fail"` y `"not_evaluated"` en el mismo label "Faltan" — la distinción real sigue existiendo en los datos (`ScenarioResult.materialsFeasible`), no en ese componente puntual.
- Eliminar un proceso en Pantalla 4 que ya tiene equipo cargado en Pantalla 5 no reasigna ni borra en cascada ese equipo — queda con un `processRaw` que ya no matchea ningún proceso declarado (deja de mostrarse en Pantalla 5, pero sigue en `answers.equipment`). Caso real no cubierto en este checkpoint (renombrar sí reasigna correctamente, ver sección 18) — mitigación futura si se vuelve un problema real de uso.
- Capacidad física por reactor (Pantalla 6, kg) es informativa — el motor de simulación por lote no la usa (solo cuenta slots de máquina disponibles), y no puede diferenciar tiempo/tamaño de lote por reactor individual, solo por proceso completo (ver sección 9). Evolución natural para cuando el motor de batch soporte precisión por recurso, análoga a `rateVariants` para procesos continuos.
- (Resuelta) Se creía que no había deployment activo — verificado que sí lo hay, ver sección 29.

## 26. Non-Negotiable Rules

- Nunca inventar datos que el usuario no declaró.
- Company Data > Reference Estimate cuando compiten datos equivalentes.
- Reference Estimate requiere aceptación explícita del usuario.
- Falta de datos ≠ PASS (nunca, en ningún tri-state del sistema).
- Materiales son opcionales — capacidad/tiempo/deadline/bottleneck funcionan sin ellos.
- Gemini interpreta lenguaje; el Engine calcula matemática. Nunca al revés.
- Simulación 100% determinística.
- Respetar el calendario laboral declarado (`OperationsCalendar`) — nunca asumir 24/7.
- Nunca extrapolar/escalar un rate entre presentaciones o productos distintos.
- Nunca asumir escalado lineal de velocidad por gramaje.
- La ausencia de datos de materias primas nunca es una restricción — SKIP, nunca FAIL ni WARNING (ver Materials Simulation Rule, sección 10).
- Productos genéricos nunca requieren gramaje durante el setup — `gramsPerUnit` es del pedido/escenario, no del producto (ver sección 18).
- Crear un equipo nunca requiere capacidad — `capacity: null` (UNKNOWN) hasta que el usuario la declara en el paso de Capacidades; un proceso sin ningún equipo cargado nunca es un error (ver sección 18).
- Elaboración se mide en kg/lote (`batchUnit: "kg"`), nunca en u/h — Envasado/Codificado/procesos continuos usan u/h; un proceso custom no reconocido no asume ninguna unidad (ver sección 9/18).
- Una consulta de conocimiento cosmético nunca modifica el Operational Twin.
- UI 100% en español.
- GUARDIAN V1 es exclusivamente para laboratorios cosméticos.

## 27. Out of Scope

ERP/MRP/LIMS/GMP suite completos. Trazabilidad regulatoria. Formulador profesional. Compras/contabilidad/mantenimiento industrial. Multi-planta. Múltiples industrias (rubro fijo = cosmética). Ausentismo/mantenimiento predictivo/IoT como disrupciones (solo Machine Unavailable). Deploy (explícitamente fuera de alcance de cualquier checkpoint hasta que se pida).

## 28. Testing Strategy

Vitest, 376 tests en 30 archivos, todos deterministas (sin red — ningún test llama a Gemini real). Cobertura por capa: dominio (`presentation.test.ts`), motor (`evaluate-scenario.test.ts` incluye `resolveEffectiveRate` con los 4 niveles de especificidad + el caso crítico anti-escalado), Guided Setup (`guided-setup-v2.test.ts`, `buildModelInputsFromGuidedSetupV2.test.ts` con casos end-to-end de rates por producto), NLU (`presentation-parser.test.ts`, `fixtures.test.ts`), Ask Guardian (`operational-query.test.ts`). Antes de cerrar cualquier checkpoint: `npx tsc --noEmit` + `npx vitest run` + `npm run lint` + `npm run build`, los 4 en verde, más un walkthrough manual real de los flujos afectados (Browser pane, nunca asumido).

## 29. Deployment

Existe el proyecto Vercel `guardian-codercup`, conectado al repo `SANTIAGOZUNICH/guardian-codercup`. Branch productiva: `master`. Source: Git integration de Vercel (auto-deploy) — no requiere `vercel.json` en el repo para desplegar (Vercel autodetecta Next.js). Todo push a `master` dispara un deployment de producción automático, sin acción manual.

URL de producción: `https://guardian-codercup.vercel.app`.

Último estado verificado (ver sección 32): commit `2ce1de35fcfbbd76260e2775a60e24365789fdad`, deployment `dpl_5bcpEr1u9KsAeaUWn1BNjd5TQujD`, status `READY`.

Localmente se sigue pudiendo correr con `npm run dev` (desarrollo) o `npm run build` + `npm run start` (producción local). `GUARDIAN_API_KEY` vive en `.env.local` (gitignored, nunca commiteado) — en Vercel debe estar configurada como variable de entorno del proyecto por separado (no verificado en este checkpoint; si el conocimiento cosmético o el NLU fallan en producción, revisar ahí primero).

## 30. Roadmap

- **DONE**: Modelo de dominio (gramos/presentaciones), Motor (masa/batches/rates incluyendo precisión por producto-presentación-recurso), Guided Setup (bloques + progressive disclosure + modo avanzado), Ask Guardian (4 categorías de routing), Idioma (100% español), Branding (sin Genus visible), Production References por producto/presentación — **GUARDIAN V1 FUNCTIONAL FREEZE**. Visual Polish — Login/First Impression + Guardian Character Integration, Guided Setup → Productos, Intake "Contanos sobre tu laboratorio" + personalización global de Guardian, Guided Setup → Procesos/Flujo operativo, Guided Setup → Equipos, y Guided Setup → Capacidades y tiempos (ver secciones 9/18/22): checkpoints visuales cerrados hasta ahora. Flujo de entrada reestructurado: `Login → Intake → Productos → Procesos → Equipos → Capacidades → resto de Guided Setup` (Onboarding/EntryChoice/UploadScreen standalone eliminados, ver sección 18; "Contenido por unidad" ya no es un step obligatorio, ver sección 18). Materials Simulation Rule (sección 10): ausencia de datos de materiales nunca aparece como restricción en el resultado principal — corregido en `simulation-view-model.ts`, `PlanCard.tsx`, `BaselineCard.tsx`, `CommandCenter.tsx`. Capacidades ahora adapta la unidad al tipo de proceso (kg/lote para Elaboración, u/h para continuos, sección 9/18) — corrige un bug real donde todo equipo asumía u/h.
- **NEXT**: Visual Polish / Demo Experience para el resto de las pantallas — Guided Setup (batchTimes, staffing, schedule, materials, review), Building Twin, Command Center, Simulación, Disruption. Un checkpoint por pantalla, extendiendo la dirección visual establecida (secciones 18/22), no redefiniéndola.
- **LATER**: Profiles verdaderamente independientes por producto en Guided Setup V2 (eliminar la limitación de la sección 25); benchmark de calidad para conocimiento cosmético; distinción visual real fail vs. not_evaluated en PlanCard.
- **CUT**: Todo lo listado en la sección 27 (Out of Scope) — no reconsiderar sin una decisión de producto explícita.

## 31. Protocol for New Claude Sessions

ANTES DE MODIFICAR:
1. Leer este documento completo.
2. Inspeccionar el código relevante a la tarea.
3. El código es la verdad de QUÉ ESTÁ IMPLEMENTADO.
4. Este documento es la verdad de intención/producto — QUÉ QUEREMOS.
5. Reportar discrepancias relevantes antes de asumir cuál gana.
6. Nunca reconstruir contexto desde memoria de conversación — este archivo + el código son la única fuente.
7. Nunca cambiar decisiones no relacionadas con la tarea pedida.
8. Usar tests específicos durante el desarrollo (no correr toda la suite en cada micro-cambio).
9. Validación completa (tsc + vitest + lint + build) al final, antes de reportar el checkpoint cerrado.
10. Actualizar este documento si cambia una decisión permanente — solo las secciones afectadas (típicamente 24, 25, 30, 32; y cualquier sección estructural que la decisión toque).
11. No avanzar al siguiente checkpoint del roadmap sin que el usuario lo pida explícitamente.

## 32. Last Verified State

- **Fecha**: 2026-08-21.
- **Tests**: 376 verdes, 30 archivos, 0 fallos.
- **Build**: verde (`next build`, incluye `/api/nlu` y `/api/ask-guardian-knowledge`).
- **Lint**: verde, 0 errores, 0 warnings.
- **TypeScript**: limpio (`tsc --noEmit`).
- **Checkpoint Pantalla 6 (Capacidades y tiempos, ver secciones 9/18/22)**: walkthrough manual completo en local — Login NOVARA → Intake → Productos → Procesos (Elaboración/Envasado/Codificado + etapa custom "Pesada") → Equipos (6 equipos en 4 grupos) → Capacidades: tamaño de lote 300 kg + tiempo de lote 45 min (compartidos por el proceso Elaboración), capacidad de referencia por reactor (Reactor 1 = 300 kg, Reactor 2 = 500 kg), velocidad u/h por equipo continuo (Llenadora automática 1800 u/h, Pouchera 900 u/h, Codificadora láser 2400 u/h, cada uno con el prompt "¿cambia por producto?" intacto), Balanza 1 (proceso no soportado "Pesada") con capacidad opcional sin unidad forzada y sin crash. Persistencia confirmada Volver→Equipos→Continuar (todos los valores exactos). Guardian sosteniendo la placa "NOVARA" verificado en el DOM. Navegación al step "Tiempos de tanda" confirma la corrección de unidad (antes decía "unidades", ahora "kg" correctamente). Verificado sin overflow horizontal en 1440×900 y 1366×768; overflow vertical real y mayor que en Pantallas 4/5 en el caso más denso posible (documentado como limitación explicada, no oculta, ver sección 22 — ligado a la altura fija del `Button` compartido, fuera de alcance de este checkpoint). Smoke test de producción repetido tras el deploy: Login → demo → Intake → Productos → Procesos → Equipos → Capacidades, alta de "1800 u/h" en Llenadora 1 confirmada en vivo en `https://guardian-codercup.vercel.app`.
- **Commit actual**: `f82341889cf5f9149d57d511ab897706f4b984c7` (branch `master`), commiteado y pusheado a `origin/master`.
- **Deploy actual**: verificado directamente contra la API de Vercel (no asumido) — proyecto `guardian-codercup`, deployment `dpl_ENzN9ENVWJM3viYbEAvU8oiS41jP`, commit `f82341889cf5f9149d57d511ab897706f4b984c7`, status `READY`, `target: production`, servido en `https://guardian-codercup.vercel.app`. Auto-deploy vía Git integration confirmado (push a `master` → deployment automático).
