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

## 10. Materials Intelligence

Opcional. Sin `MaterialFormulaStep` (BOM) + `InventoryItem` (stock) real para un producto, `MaterialFeasibility = "not_evaluated"` — nunca `"pass"` fabricado, nunca `"fail"` inventado. `canEvaluateMaterials()` en `evaluate-scenario.ts` exige AMBOS (BOM real Y algún inventario cargado) antes de intentar la comparación. Capacidad, tiempo, deadline y bottleneck se siguen evaluando igual, con o sin materiales.

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

## 18. Guided Setup

Dos modos, MISMO estado y motor (`src/lib/model/guided-setup-v2.ts` + `GuidedSetupScreen.tsx`):
- **NOVICE**: responde bloque por bloque — Productos → Contenido por unidad (gramos) → Flujo/Equipos → Capacidades (+ variantes por producto, progressive disclosure) → Tiempos de tanda → Personal → Horario → Materiales (opcional).
- **ADVANCED**: describe toda la operación en un párrafo; la IA extrae lo que pueda (productos, equipos, gramajes, rates por producto/equipo, personal, horario) y marca los bloques resueltos automáticamente.

"No lo sé" nunca bloquea el onboarding — ofrece una referencia cuando existe, o deja el campo como faltante explícito (nunca 0 real). La entrevista sigue compartiendo una Production Reference entre todos los productos declarados (limitación real y documentada) — `rateVariants` es la vía para que ese step compartido tenga precisión por producto/presentación/recurso sin necesitar profiles separados.

## 19. Reference Catalog

`src/data/reference-catalog.ts` + `src/lib/engine/reference-catalog.ts`. Catálogo pequeño y explícito de estimaciones editoriales (reactor, llenadora, etiquetadora, codificadora) — nunca un benchmark de industria. Tres pasos separados: REFERENCE AVAILABLE (existe en el catálogo) → USER ACCEPTS (decisión explícita de la UI) → REFERENCE IN USE (`applyAcceptedReference()`, el único camino que adjunta un valor con `source: "reference_estimate"`).

## 20. Idioma

UI 100% en español (rioplatense neutro, profesional, simple). Verificado exhaustivamente: Login, Onboarding, Guided Setup, Command Center, Constraints, Ask Guardian (+ subpantallas), Disruption, Recommended Plans, Why This Plan, labels del grafo del Twin, formateo de fechas (`dom/lun/mar/mié/jue/vie/sáb`, `ene`...`dic`).

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

## 23. Current Architecture

Basado en el código real del repo (`src/`):
- **Dominio**: `src/lib/types.ts` (tipos centrales: `OperationalModel`, `Presentation`, `RateVariant`, `ProductionReferenceStep`, `ScenarioResult`, etc.), `src/lib/model/presentation.ts` (resolución de gramaje), `src/lib/model/buildOperationalModel.ts`, `src/lib/model/buildModelInputsFromGuidedSetupV2.ts`, `src/lib/model/guided-setup-v2.ts`.
- **Motor**: `src/lib/engine/evaluate-scenario.ts` (cálculo único), `simulation-engine.ts` (generación/ranking de escenarios), `constraint-detection.ts`, `disruption.ts` + `disruption-parser.ts`, `goal-parser.ts`, `presentation-parser.ts` (gramos en texto libre), `operational-query.ts`, `shortage-engine.ts`, `reference-catalog.ts`.
- **NLU/IA**: `src/lib/nlu/types.ts` (schemas Zod), `prompt.ts`, `client.ts`, `knowledge-{types,prompt,client}.ts`; rutas server `src/app/api/nlu/route.ts` y `src/app/api/ask-guardian-knowledge/route.ts`.
- **View models**: `src/lib/view/*.ts` — traducen resultados del motor a lo que la UI pinta, cero cálculo propio.
- **UI**: `src/components/{login,onboarding,upload,guided-setup,model,command-center,constraint,ask-guardian,shell,guardian,ui}/`.
- **Datos demo**: `src/data/production-profiles.ts`, `operations-reference.ts`, `reference-catalog.ts`; generador `scripts/generate-demo-data.mjs` → `public/demo/*.xlsx`.

## 24. Current Functional State

**GUARDIAN V1 — FUNCTIONAL FREEZE: READY.** Todo lo listado en las secciones 6-19 está implementado y verificado (tests + build + lint + walkthrough manual). Production References por producto/presentación/recurso (sección 9) es el último gap funcional cerrado en este checkpoint.

## 25. Known Limitations

- Guided Setup V2 comparte una Production Reference entre todos los productos declarados (mitigado por `rateVariants`, no eliminado — Import Data/Excel sigue siendo el camino para profiles totalmente independientes por producto).
- `operational-query.ts` responde "cuál es mi cuello de botella" de forma agregada (proceso más frecuente entre pedidos con restricción de deadline), no por pedido puntual.
- No hay benchmark automatizado de calidad de las respuestas de conocimiento cosmético (son no determinísticas).
- `PlanCardView`/`BaselineCard` colapsan visualmente `MaterialFeasibility: "fail"` y `"not_evaluated"` en el mismo label "Faltan" — la distinción real sigue existiendo en los datos (`ScenarioResult.materialsFeasible`), no en ese componente puntual.
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
- Una consulta de conocimiento cosmético nunca modifica el Operational Twin.
- UI 100% en español.
- GUARDIAN V1 es exclusivamente para laboratorios cosméticos.

## 27. Out of Scope

ERP/MRP/LIMS/GMP suite completos. Trazabilidad regulatoria. Formulador profesional. Compras/contabilidad/mantenimiento industrial. Multi-planta. Múltiples industrias (rubro fijo = cosmética). Ausentismo/mantenimiento predictivo/IoT como disrupciones (solo Machine Unavailable). Deploy (explícitamente fuera de alcance de cualquier checkpoint hasta que se pida).

## 28. Testing Strategy

Vitest, 360 tests en 30 archivos, todos deterministas (sin red — ningún test llama a Gemini real). Cobertura por capa: dominio (`presentation.test.ts`), motor (`evaluate-scenario.test.ts` incluye `resolveEffectiveRate` con los 4 niveles de especificidad + el caso crítico anti-escalado), Guided Setup (`guided-setup-v2.test.ts`, `buildModelInputsFromGuidedSetupV2.test.ts` con casos end-to-end de rates por producto), NLU (`presentation-parser.test.ts`, `fixtures.test.ts`), Ask Guardian (`operational-query.test.ts`). Antes de cerrar cualquier checkpoint: `npx tsc --noEmit` + `npx vitest run` + `npm run lint` + `npm run build`, los 4 en verde, más un walkthrough manual real de los flujos afectados (Browser pane, nunca asumido).

## 29. Deployment

Existe el proyecto Vercel `guardian-codercup`, conectado al repo `SANTIAGOZUNICH/guardian-codercup`. Branch productiva: `master`. Source: Git integration de Vercel (auto-deploy) — no requiere `vercel.json` en el repo para desplegar (Vercel autodetecta Next.js). Todo push a `master` dispara un deployment de producción automático, sin acción manual.

URL de producción: `https://guardian-codercup.vercel.app`.

Último estado verificado (ver sección 32): commit `2ce1de35fcfbbd76260e2775a60e24365789fdad`, deployment `dpl_5bcpEr1u9KsAeaUWn1BNjd5TQujD`, status `READY`.

Localmente se sigue pudiendo correr con `npm run dev` (desarrollo) o `npm run build` + `npm run start` (producción local). `GUARDIAN_API_KEY` vive en `.env.local` (gitignored, nunca commiteado) — en Vercel debe estar configurada como variable de entorno del proyecto por separado (no verificado en este checkpoint; si el conocimiento cosmético o el NLU fallan en producción, revisar ahí primero).

## 30. Roadmap

- **DONE**: Modelo de dominio (gramos/presentaciones), Motor (masa/batches/rates incluyendo precisión por producto-presentación-recurso), Guided Setup (bloques + progressive disclosure + modo avanzado), Ask Guardian (4 categorías de routing), Idioma (100% español), Branding (sin Genus visible), Production References por producto/presentación — **GUARDIAN V1 FUNCTIONAL FREEZE**. Visual Polish — Login/First Impression (ver sección 22): rediseño completo de `LoginScreen.tsx`, único checkpoint visual cerrado hasta ahora.
- **NEXT**: Visual Polish / Demo Experience para el resto de las pantallas — Guided Setup, Review, Building Twin, Command Center, Simulación, Disruption. Extender la dirección visual establecida en Login (sección 22), no redefinirla.
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

- **Fecha**: 2026-08-18.
- **Tests**: 360 verdes, 30 archivos, 0 fallos.
- **Build**: verde (`next build`, incluye `/api/nlu` y `/api/ask-guardian-knowledge`).
- **Lint**: verde, 0 errores, 0 warnings.
- **TypeScript**: limpio (`tsc --noEmit`).
- **Walkthrough manual**: Guided Setup modo avanzado (NLU de rates por equipo/producto en un solo mensaje) → Capacidades con variantes visibles y editables → Twin construido → Ask Guardian con dos productos de la misma máquina usando cada uno su rate correcto (Shampoo: Llenadora 1 @1800u/h + Llenadora 2 @1500u/h combinadas y por separado; Crema: solo Llenadora 1 @1000u/h, Llenadora 2 correctamente excluida por no tener rate conocido) — verificado en browser real, no asumido.
- **Checkpoint Login/First Impression (ver sección 22)**: verificado por geometría/estilos computados vía JS en 1440×900 y 1366×768 (sin overflow horizontal, columnas sin superposición, gradiente del CTA correcto, contenido en español completo) y smoke test de contenido en producción — sin captura de pantalla píxel a pixel porque el Browser pane no estaba visible en esta sesión (`the Browser pane is not displayed, so the page is not compositing frames`), limitación del entorno de testing, no del código.
- **Commit actual**: `aead6049ffaa8b9449e0d7b36ef370d2a7dc1f20` (branch `master`), commiteado y pusheado a `origin/master`.
- **Deploy actual**: verificado directamente contra la API de Vercel (no asumido) — proyecto `guardian-codercup`, deployment `dpl_EBofnfE4R7ymN6kivaTo1XQFAGEj`, commit `aead6049ffaa8b9449e0d7b36ef370d2a7dc1f20`, status `READY`, `target: production`, servido en `https://guardian-codercup.vercel.app`. Auto-deploy vía Git integration confirmado (push a `master` → deployment automático).
