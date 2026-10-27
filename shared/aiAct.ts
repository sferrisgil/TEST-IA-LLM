/**
 * Evaluación específica del uso de IA:
 *  1. Cumplimiento del Reglamento europeo de IA (Reglamento (UE) 2024/1689, "RIA").
 *  2. Complejidad de la tarea que debe hacer la IA.
 *  3. Selección del modelo adecuado entre los disponibles en el Ayuntamiento.
 *
 * Igual que el resto de reglas, es determinista y la decide el Ayuntamiento.
 */

// --- Cuestionario --------------------------------------------------------------

export type AiTask =
  | "resumir"
  | "redactar"
  | "simplificar"
  | "traducir"
  | "clasificar"
  | "extraer"
  | "preguntas_documentos"
  | "conversar"
  | "analizar_datos"
  | "recomendar";

export type AiDomain =
  | "prestaciones"
  | "empleo"
  | "educacion"
  | "policia"
  | "migracion"
  | "justicia"
  | "emergencias"
  | "infraestructuras"
  | "biometria";

export type ProhibitedPractice = "manipulacion" | "emociones" | "categorizacion_biometrica" | "prediccion_delitos" | "reconocimiento_facial";

export interface AiAnswers {
  tasks: AiTask[];
  domains: AiDomain[];
  prohibited: ProhibitedPractice[];
  /** ¿Con quién conversa o interactúa la IA directamente? */
  interaction: "ninguna" | "empleados" | "ciudadania";
  /** ¿Sus textos se publican o envían a la ciudadanía? */
  publishes: "no" | "con_revision" | "sin_revision";
  /** Supervisión humana de los resultados. */
  oversight: "siempre" | "muestreo" | "ninguna";
  inputSize: "corto" | "medio" | "largo";
  reasoning: "sencillo" | "medio" | "complejo";
  errorImpact: "bajo" | "medio" | "alto";
  languages: "es" | "cooficiales" | "otros";
  volume: "bajo" | "medio" | "alto";
  /** Necesita apoyarse en documentos propios (ordenanzas, procedimientos…). */
  referenceDocs: boolean;
}

export function emptyAiAnswers(): AiAnswers {
  return {
    tasks: [],
    domains: [],
    prohibited: [],
    interaction: "ninguna",
    publishes: "no",
    oversight: "siempre",
    inputSize: "corto",
    reasoning: "sencillo",
    errorImpact: "bajo",
    languages: "es",
    volume: "bajo",
    referenceDocs: false,
  };
}

export const AI_TASKS: { id: AiTask; label: string; help: string; level: 1 | 2 | 3 }[] = [
  { id: "resumir", label: "Resumir textos", help: "Escritos, informes, actas", level: 2 },
  { id: "redactar", label: "Redactar borradores", help: "Respuestas, comunicaciones, informes", level: 2 },
  { id: "simplificar", label: "Pasar a lenguaje claro", help: "Hacer comprensible un texto administrativo", level: 1 },
  { id: "traducir", label: "Traducir", help: "Entre castellano, lenguas cooficiales u otras", level: 1 },
  { id: "clasificar", label: "Clasificar o etiquetar", help: "Asignar tipo, área o prioridad a solicitudes", level: 1 },
  { id: "extraer", label: "Extraer datos de documentos", help: "Fechas, importes, referencias de un escrito", level: 1 },
  { id: "preguntas_documentos", label: "Responder preguntas sobre documentos", help: "Consultas sobre ordenanzas, procedimientos…", level: 2 },
  { id: "conversar", label: "Conversar (asistente o chatbot)", help: "Atender preguntas en un chat", level: 2 },
  { id: "analizar_datos", label: "Analizar datos o tablas", help: "Detectar tendencias, comparar cifras", level: 3 },
  { id: "recomendar", label: "Proponer decisiones sobre personas o expedientes", help: "Sugerir conceder, denegar, priorizar…", level: 3 },
];

/** Ámbitos de alto riesgo del Anexo III del RIA relevantes para un Ayuntamiento. */
export const AI_DOMAINS: { id: AiDomain; label: string; ref: string }[] = [
  { id: "prestaciones", label: "Ayudas, prestaciones o servicios públicos esenciales (acceso, concesión, revocación)", ref: "Anexo III.5.a" },
  { id: "empleo", label: "Personal: selección, contratación, evaluación, promoción o asignación de tareas", ref: "Anexo III.4" },
  { id: "educacion", label: "Educación: admisión, evaluación o vigilancia del alumnado", ref: "Anexo III.3" },
  { id: "policia", label: "Policía local: evaluación de personas, pruebas, investigación", ref: "Anexo III.6" },
  { id: "migracion", label: "Extranjería, asilo o control de fronteras", ref: "Anexo III.7" },
  { id: "justicia", label: "Procedimientos sancionadores, judiciales o resolución de conflictos", ref: "Anexo III.8" },
  { id: "emergencias", label: "Priorizar llamadas o servicios de emergencia (bomberos, sanitarios, policía)", ref: "Anexo III.5.d" },
  { id: "infraestructuras", label: "Control de tráfico, agua, gas, electricidad o calefacción", ref: "Anexo III.2" },
  { id: "biometria", label: "Identificación o verificación biométrica (cara, huella, voz)", ref: "Anexo III.1" },
];

export const PROHIBITED_PRACTICES: { id: ProhibitedPractice; label: string; ref: string }[] = [
  { id: "manipulacion", label: "Influir en el comportamiento de personas con técnicas engañosas o aprovechando su vulnerabilidad (edad, discapacidad, situación económica)", ref: "Art. 5.1.a-b" },
  { id: "emociones", label: "Deducir emociones de empleados/as o alumnado", ref: "Art. 5.1.f" },
  { id: "categorizacion_biometrica", label: "Deducir ideología, religión, orientación sexual, raza o afiliación a partir de datos biométricos", ref: "Art. 5.1.g" },
  { id: "prediccion_delitos", label: "Predecir si una persona cometerá una infracción a partir de su perfil", ref: "Art. 5.1.d" },
  { id: "reconocimiento_facial", label: "Crear bases de datos faciales recopilando imágenes de internet o cámaras", ref: "Art. 5.1.e" },
];

export const AI_OPTIONS = {
  interaction: [
    { id: "ninguna", label: "No conversa con nadie", help: "Procesa textos en segundo plano" },
    { id: "empleados", label: "Con empleados/as", help: "Asistente interno" },
    { id: "ciudadania", label: "Con la ciudadanía o contratas", help: "Chat o asistente de atención" },
  ],
  publishes: [
    { id: "no", label: "No", help: "Uso interno" },
    { id: "con_revision", label: "Sí, tras revisarlos una persona", help: "Una persona edita y firma" },
    { id: "sin_revision", label: "Sí, directamente", help: "Sin revisión humana" },
  ],
  oversight: [
    { id: "siempre", label: "Una persona revisa siempre el resultado", help: "Antes de usarlo o enviarlo" },
    { id: "muestreo", label: "Se revisa de vez en cuando", help: "Controles por muestreo" },
    { id: "ninguna", label: "Se usa directamente", help: "Sin revisión humana" },
  ],
  inputSize: [
    { id: "corto", label: "Corto", help: "Hasta 2 páginas por consulta" },
    { id: "medio", label: "Medio", help: "Hasta unas 30 páginas" },
    { id: "largo", label: "Largo", help: "Documentos extensos o muchos a la vez" },
  ],
  reasoning: [
    { id: "sencillo", label: "Sencilla", help: "Reformular, extraer, etiquetar con categorías claras" },
    { id: "medio", label: "Media", help: "Resumir, redactar, clasificar con criterios" },
    { id: "complejo", label: "Compleja", help: "Análisis jurídico o técnico, varios pasos, comparar normativa" },
  ],
  errorImpact: [
    { id: "bajo", label: "Bajo", help: "Fácil de detectar y corregir" },
    { id: "medio", label: "Medio", help: "Puede causar retrasos o molestias" },
    { id: "alto", label: "Alto", help: "Puede perjudicar derechos o causar daños" },
  ],
  languages: [
    { id: "es", label: "Castellano" },
    { id: "cooficiales", label: "Castellano y lenguas cooficiales" },
    { id: "otros", label: "Otros idiomas" },
  ],
  volume: [
    { id: "bajo", label: "Pocas al día (menos de 50)" },
    { id: "medio", label: "Cientos al día" },
    { id: "alto", label: "Miles al día" },
  ],
} as const;

// --- Catálogo de modelos ---------------------------------------------------------

export type Capability = 1 | 2 | 3;

export interface ModelInfo {
  id: string;
  name: string;
  /** Dónde se procesan los datos. */
  hosting: "local" | "ue" | "fuera_ue";
  capability: Capability;
  /** Contexto máximo aproximado en tokens (≈ 0,75 palabras por token). */
  contextTokens: number;
  languages: ("es" | "cooficiales" | "otros")[];
  /** Hay contrato de encargo de tratamiento que permite enviar datos personales. */
  personalData: boolean;
  /** Coste relativo: 1 bajo, 3 alto. */
  cost: 1 | 2 | 3;
  available: boolean;
  notes?: string;
}

/**
 * Catálogo por defecto. TI debe sustituirlo por el real (variable
 * MODELS_FILE) con los modelos contratados o desplegados y sus condiciones.
 */
export const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: "local-basico",
    name: "Modelo local pequeño (servidor municipal)",
    hosting: "local",
    capability: 1,
    contextTokens: 8_000,
    languages: ["es", "cooficiales"],
    personalData: true,
    cost: 1,
    available: false,
    notes: "Ejemplo: modelo abierto de 7-12B en un servidor propio. Activar cuando TI lo despliegue.",
  },
  {
    id: "rapido",
    name: "Modelo rápido en la nube",
    hosting: "ue",
    capability: 2,
    contextTokens: 128_000,
    languages: ["es", "cooficiales", "otros"],
    personalData: false,
    cost: 1,
    available: true,
    notes: "Ajustar región de proceso y contrato reales.",
  },
  {
    id: "avanzado",
    name: "Modelo avanzado en la nube",
    hosting: "ue",
    capability: 3,
    contextTokens: 1_000_000,
    languages: ["es", "cooficiales", "otros"],
    personalData: false,
    cost: 3,
    available: true,
    notes: "Ajustar región de proceso y contrato reales.",
  },
];

export const CAPABILITY_LABEL: Record<Capability, string> = { 1: "básica", 2: "intermedia", 3: "avanzada" };
const CONTEXT_NEED: Record<AiAnswers["inputSize"], number> = { corto: 4_000, medio: 32_000, largo: 200_000 };
/** Caracteres máximos por consulta que admite un modelo (dejando margen para la respuesta). */
export const maxInputChars = (m: ModelInfo) => Math.floor(m.contextTokens * 0.6 * 3.5);

// --- Evaluación --------------------------------------------------------------

export type AiActCategory = "prohibida" | "alto_riesgo" | "revisar_art6" | "transparencia" | "riesgo_minimo";

export const AI_ACT_LABEL: Record<AiActCategory, string> = {
  prohibida: "Práctica prohibida (art. 5 RIA)",
  alto_riesgo: "Sistema de alto riesgo (art. 6 y Anexo III RIA)",
  revisar_art6: "Posible alto riesgo: requiere análisis (art. 6.3 RIA)",
  transparencia: "Riesgo limitado: obligaciones de transparencia (art. 50 RIA)",
  riesgo_minimo: "Riesgo mínimo",
};

export interface ModelFit {
  model: ModelInfo;
  suitable: boolean;
  reasons: string[];
}

export interface AiAssessment {
  category: AiActCategory;
  reasons: string[];
  obligations: string[];
  complexity: Capability;
  complexityFactors: string[];
  requirements: { capability: Capability; contextTokens: number; personalData: boolean; languages: AiAnswers["languages"] };
  recommended: ModelInfo | null;
  options: ModelFit[];
  warnings: string[];
  /** Exigencias para la app generada. */
  disclosure: boolean;
  humanReview: boolean;
}

export interface AiContext {
  appKind: "aplicacion" | "automatizacion";
  personalData: boolean;
  sendsPersonalData: boolean;
  decisions: "informativa" | "apoyo" | "automatica" | "perfilado";
}

const REASONING_LEVEL: Record<AiAnswers["reasoning"], Capability> = { sencillo: 1, medio: 2, complejo: 3 };

export function assessAi(ai: AiAnswers, ctx: AiContext, models: ModelInfo[] = DEFAULT_MODELS): AiAssessment {
  const reasons: string[] = [];
  const obligations: string[] = [];
  const warnings: string[] = [];
  const affectsPeople = ctx.decisions !== "informativa" || ai.tasks.includes("recomendar");

  // --- 1. Clasificación según el RIA ----------------------------------------
  let category: AiActCategory = "riesgo_minimo";
  if (ai.prohibited.length > 0 || ctx.decisions === "perfilado") {
    category = "prohibida";
    for (const p of ai.prohibited) {
      const info = PROHIBITED_PRACTICES.find((x) => x.id === p)!;
      reasons.push(`${info.ref}: ${info.label.toLowerCase()}.`);
    }
    if (ctx.decisions === "perfilado") reasons.push("Art. 5.1.c: puntuación social de personas.");
  } else if (ai.domains.length > 0) {
    const domains = ai.domains.map((d) => AI_DOMAINS.find((x) => x.id === d)!);
    if (affectsPeople || ai.domains.includes("biometria")) {
      category = "alto_riesgo";
      reasons.push(`Interviene en ámbitos de alto riesgo: ${domains.map((d) => `${d.label.toLowerCase()} (${d.ref})`).join("; ")}.`);
    } else {
      category = "revisar_art6";
      reasons.push(
        `Se usa en ámbitos de alto riesgo (${domains.map((d) => d.ref).join(", ")}), pero declaras que no influye en decisiones sobre personas. Puede acogerse a la excepción del art. 6.3 si solo hace tareas preparatorias o de apoyo, y hay que documentarlo.`,
      );
    }
  } else if (ai.interaction !== "ninguna" || ai.publishes !== "no") {
    category = "transparencia";
    if (ai.interaction !== "ninguna") reasons.push("Las personas interactúan directamente con la IA (art. 50.1).");
    if (ai.publishes !== "no") reasons.push("Genera textos que se publican o envían a la ciudadanía (art. 50.4).");
  } else {
    reasons.push("Uso interno de apoyo, sin ámbitos de alto riesgo ni interacción directa con la ciudadanía.");
  }

  // --- 2. Obligaciones ------------------------------------------------------------
  obligations.push("Alfabetización en IA: quienes usen la app deben conocer sus capacidades y límites (art. 4 RIA).");
  if (ai.interaction !== "ninguna") obligations.push("Informar claramente de que se está interactuando con una IA (art. 50.1 RIA).");
  if (ai.publishes === "sin_revision") obligations.push("Indicar que el texto ha sido generado por IA, o someterlo a revisión humana con responsabilidad editorial (art. 50.4 RIA).");
  if (category === "alto_riesgo") {
    obligations.push("Evaluación de impacto en los derechos fundamentales antes de su uso (art. 27 RIA), además de la EIPD (art. 35 RGPD).");
    obligations.push("Supervisión humana por personas formadas y con autoridad para no seguir el resultado (arts. 14 y 26 RIA).");
    obligations.push("Conservar los registros de funcionamiento al menos 6 meses e informar a la representación de los trabajadores si les afecta (art. 26 RIA).");
    obligations.push("Registro en la base de datos de la UE como responsable del despliegue público (art. 49 RIA).");
    obligations.push("Derecho de las personas afectadas a una explicación de la decisión (art. 86 RIA).");
    obligations.push("Si el Ayuntamiento desarrolla el sistema, pasa a ser «proveedor» con obligaciones de conformidad (arts. 16 y 25 RIA): requiere un proyecto de TI, no autoservicio.");
  }
  if (category === "revisar_art6") obligations.push("Documentar por qué no es de alto riesgo (art. 6.4 RIA) y validarlo con TI y el DPD.");

  // --- 3. Complejidad ----------------------------------------------------------------
  const complexityFactors: string[] = [];
  const taskLevel = Math.max(1, ...ai.tasks.map((t) => AI_TASKS.find((x) => x.id === t)!.level)) as Capability;
  let complexity = Math.max(taskLevel, REASONING_LEVEL[ai.reasoning]) as Capability;
  complexityFactors.push(`Tareas: nivel ${CAPABILITY_LABEL[taskLevel]}.`);
  complexityFactors.push(`Razonamiento: ${ai.reasoning === "sencillo" ? "sencillo" : ai.reasoning === "medio" ? "medio" : "complejo"}.`);
  if (ai.errorImpact === "alto" && complexity < 3) {
    complexity = (complexity + 1) as Capability;
    complexityFactors.push("El impacto de un error es alto: se exige un modelo más capaz.");
  }
  if (ai.inputSize !== "corto") complexityFactors.push(`Textos de entrada ${ai.inputSize === "medio" ? "medianos" : "largos"}: hace falta un modelo con más contexto.`);
  if (ai.languages !== "es") complexityFactors.push(ai.languages === "cooficiales" ? "Debe manejar lenguas cooficiales." : "Debe manejar otros idiomas.");

  const requirements = {
    capability: complexity,
    contextTokens: CONTEXT_NEED[ai.inputSize],
    personalData: ctx.sendsPersonalData,
    languages: ai.languages,
  };

  // --- 4. Selección de modelo -------------------------------------------------------
  const options: ModelFit[] = models.map((m) => {
    const why: string[] = [];
    if (!m.available) why.push("No está disponible todavía.");
    if (m.capability < requirements.capability) why.push(`Capacidad ${CAPABILITY_LABEL[m.capability]}; la tarea requiere ${CAPABILITY_LABEL[requirements.capability]}.`);
    if (m.contextTokens < requirements.contextTokens) why.push("No admite textos tan largos.");
    if (requirements.personalData && !m.personalData) why.push("No está autorizado para recibir datos personales (sin contrato de encargo).");
    if (requirements.personalData && m.hosting === "fuera_ue") why.push("Procesa los datos fuera de la UE.");
    if (!m.languages.includes(requirements.languages)) why.push("No cubre los idiomas necesarios.");
    return { model: m, suitable: why.length === 0, reasons: why.length ? why : ["Cumple todos los requisitos."] };
  });
  const suitable = options
    .filter((o) => o.suitable)
    .map((o) => o.model)
    // El más barato que cumple; a igual coste, el de datos en local y luego el más capaz.
    .sort((a, b) => a.cost - b.cost || Number(b.hosting === "local") - Number(a.hosting === "local") || b.capability - a.capability);
  const recommended = suitable[0] || null;

  // --- 5. Avisos de viabilidad --------------------------------------------------------
  if (!recommended) warnings.push("Ningún modelo disponible cumple los requisitos. Simplifica la tarea, reduce el tamaño de los textos o consulta a TI.");
  if (ai.tasks.includes("analizar_datos")) warnings.push("Los modelos de lenguaje se equivocan con facilidad en cálculos: haz los cálculos en la propia app y usa la IA solo para explicarlos.");
  if (ai.tasks.includes("preguntas_documentos") || ai.referenceDocs) {
    warnings.push("La IA no conoce las ordenanzas ni los procedimientos municipales: la app deberá enviarle en cada consulta los fragmentos de documento necesarios, y las respuestas deben citar la fuente.");
  }
  if (ai.errorImpact === "alto" && ai.oversight !== "siempre") warnings.push("Con impacto de error alto, una persona debe revisar siempre el resultado.");
  if (ctx.appKind === "automatizacion" && ai.oversight === "ninguna") {
    warnings.push("Una automatización sin revisión humana solo es aceptable para tareas sin efectos sobre personas y fáciles de corregir.");
  }
  if (ai.volume === "alto") warnings.push("Miles de consultas al día: TI debe validar el coste y la capacidad antes de publicar.");

  return {
    category,
    reasons,
    obligations,
    complexity,
    complexityFactors,
    requirements,
    recommended,
    options,
    warnings,
    disclosure: ai.interaction !== "ninguna" || ai.publishes === "sin_revision",
    humanReview: ai.oversight !== "ninguna" || affectsPeople || ai.errorImpact !== "bajo",
  };
}

const pick = <T extends string>(v: unknown, list: readonly { id: T }[], fallback: T): T =>
  list.some((x) => x.id === v) ? (v as T) : fallback;
const pickMany = <T extends string>(v: unknown, list: readonly { id: T }[]): T[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is T => list.some((o) => o.id === x)))] : [];

export function sanitizeAiAnswers(input: unknown): AiAnswers {
  const a = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const base = emptyAiAnswers();
  return {
    tasks: pickMany(a.tasks, AI_TASKS),
    domains: pickMany(a.domains, AI_DOMAINS),
    prohibited: pickMany(a.prohibited, PROHIBITED_PRACTICES),
    interaction: pick(a.interaction, AI_OPTIONS.interaction, base.interaction),
    publishes: pick(a.publishes, AI_OPTIONS.publishes, base.publishes),
    oversight: pick(a.oversight, AI_OPTIONS.oversight, base.oversight),
    inputSize: pick(a.inputSize, AI_OPTIONS.inputSize, base.inputSize),
    reasoning: pick(a.reasoning, AI_OPTIONS.reasoning, base.reasoning),
    errorImpact: pick(a.errorImpact, AI_OPTIONS.errorImpact, base.errorImpact),
    languages: pick(a.languages, AI_OPTIONS.languages, base.languages),
    volume: pick(a.volume, AI_OPTIONS.volume, base.volume),
    referenceDocs: a.referenceDocs === true,
  };
}

/** Valida un catálogo de modelos cargado de configuración. */
export function sanitizeModels(input: unknown): ModelInfo[] {
  if (!Array.isArray(input)) throw new Error("El catálogo de modelos debe ser una lista.");
  return input.map((m, i) => {
    const x = m as Record<string, unknown>;
    if (typeof x.id !== "string" || !/^[a-z0-9._-]{1,60}$/i.test(x.id)) throw new Error(`Modelo ${i}: id no válido`);
    const cap = Number(x.capability);
    const cost = Number(x.cost);
    return {
      id: x.id,
      name: String(x.name || x.id),
      hosting: (["local", "ue", "fuera_ue"].includes(x.hosting as string) ? x.hosting : "fuera_ue") as ModelInfo["hosting"],
      capability: (cap >= 1 && cap <= 3 ? Math.round(cap) : 1) as Capability,
      contextTokens: Math.max(1000, Number(x.contextTokens) || 8000),
      languages: (Array.isArray(x.languages) ? x.languages : ["es"]).filter((l: unknown) => ["es", "cooficiales", "otros"].includes(l as string)) as ModelInfo["languages"],
      personalData: x.personalData === true,
      cost: (cost >= 1 && cost <= 3 ? Math.round(cost) : 2) as 1 | 2 | 3,
      available: x.available !== false,
      notes: typeof x.notes === "string" ? x.notes : undefined,
    };
  });
}
