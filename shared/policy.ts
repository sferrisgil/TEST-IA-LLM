/**
 * Política de uso y motor de evaluación de riesgos.
 *
 * Este fichero es la "fuente de verdad" de las reglas. Las decide el
 * Ayuntamiento (TI + Delegado de Protección de Datos), no la IA: la evaluación
 * es determinista y se recalcula siempre en el servidor.
 *
 * La parte específica de IA (Reglamento de IA, complejidad y modelo) está en
 * aiAct.ts y se integra aquí.
 *
 * Marco de referencia: RGPD (arts. 5, 6, 9, 10, 22, 25, 30, 35), LOPDGDD,
 * Esquema Nacional de Seguridad (RD 311/2022) y Reglamento europeo de IA
 * (Reglamento (UE) 2024/1689).
 */

import { assessAi, DEFAULT_MODELS, emptyAiAnswers, maxInputChars, sanitizeAiAnswers, type AiAnswers, type AiAssessment, type ModelInfo } from "./aiAct";

export type DataCategory =
  | "ninguno"
  | "publicos"
  | "internos"
  | "identificativos"
  | "contacto"
  | "economicos"
  | "especiales"
  | "penales"
  | "menores"
  | "vulnerables"
  | "credenciales";

export type Audience = "personal" | "equipo" | "departamento" | "plantilla" | "externos" | "publico";
export type Origin = "propios" | "sistemas" | "ciudadanos" | "terceros" | "abiertos";
export type Volume = "pocos" | "medio" | "masivo";
export type Storage = "ninguno" | "navegador" | "base_datos" | "nube_externa";
/** Con base de datos: ¿todos los usuarios comparten los registros o cada uno ve los suyos? */
export type DbScope = "compartida" | "personal";
export type AiUse = "no" | "sin_datos" | "con_datos";
export type Decisions = "informativa" | "apoyo" | "automatica" | "perfilado";
export type Integrations = "ninguna" | "lectura" | "escritura";
export type Retention = "sesion" | "limitada" | "indefinida";

export type AppKind = "aplicacion" | "automatizacion";

export interface Answers {
  appKind: AppKind;
  appName: string;
  owner: string;
  department: string;
  purpose: string;
  description: string;
  data: DataCategory[];
  origin: Origin[];
  volume: Volume;
  audience: Audience;
  storage: Storage;
  dbScope: DbScope;
  aiUse: AiUse;
  decisions: Decisions;
  integrations: Integrations;
  retention: Retention;
  /** Días de conservación cuando la retención es limitada. */
  retentionDays: number;
  /** Hallazgos del analizador local de ejemplos (solo tipos, nunca valores). */
  detectedCategories: DataCategory[];
  /** Cuestionario de IA (solo aplica si aiUse !== "no"). */
  ai: AiAnswers;
}

export type RiskLevel = "bajo" | "medio" | "alto" | "no_permitido";

export interface GenerationConstraints {
  /** La app no puede comunicarse con ningún servidor externo. */
  network: "ninguna";
  /** Dónde puede guardar datos la app generada. */
  storage: "ninguno" | "sesion" | "local" | "bd";
  /** Solo con "bd": registros compartidos entre usuarios o por persona. */
  dbScope: DbScope;
  /** Solo con "bd": días tras los que se borran los registros (null = sin límite). */
  retentionDays: number | null;
  /** Si la app puede usar el asistente de IA municipal (con enmascarado). */
  ai: boolean;
  /** Solo se permite trabajar con datos ficticios (prototipo). */
  syntheticDataOnly: boolean;
  /** Requisitos de accesibilidad reforzados (RD 1112/2018) para apps públicas. */
  accessibility: boolean;
  /** Debe mostrar un aviso de privacidad / cláusula informativa. */
  privacyNotice: boolean;
  /** Debe incluir un botón para borrar todos los datos guardados. */
  deleteButton: boolean;
  /** Modelo de IA asignado (id del catálogo) o null. */
  aiModel: string | null;
  /** Caracteres máximos por consulta a la IA. */
  aiMaxInputChars: number;
  /** Debe indicar que se interactúa con una IA / que el texto es generado (art. 50 RIA). */
  aiDisclosure: boolean;
  /** Los resultados de la IA se presentan como borrador que una persona confirma. */
  aiHumanReview: boolean;
}

export interface Assessment {
  level: RiskLevel;
  score: number;
  ensCategory: "básica" | "media" | "alta";
  reasons: string[];
  controls: string[];
  obligations: string[];
  constraints: GenerationConstraints;
  personalData: boolean;
  /** Categorías detectadas en los ejemplos que el usuario no marcó. */
  undeclared: DataCategory[];
  /** Evaluación de IA (Reglamento de IA, complejidad, modelo) o null si no usa IA. */
  ai: AiAssessment | null;
}

export const DATA_CATEGORIES: {
  id: DataCategory;
  label: string;
  help: string;
  examples: string;
  personal: boolean;
  weight: number;
}[] = [
  { id: "ninguno", label: "No usa datos", help: "Calculadoras, guías, conversores…", examples: "Calcular plazos, convertir unidades", personal: false, weight: 0 },
  { id: "publicos", label: "Información pública", help: "Ya publicada o que puede publicarse", examples: "Horarios, ordenanzas, datos abiertos, BOP", personal: false, weight: 0 },
  { id: "internos", label: "Información interna (no personal)", help: "Documentos de trabajo, presupuestos, inventarios", examples: "Inventario de material, borradores, expedientes sin nombres", personal: false, weight: 1 },
  { id: "identificativos", label: "Datos que identifican a personas", help: "Cualquier dato que permita saber quién es alguien", examples: "Nombre y apellidos, DNI/NIE, matrícula, fecha de nacimiento, firma, foto", personal: true, weight: 2 },
  { id: "contacto", label: "Datos de contacto", help: "Formas de localizar a una persona", examples: "Teléfono, correo, dirección postal", personal: true, weight: 2 },
  { id: "economicos", label: "Datos económicos o laborales", help: "Situación financiera o laboral de personas", examples: "IBAN, nóminas, deudas, embargos, tributos de un vecino", personal: true, weight: 3 },
  { id: "especiales", label: "Categorías especiales", help: "Protección reforzada (art. 9 RGPD)", examples: "Salud, discapacidad, bajas médicas, afiliación sindical, religión, origen étnico, biometría", personal: true, weight: 5 },
  { id: "penales", label: "Infracciones o datos penales", help: "Protección reforzada (art. 10 RGPD)", examples: "Antecedentes, denuncias, atestados, sanciones penales", personal: true, weight: 5 },
  { id: "menores", label: "Datos de menores", help: "Menores de edad", examples: "Alumnado de escuelas municipales, campamentos, ludotecas", personal: true, weight: 4 },
  { id: "vulnerables", label: "Colectivos vulnerables", help: "Personas en situación de especial protección", examples: "Servicios sociales, víctimas de violencia de género, dependencia, ayudas de emergencia", personal: true, weight: 5 },
  { id: "credenciales", label: "Contraseñas o claves", help: "Accesos a sistemas", examples: "Usuarios y contraseñas, certificados, claves de API", personal: false, weight: 10 },
];

export const AUDIENCES: { id: Audience; label: string; help: string; weight: number }[] = [
  { id: "personal", label: "Solo yo", help: "Una herramienta personal en mi puesto", weight: 0 },
  { id: "equipo", label: "Mi equipo (menos de 10 personas)", help: "Compañeros/as de mi unidad", weight: 1 },
  { id: "departamento", label: "Todo mi departamento o área", help: "Varias unidades de un mismo servicio", weight: 2 },
  { id: "plantilla", label: "Toda la plantilla municipal", help: "Cualquier empleado/a del Ayuntamiento", weight: 3 },
  { id: "externos", label: "Plantilla y empresas contratistas", help: "Contratas con acceso al Ayuntamiento por VPN", weight: 3 },
  { id: "publico", label: "Ciudadanía en general", help: "Desde internet (fase futura: de momento solo se publica en la intranet)", weight: 4 },
];

export const ORIGINS: { id: Origin; label: string }[] = [
  { id: "propios", label: "Los escribo yo mismo/a" },
  { id: "sistemas", label: "Los saco de aplicaciones municipales (padrón, registro, nóminas…)" },
  { id: "ciudadanos", label: "Los introducen vecinos/as o empresas" },
  { id: "terceros", label: "Ficheros que nos envían otras entidades" },
  { id: "abiertos", label: "Datos abiertos o publicados" },
];

export const VOLUMES: { id: Volume; label: string }[] = [
  { id: "pocos", label: "Pocos registros (menos de 100)" },
  { id: "medio", label: "Entre 100 y 5.000 registros" },
  { id: "masivo", label: "Más de 5.000 registros o todo un censo" },
];

export const STORAGES: { id: Storage; label: string; help: string }[] = [
  { id: "ninguno", label: "No guarda nada", help: "Al cerrar la pestaña se borra todo" },
  {
    id: "navegador",
    label: "En el navegador (como las cookies)",
    help: "Solo en el ordenador y navegador donde se usa. Sencillo, pero no se comparte, no se puede consultar desde otro equipo y se pierde si se borra el navegador",
  },
  {
    id: "base_datos",
    label: "En la base de datos municipal (SQL)",
    help: "En el servidor interno: desde cualquier equipo o navegador, compartida si se quiere, con búsquedas y copias de seguridad",
  },
  { id: "nube_externa", label: "En un servicio externo (Google Drive, Dropbox…)", help: "Fuera del control municipal" },
];

export const AI_USES: { id: AiUse; label: string; help: string }[] = [
  { id: "no", label: "No necesita IA al usarse", help: "La IA solo ayuda a construirla" },
  { id: "sin_datos", label: "Usa IA, pero sin datos de personas", help: "Redactar textos, resumir normativa…" },
  { id: "con_datos", label: "Usa IA con los datos que se introducen", help: "Resumir escritos de vecinos, clasificar solicitudes…" },
];

export const DECISIONS: { id: Decisions; label: string; help: string }[] = [
  { id: "informativa", label: "Solo informa o ayuda a organizar", help: "Consultas, listados, recordatorios" },
  { id: "apoyo", label: "Ayuda a una persona a decidir", help: "Una persona revisa siempre el resultado" },
  { id: "automatica", label: "Decide sola sobre personas", help: "Concede, deniega, prioriza o sanciona sin revisión humana" },
  { id: "perfilado", label: "Puntúa o clasifica a personas por su comportamiento", help: "Perfiles de riesgo, fiabilidad, \"puntuación ciudadana\"" },
];

export const INTEGRATIONS: { id: Integrations; label: string }[] = [
  { id: "ninguna", label: "No se conecta con nada" },
  { id: "lectura", label: "Consulta datos de otras aplicaciones" },
  { id: "escritura", label: "Modifica datos en otras aplicaciones" },
];

export const DB_SCOPES: { id: DbScope; label: string; help: string }[] = [
  { id: "compartida", label: "Compartidos", help: "Todas las personas con acceso a la app ven y editan los mismos registros (p. ej. un inventario del equipo)" },
  { id: "personal", label: "Cada persona los suyos", help: "Cada usuario solo ve los registros que ha creado (p. ej. una agenda personal)" },
];

export const RETENTIONS: { id: Retention; label: string }[] = [
  { id: "sesion", label: "Solo mientras se usa" },
  { id: "limitada", label: "Un tiempo limitado (lo necesario para el trámite)" },
  { id: "indefinida", label: "Indefinidamente" },
];

export const LEVEL_INFO: Record<RiskLevel, { label: string; summary: string }> = {
  bajo: {
    label: "Riesgo bajo",
    summary: "Puedes construirla y usarla tú mismo/a siguiendo las medidas indicadas.",
  },
  medio: {
    label: "Riesgo medio",
    summary: "Puedes construirla. Antes de compartirla, comunícala al Delegado de Protección de Datos y a TI.",
  },
  alto: {
    label: "Riesgo alto",
    summary: "Solo puedes hacer un prototipo con datos ficticios. Para usarla con datos reales hace falta la aprobación de TI y del DPD.",
  },
  no_permitido: {
    label: "No permitido en autoservicio",
    summary: "Esta combinación no puede construirse con esta herramienta. Contacta con TI y el DPD para estudiar una solución.",
  },
};

export function emptyAnswers(): Answers {
  return {
    appName: "",
    owner: "",
    department: "",
    purpose: "",
    description: "",
    data: [],
    origin: [],
    volume: "pocos",
    audience: "personal",
    storage: "ninguno",
    dbScope: "compartida",
    aiUse: "no",
    decisions: "informativa",
    integrations: "ninguna",
    retention: "sesion",
    retentionDays: 365,
    detectedCategories: [],
    appKind: "aplicacion",
    ai: emptyAiAnswers(),
  };
}

const RANK: Record<RiskLevel, number> = { bajo: 0, medio: 1, alto: 2, no_permitido: 3 };

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Limpia y valida respuestas recibidas del cliente (no confiar nunca en él). */
export function sanitizeAnswers(input: unknown): Answers {
  const a = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const base = emptyAnswers();
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const cats = DATA_CATEGORIES.map((c) => c.id);
  const arr = <T extends string>(v: unknown, allowed: readonly T[]) =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is T => allowed.includes(x as T)))] : [];
  return {
    appName: str(a.appName, 120),
    owner: str(a.owner, 120),
    department: str(a.department, 120),
    purpose: str(a.purpose, 1000),
    description: str(a.description, 6000),
    data: arr(a.data, cats),
    origin: arr(a.origin, ORIGINS.map((o) => o.id)),
    volume: oneOf(a.volume, VOLUMES.map((v) => v.id), base.volume),
    audience: oneOf(a.audience, AUDIENCES.map((v) => v.id), base.audience),
    storage: oneOf(a.storage === "servidor_municipal" ? "base_datos" : a.storage, STORAGES.map((v) => v.id), base.storage),
    dbScope: oneOf(a.dbScope, DB_SCOPES.map((v) => v.id), base.dbScope),
    aiUse: oneOf(a.aiUse, AI_USES.map((v) => v.id), base.aiUse),
    decisions: oneOf(a.decisions, DECISIONS.map((v) => v.id), base.decisions),
    integrations: oneOf(a.integrations, INTEGRATIONS.map((v) => v.id), base.integrations),
    retention: oneOf(a.retention, RETENTIONS.map((v) => v.id), base.retention),
    retentionDays: Math.min(3650, Math.max(1, Math.round(Number(a.retentionDays) || base.retentionDays))),
    detectedCategories: arr(a.detectedCategories, cats),
    appKind: a.appKind === "automatizacion" ? "automatizacion" : "aplicacion",
    ai: sanitizeAiAnswers(a.ai),
  };
}

const SENSITIVE: DataCategory[] = ["especiales", "penales", "menores", "vulnerables"];

/** Evalúa el riesgo de la aplicación descrita. Determinista y auditable. */
export function assess(answers: Answers, models: ModelInfo[] = DEFAULT_MODELS): Assessment {
  // Lo detectado en los ejemplos cuenta aunque el usuario no lo haya marcado.
  const undeclared = answers.detectedCategories.filter((c) => !answers.data.includes(c));
  const data = new Set<DataCategory>([...answers.data, ...answers.detectedCategories]);
  if (data.size > 1) data.delete("ninguno");

  const catInfo = (id: DataCategory) => DATA_CATEGORIES.find((c) => c.id === id)!;
  const personalData = [...data].some((c) => catInfo(c).personal);
  const sensitive = SENSITIVE.filter((c) => data.has(c));
  const onlyPublic = [...data].every((c) => c === "publicos" || c === "ninguno");
  const contractors = answers.audience === "externos";
  const isPublic = answers.audience === "publico";

  let level = "bajo" as RiskLevel;
  const raise = (to: RiskLevel, reason: string) => {
    if (RANK[to] > RANK[level]) level = to;
    reasons.push(reason);
  };
  const reasons: string[] = [];
  const controls: string[] = [];
  const obligations: string[] = [];

  // Puntuación orientativa (se muestra, pero el nivel lo fijan las reglas).
  const dataWeight = Math.max(0, ...[...data].map((c) => catInfo(c).weight));
  const audienceWeight = AUDIENCES.find((x) => x.id === answers.audience)!.weight;
  const score = Math.min(
    100,
    dataWeight * 8 +
      audienceWeight * 6 +
      (answers.volume === "masivo" ? 12 : answers.volume === "medio" ? 5 : 0) +
      (answers.aiUse === "con_datos" ? 10 : 0) +
      (answers.decisions === "automatica" || answers.decisions === "perfilado" ? 20 : 0) +
      (answers.integrations === "escritura" ? 10 : answers.integrations === "lectura" ? 4 : 0) +
      (answers.storage === "nube_externa" ? 15 : answers.storage === "base_datos" ? 4 : 0),
  );

  // --- Reglas que bloquean el autoservicio --------------------------------
  if (data.has("credenciales")) {
    raise("no_permitido", "Incluye contraseñas o claves de acceso. Nunca deben estar dentro de una aplicación.");
  }
  if (answers.decisions === "perfilado" && personalData) {
    raise("no_permitido", "Puntuar o clasificar a personas por su comportamiento puede ser una práctica prohibida o de alto riesgo según el Reglamento europeo de IA.");
  }
  if (answers.storage === "nube_externa" && personalData) {
    raise("no_permitido", "Guardar datos personales en servicios externos no contratados por el Ayuntamiento no está permitido.");
  }
  if (sensitive.length > 0 && isPublic) {
    raise("no_permitido", "Datos especialmente protegidos no pueden exponerse a la ciudadanía desde una app de autoservicio.");
  }
  if (sensitive.length > 0 && answers.aiUse === "con_datos") {
    raise("no_permitido", "No se permite enviar datos especialmente protegidos a un servicio de IA.");
  }

  // --- Riesgo alto: solo prototipo con datos ficticios ---------------------
  if (sensitive.length > 0) {
    raise("alto", `Trata datos especialmente protegidos (${sensitive.map((c) => catInfo(c).label.toLowerCase()).join(", ")}).`);
  }
  if (answers.decisions === "automatica" && personalData) {
    raise("alto", "Toma decisiones automáticas sobre personas: requiere intervención humana y evaluación previa (art. 22 RGPD).");
  }
  if (answers.integrations === "escritura") {
    raise("alto", "Modifica datos de otras aplicaciones municipales: debe desarrollarla o revisarla TI.");
  }
  if (answers.volume === "masivo" && personalData) {
    raise("alto", "Trata datos personales a gran escala.");
  }
  if (personalData && isPublic) {
    raise("alto", "Expone datos personales a la ciudadanía.");
  }
  if (sensitive.length > 0 && contractors) {
    raise("alto", "Datos especialmente protegidos accesibles por empresas contratistas.");
  }

  // --- Riesgo medio ---------------------------------------------------------
  if (personalData) raise("medio", "Trata datos personales: aplica el RGPD.");
  if (contractors && (personalData || data.has("internos"))) {
    raise("medio", "Accederán empresas contratistas: solo las autorizadas y con contrato que cubra este uso.");
  }
  if (data.has("internos") && isPublic) raise("medio", "Comparte información interna fuera del Ayuntamiento.");
  if (answers.audience === "publico") raise("medio", "Será usada por la ciudadanía: imagen institucional, accesibilidad y seguridad públicas.");
  if (answers.audience === "plantilla" || answers.audience === "departamento") {
    if (!onlyPublic) raise("medio", "Se compartirá con muchas personas de la organización.");
  }
  if (answers.aiUse === "con_datos") raise("medio", "Envía a la IA el contenido que se introduce (se enmascararán los datos personales).");
  if (answers.integrations === "lectura") raise("medio", "Consulta datos de otras aplicaciones municipales.");
  if (answers.decisions === "apoyo" && personalData) raise("medio", "Ayuda a tomar decisiones sobre personas: una persona debe revisar siempre el resultado.");
  if (answers.storage === "base_datos" && personalData) {
    raise("medio", "Guarda datos personales en la base de datos municipal.");
    if (answers.dbScope === "compartida" && answers.audience !== "personal") {
      raise("medio", "Los registros con datos personales serán visibles para todas las personas que usen la app.");
    }
  }
  if (answers.origin.includes("ciudadanos")) raise("medio", "Recoge datos que introducen vecinos/as o empresas.");
  if (answers.origin.includes("sistemas") && personalData) raise("medio", "Usa datos extraídos de sistemas municipales: respeta la finalidad original.");

  // --- Inteligencia artificial: Reglamento de IA, complejidad y modelo --------
  const ai =
    answers.aiUse === "no"
      ? null
      : assessAi(
          answers.ai,
          {
            appKind: answers.appKind,
            personalData,
            sendsPersonalData: answers.aiUse === "con_datos" && personalData,
            decisions: answers.decisions,
          },
          models,
        );
  if (ai) {
    if (ai.category === "prohibida") for (const r of ai.reasons) raise("no_permitido", `Reglamento de IA — práctica prohibida. ${r}`);
    if (ai.category === "alto_riesgo") for (const r of ai.reasons) raise("alto", `Reglamento de IA — alto riesgo. ${r}`);
    if (ai.category === "revisar_art6") raise("medio", `Reglamento de IA. ${ai.reasons[0]}`);
    if (ai.category === "transparencia" && (answers.ai.interaction === "ciudadania" || answers.ai.publishes === "sin_revision")) {
      raise("medio", "Reglamento de IA — la IA se dirige a la ciudadanía: obligaciones de transparencia.");
    }
    if (!ai.recommended && ai.category !== "prohibida") {
      raise("no_permitido", "Ningún modelo de IA disponible en el Ayuntamiento es adecuado para esta tarea (capacidad, tamaño de los textos, datos personales o idiomas).");
    }
    const affectsPeople = answers.decisions !== "informativa" || answers.ai.tasks.includes("recomendar");
    if (answers.ai.oversight === "ninguna" && affectsPeople) {
      raise("alto", "La IA influye en decisiones sobre personas sin revisión humana.");
    }
    if (answers.appKind === "automatizacion" && answers.ai.oversight === "ninguna" && personalData) {
      raise("alto", "Automatización con IA que trata datos personales sin supervisión humana.");
    }
    if (answers.ai.errorImpact === "alto" && answers.ai.oversight !== "siempre") {
      raise("medio", "Un error de la IA tendría un impacto alto y no siempre lo revisa una persona.");
    }
  }

  if (undeclared.length > 0) {
    reasons.push(
      `En tus ejemplos aparecen datos que no habías marcado: ${undeclared.map((c) => catInfo(c).label.toLowerCase()).join(", ")}. Se han tenido en cuenta.`,
    );
  }
  if (reasons.length === 0) reasons.push("No trata datos personales ni información confidencial y es de uso limitado.");

  // --- Restricciones técnicas para la generación ----------------------------
  const constraints: GenerationConstraints = {
    network: "ninguna",
    storage:
      answers.storage === "ninguno" || level === "alto"
        ? "ninguno"
        : answers.storage === "base_datos"
          ? "bd"
          : answers.storage === "navegador" && (!personalData || answers.audience === "personal" || answers.audience === "equipo")
            ? "local"
            : personalData
              ? "sesion"
              : "local",
    dbScope: answers.dbScope,
    retentionDays: answers.retention === "indefinida" ? null : answers.retention === "sesion" ? 1 : answers.retentionDays,
    ai: answers.aiUse !== "no" && level !== "no_permitido",
    syntheticDataOnly: level === "alto",
    accessibility: answers.audience === "publico" || answers.audience === "plantilla",
    privacyNotice: personalData,
    deleteButton: personalData || answers.storage !== "ninguno",
    aiModel: ai?.recommended?.id ?? null,
    aiMaxInputChars: ai?.recommended ? maxInputChars(ai.recommended) : 0,
    aiDisclosure: !!ai?.disclosure,
    aiHumanReview: !!ai?.humanReview,
  };
  if (!constraints.aiModel) constraints.ai = false;

  // --- Controles (lo que la herramienta aplica) ------------------------------
  controls.push("La aplicación no puede enviar datos a internet: se bloquean todas las conexiones externas (política de seguridad de contenido).");
  controls.push("El código generado se revisa automáticamente antes de mostrarse.");
  controls.push("Tus descripciones se envían a la IA con DNI, teléfonos, correos, IBAN y similares sustituidos por marcadores.");
  if (constraints.storage === "ninguno") controls.push("La aplicación no guardará datos: se borran al cerrarla.");
  if (constraints.storage === "sesion") controls.push("Los datos solo se guardan mientras la pestaña está abierta.");
  if (constraints.storage === "local") controls.push("Los datos se guardan solo en el navegador del equipo donde se usa.");
  if (answers.storage === "navegador" && constraints.storage === "sesion") {
    controls.push("Con datos personales compartidos, el navegador solo puede guardar datos mientras la pestaña está abierta: si necesitas conservarlos, elige la base de datos municipal.");
  }
  if (constraints.storage === "bd") {
    controls.push(
      `Los datos se guardan en la base de datos municipal, separados por aplicación${constraints.dbScope === "personal" ? " y por persona" : ""}, accesibles solo para los usuarios autorizados y con copias de seguridad.`,
    );
    controls.push(
      constraints.retentionDays
        ? `Los registros sin cambios durante ${constraints.retentionDays} día(s) se borrarán automáticamente.`
        : "Los registros se conservarán hasta que se borren.",
    );
    controls.push("Mientras construyes, la app usa una base de datos de pruebas separada que se vacía sola.");
  }
  if (level === "alto" && answers.storage !== "ninguno") controls.push("En modo prototipo no se guardan datos.");
  if (constraints.deleteButton) controls.push("Incluirá un botón visible para borrar todos los datos.");
  if (constraints.privacyNotice) controls.push("Incluirá un aviso de privacidad con la finalidad y el responsable.");
  if (constraints.ai) controls.push("El asistente de IA de la app solo funciona dentro de la plataforma y enmascara los datos personales antes de enviarlos.");
  if (constraints.ai && ai?.recommended) {
    const m = ai.recommended;
    controls.push(
      `La IA usará el modelo «${m.name}» (${m.hosting === "local" ? "en servidores municipales" : m.hosting === "ue" ? "procesado en la UE" : "procesado fuera de la UE"}), adecuado para una tarea de complejidad ${["", "básica", "intermedia", "avanzada"][ai.complexity]}.`,
    );
  }
  if (constraints.aiDisclosure) controls.push("La app indicará claramente que las respuestas o textos los genera una IA.");
  if (constraints.aiHumanReview) controls.push("Los resultados de la IA se mostrarán como borrador que una persona debe revisar y confirmar.");
  if (constraints.syntheticDataOnly) controls.push("Modo prototipo: la app mostrará un aviso de \"solo datos ficticios\" y se generará con datos inventados.");
  if (constraints.accessibility) controls.push("Se exigirán criterios de accesibilidad (WCAG 2.1 AA).");
  if (answers.decisions === "apoyo" || answers.decisions === "automatica") controls.push("Los resultados se mostrarán como propuesta para revisión humana, nunca como decisión final.");

  // --- Obligaciones organizativas -------------------------------------------
  if (personalData) {
    obligations.push("Usa solo los datos imprescindibles para la finalidad (minimización, art. 5 RGPD).");
    obligations.push("Comunica la aplicación al Delegado de Protección de Datos para su inclusión en el Registro de Actividades de Tratamiento (art. 30 RGPD).");
  }
  if (answers.origin.includes("ciudadanos") && personalData) obligations.push("Informa a los interesados con la cláusula informativa del Ayuntamiento (arts. 13-14 RGPD).");
  if (level === "alto") obligations.push("Antes de usar datos reales: Evaluación de Impacto (EIPD, art. 35 RGPD) y validación de TI.");
  if (answers.decisions === "apoyo" || answers.decisions === "automatica") obligations.push("Documenta cómo se revisa humanamente cada resultado (Reglamento de IA y art. 22 RGPD).");
  if (contractors) obligations.push("Las contratas que la usen deben tener contrato de encargo de tratamiento o acuerdo de confidencialidad que cubra este uso.");
  if (isPublic) obligations.push("La publicación en internet llegará en una fase posterior y requerirá aprobación de TI y Comunicación, con declaración de accesibilidad. Mientras tanto se publicará solo en la intranet.");
  if (ai) obligations.push(...ai.obligations);
  if (constraints.storage === "bd" && personalData) {
    obligations.push("Atiende las solicitudes de acceso o supresión de datos: desde «Mis apps» puedes exportar y borrar los registros.");
  }
  if (answers.retention === "indefinida" && personalData) obligations.push("Define un plazo de conservación: los datos personales no pueden guardarse indefinidamente.");
  if (answers.audience !== "personal") obligations.push("Nombra a una persona responsable de mantenerla y de darla de baja cuando deje de usarse.");
  obligations.push("No introduzcas contraseñas, claves ni datos de otras personas que no necesites.");

  const ensCategory: Assessment["ensCategory"] =
    RANK[level] >= RANK.alto ? "alta" : level === "medio" ? "media" : "básica";

  return { level, score, ensCategory, reasons, controls, obligations, constraints, personalData, undeclared, ai };
}

/** Compromisos que la persona debe aceptar antes de construir. */
export function commitments(a: Assessment): string[] {
  const list = [
    "Usaré la aplicación solo para la finalidad descrita.",
    "No introduciré contraseñas ni claves de acceso.",
    "Revisaré que la aplicación hace lo que espero antes de compartirla.",
  ];
  if (a.personalData) list.push("Usaré solo los datos personales imprescindibles y los borraré cuando no sean necesarios.");
  if (a.constraints.syntheticDataOnly) list.push("Solo usaré datos ficticios hasta que TI y el DPD aprueben su uso con datos reales.");
  if (a.constraints.ai) list.push("Revisaré siempre las respuestas de la IA: pueden contener errores.");
  if (a.ai) list.push("Conozco las capacidades y límites de la IA, o recibiré la formación necesaria (art. 4 del Reglamento de IA).");
  return list;
}
