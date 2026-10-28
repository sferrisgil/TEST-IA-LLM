/**
 * Automatizaciones programadas: definición declarativa de flujos.
 *
 * En el servidor NO se ejecuta código generado por la IA. Una automatización
 * es un flujo de pasos de un catálogo cerrado (listar, para cada, si, IA,
 * crear, actualizar, borrar, notificar) que interpreta el servidor con
 * límites estrictos. Así es seguro, auditable y comprensible para TI y el DPD.
 */

export type Schedule =
  | { tipo: "cada"; minutos: number }
  | { tipo: "diaria"; hora: string }
  | { tipo: "semanal"; dias: number[]; hora: string }
  | { tipo: "mensual"; dia: number; hora: string }
  | { tipo: "manual" };

export type Condition = { campo: string; op: "igual" | "distinto" | "contiene" | "mayor" | "menor" | "vacio" | "no_vacio"; valor?: string | number | boolean };

export type Step =
  | { tipo: "listar"; coleccion: string; filtros?: Record<string, string | number | boolean>; buscar?: string; limite?: number; guardarEn: string }
  | { tipo: "para_cada"; lista: string; pasos: Step[] }
  | { tipo: "si"; condicion: Condition; entonces: Step[]; sino?: Step[] }
  | { tipo: "ia"; instruccion: string; entrada: string; opciones?: string[]; guardarEn: string }
  | { tipo: "crear"; coleccion: string; registro: Record<string, unknown> }
  | { tipo: "actualizar"; coleccion: string; id: string; cambios: Record<string, unknown> }
  | { tipo: "borrar"; coleccion: string; id: string }
  | { tipo: "notificar"; mensaje: string };

export interface Workflow {
  programacion: Schedule;
  pasos: Step[];
}

export const LIMITS = {
  /** Intervalo mínimo entre ejecuciones programadas. */
  minIntervalMinutes: 15,
  maxSteps: 40,
  maxDepth: 3,
  maxItemsPerLoop: 500,
  /** Operaciones (pasos ejecutados) por ejecución. */
  maxOperations: 5000,
  maxAiCalls: 200,
  maxNotifications: 5,
  timeoutMs: 5 * 60_000,
};

const NAME = /^[A-Za-z0-9_\-]{1,40}$/;
const VAR = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const HOUR = /^([01]\d|2[0-3]):[0-5]\d$/;

export class WorkflowError extends Error {}

function str(v: unknown, max: number, what: string): string {
  if (typeof v !== "string" || !v.trim()) throw new WorkflowError(`Falta ${what}.`);
  return v.slice(0, max);
}

function plainObject(v: unknown, what: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new WorkflowError(`${what} debe ser un objeto.`);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 50)) {
    if (!/^[A-Za-z0-9_]{1,40}$/.test(k)) throw new WorkflowError(`Campo no válido: ${k}`);
    if (val !== null && typeof val === "object") throw new WorkflowError(`El campo ${k} debe ser un valor simple.`);
    out[k] = typeof val === "string" ? val.slice(0, 4000) : val;
  }
  return out;
}

function sanitizeSchedule(v: unknown): Schedule {
  const s = (v || {}) as Record<string, unknown>;
  switch (s.tipo) {
    case "cada": {
      const m = Math.round(Number(s.minutos));
      if (!(m >= LIMITS.minIntervalMinutes && m <= 24 * 60)) throw new WorkflowError(`El intervalo debe estar entre ${LIMITS.minIntervalMinutes} minutos y 24 horas.`);
      return { tipo: "cada", minutos: m };
    }
    case "diaria":
      if (!HOUR.test(String(s.hora))) throw new WorkflowError("Hora no válida (HH:MM).");
      return { tipo: "diaria", hora: String(s.hora) };
    case "semanal": {
      const dias = Array.isArray(s.dias) ? [...new Set(s.dias.map(Number).filter((d) => d >= 1 && d <= 7))].sort() : [];
      if (!dias.length || !HOUR.test(String(s.hora))) throw new WorkflowError("Indica los días (1=lunes … 7=domingo) y la hora.");
      return { tipo: "semanal", dias, hora: String(s.hora) };
    }
    case "mensual": {
      const dia = Math.round(Number(s.dia));
      if (!(dia >= 1 && dia <= 28) || !HOUR.test(String(s.hora))) throw new WorkflowError("Indica un día del mes entre 1 y 28 y la hora.");
      return { tipo: "mensual", dia, hora: String(s.hora) };
    }
    case "manual":
      return { tipo: "manual" };
    default:
      throw new WorkflowError("Programación no válida.");
  }
}

function sanitizeSteps(v: unknown, depth: number, count: { n: number }): Step[] {
  if (!Array.isArray(v)) throw new WorkflowError("Los pasos deben ser una lista.");
  if (depth > LIMITS.maxDepth) throw new WorkflowError("Demasiados niveles de pasos anidados.");
  return v.map((raw) => {
    if (++count.n > LIMITS.maxSteps) throw new WorkflowError(`Máximo ${LIMITS.maxSteps} pasos.`);
    const s = (raw || {}) as Record<string, unknown>;
    const coll = () => {
      const c = str(s.coleccion, 40, "la colección");
      if (!NAME.test(c)) throw new WorkflowError(`Colección no válida: ${c}`);
      return c;
    };
    const variable = (k: string) => {
      const x = str(s[k], 40, "el nombre de la variable");
      if (!VAR.test(x) || x.startsWith("__") || ["item", "ahora", "hoy", "ejecucion", "constructor", "prototype", "hasOwnProperty", "toString", "valueOf"].includes(x)) {
        throw new WorkflowError(`Nombre de variable no válido: ${x}`);
      }
      return x;
    };
    switch (s.tipo) {
      case "listar": {
        const limite = Math.min(LIMITS.maxItemsPerLoop, Math.max(1, Number(s.limite) || 100));
        const filtros = s.filtros ? (plainObject(s.filtros, "Los filtros") as Record<string, string | number | boolean>) : undefined;
        return { tipo: "listar", coleccion: coll(), filtros, buscar: typeof s.buscar === "string" ? s.buscar.slice(0, 200) : undefined, limite, guardarEn: variable("guardarEn") };
      }
      case "para_cada":
        return { tipo: "para_cada", lista: variable("lista"), pasos: sanitizeSteps(s.pasos, depth + 1, count) };
      case "si": {
        const c = (s.condicion || {}) as Record<string, unknown>;
        const ops = ["igual", "distinto", "contiene", "mayor", "menor", "vacio", "no_vacio"];
        if (!ops.includes(c.op as string)) throw new WorkflowError("Operador de condición no válido.");
        const condicion: Condition = {
          campo: str(c.campo, 120, "el campo de la condición"),
          op: c.op as Condition["op"],
          valor: ["string", "number", "boolean"].includes(typeof c.valor) ? (c.valor as Condition["valor"]) : undefined,
        };
        return { tipo: "si", condicion, entonces: sanitizeSteps(s.entonces || [], depth + 1, count), sino: s.sino ? sanitizeSteps(s.sino, depth + 1, count) : undefined };
      }
      case "ia": {
        const opciones = Array.isArray(s.opciones) ? s.opciones.filter((o): o is string => typeof o === "string").map((o) => o.slice(0, 60)).slice(0, 20) : undefined;
        return { tipo: "ia", instruccion: str(s.instruccion, 2000, "la instrucción para la IA"), entrada: str(s.entrada, 500, "la entrada de la IA"), opciones: opciones?.length ? opciones : undefined, guardarEn: variable("guardarEn") };
      }
      case "crear":
        return { tipo: "crear", coleccion: coll(), registro: plainObject(s.registro, "El registro") };
      case "actualizar":
        return { tipo: "actualizar", coleccion: coll(), id: str(s.id, 200, "el id"), cambios: plainObject(s.cambios, "Los cambios") };
      case "borrar":
        return { tipo: "borrar", coleccion: coll(), id: str(s.id, 200, "el id") };
      case "notificar":
        return { tipo: "notificar", mensaje: str(s.mensaje, 1000, "el mensaje") };
      default:
        throw new WorkflowError(`Tipo de paso desconocido: ${String(s.tipo)}`);
    }
  });
}

/** Valida un flujo (lanza WorkflowError con un mensaje claro si no es válido). */
export function sanitizeWorkflow(input: unknown, opts: { ai: boolean }): Workflow {
  const w = (typeof input === "string" ? JSON.parse(input) : input) as Record<string, unknown>;
  if (!w || typeof w !== "object") throw new WorkflowError("Flujo no válido.");
  const pasos = sanitizeSteps(w.pasos, 1, { n: 0 });
  if (!pasos.length) throw new WorkflowError("El flujo no tiene pasos.");
  const usesAi = JSON.stringify(pasos).includes('"tipo":"ia"');
  if (usesAi && !opts.ai) throw new WorkflowError("El flujo usa IA, pero la evaluación no lo autoriza.");
  return { programacion: sanitizeSchedule(w.programacion), pasos };
}

export function usesAi(w: Workflow): boolean {
  return JSON.stringify(w.pasos).includes('"tipo":"ia"');
}

// --- Descripción legible -------------------------------------------------------

const DAYS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export function describeSchedule(s: Schedule): string {
  switch (s.tipo) {
    case "cada":
      return s.minutos % 60 === 0 ? `Cada ${s.minutos / 60} hora(s)` : `Cada ${s.minutos} minutos`;
    case "diaria":
      return `Todos los días a las ${s.hora}`;
    case "semanal":
      return `Los ${s.dias.map((d) => DAYS[d]).join(", ")} a las ${s.hora}`;
    case "mensual":
      return `El día ${s.dia} de cada mes a las ${s.hora}`;
    case "manual":
      return "Solo cuando se ejecute a mano";
  }
}

const COND: Record<Condition["op"], string> = {
  igual: "es igual a",
  distinto: "es distinto de",
  contiene: "contiene",
  mayor: "es mayor que",
  menor: "es menor que",
  vacio: "está vacío",
  no_vacio: "no está vacío",
};

export function describeSteps(steps: Step[], indent = ""): string[] {
  const out: string[] = [];
  steps.forEach((s, i) => {
    const n = `${indent}${i + 1}.`;
    switch (s.tipo) {
      case "listar":
        out.push(`${n} Buscar en «${s.coleccion}»${s.filtros ? ` los registros con ${Object.entries(s.filtros).map(([k, v]) => `${k} = ${v}`).join(" y ")}` : ""}${s.buscar ? ` que contengan «${s.buscar}»` : ""} (máx. ${s.limite}) → ${s.guardarEn}`);
        break;
      case "para_cada":
        out.push(`${n} Para cada elemento de ${s.lista}:`, ...describeSteps(s.pasos, indent + "   "));
        break;
      case "si":
        out.push(`${n} Si ${s.condicion.campo} ${COND[s.condicion.op]}${s.condicion.valor !== undefined ? ` «${s.condicion.valor}»` : ""}:`, ...describeSteps(s.entonces, indent + "   "));
        if (s.sino?.length) out.push(`${indent}   Si no:`, ...describeSteps(s.sino, indent + "   "));
        break;
      case "ia":
        out.push(`${n} Pedir a la IA: «${s.instruccion.slice(0, 140)}»${s.opciones ? ` (respuesta entre: ${s.opciones.join(", ")})` : ""} → ${s.guardarEn}`);
        break;
      case "crear":
        out.push(`${n} Crear un registro en «${s.coleccion}» con ${Object.keys(s.registro).join(", ")}`);
        break;
      case "actualizar":
        out.push(`${n} Actualizar ${s.id} en «${s.coleccion}»: ${Object.keys(s.cambios).join(", ")}`);
        break;
      case "borrar":
        out.push(`${n} Borrar ${s.id} de «${s.coleccion}»`);
        break;
      case "notificar":
        out.push(`${n} Avisar a la persona responsable: «${s.mensaje.slice(0, 140)}»`);
        break;
    }
  });
  return out;
}

// --- Próxima ejecución ------------------------------------------------------------

function at(base: Date, hora: string): Date {
  const [h, m] = hora.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Próxima ejecución estrictamente posterior a `from` (hora local del servidor). */
export function nextRun(s: Schedule, from: Date): Date | null {
  switch (s.tipo) {
    case "manual":
      return null;
    case "cada":
      return new Date(from.getTime() + s.minutos * 60_000);
    case "diaria": {
      const d = at(from, s.hora);
      if (d <= from) d.setDate(d.getDate() + 1);
      return d;
    }
    case "semanal": {
      for (let i = 0; i <= 7; i++) {
        const d = at(from, s.hora);
        d.setDate(d.getDate() + i);
        const dow = d.getDay() === 0 ? 7 : d.getDay();
        if (s.dias.includes(dow) && d > from) return d;
      }
      return null;
    }
    case "mensual": {
      const d = at(from, s.hora);
      d.setDate(s.dia);
      if (d <= from) d.setMonth(d.getMonth() + 1);
      return d;
    }
  }
}
