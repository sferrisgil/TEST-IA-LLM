/**
 * Intérprete de flujos. Ejecuta los pasos declarativos con límites estrictos
 * (operaciones, llamadas a IA, elementos por bucle y tiempo), sin ejecutar
 * código arbitrario.
 */
import * as db from "./db";
import { maskPii } from "../shared/pii";
import { LIMITS, type Condition, type Step, type Workflow } from "../shared/workflow";

export interface RunContext {
  db: db.DbContext;
  /** Llama a la IA asignada a la app (instrucción fija + entrada con datos). */
  ai: ((instruction: string, input: string) => Promise<string>) | null;
  notify: (message: string) => Promise<void>;
  /** Si los resultados de la IA requieren revisión humana. */
  humanReview: boolean;
  runId: string;
}

export interface RunLogEntry {
  t: string;
  nivel: "info" | "aviso" | "error";
  msg: string;
}

export interface RunResult {
  estado: "ok" | "error";
  error?: string;
  resumen: { operaciones: number; ia: number; creados: number; actualizados: number; borrados: number; avisos: number };
  log: RunLogEntry[];
}

class RunAbort extends Error {}

const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);

function resolve(vars: Record<string, unknown>, path: string): unknown {
  let cur: unknown = vars;
  for (const part of path.trim().split(".")) {
    if (FORBIDDEN.has(part)) return undefined;
    if (cur === null || cur === undefined) return undefined;
    if (part === "length" && (Array.isArray(cur) || typeof cur === "string")) {
      cur = (cur as unknown[]).length;
      continue;
    }
    if (typeof cur !== "object" || !Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Sustituye {{ruta}}. Si el texto es solo un marcador, conserva el tipo (número, booleano…). */
function render(value: unknown, vars: Record<string, unknown>): unknown {
  if (typeof value !== "string") return value;
  const whole = value.match(/^\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$/);
  if (whole) return resolve(vars, whole[1]) ?? null;
  return value.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_, p) => {
    const v = resolve(vars, p);
    return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  });
}

function renderObject(o: Record<string, unknown>, vars: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, render(v, vars)]));
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function check(c: Condition, vars: Record<string, unknown>): boolean {
  const v = resolve(vars, c.campo);
  const target = render(c.valor, vars);
  switch (c.op) {
    case "vacio":
      return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    case "no_vacio":
      return !(v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0));
    case "igual":
      return String(v ?? "") === String(target ?? "");
    case "distinto":
      return String(v ?? "") !== String(target ?? "");
    case "contiene":
      return norm(String(v ?? "")).includes(norm(String(target ?? "")));
    case "mayor":
      return Number(v) > Number(target);
    case "menor":
      return Number(v) < Number(target);
  }
}

export async function runWorkflow(w: Workflow, ctx: RunContext): Promise<RunResult> {
  const started = Date.now();
  const log: RunLogEntry[] = [];
  const resumen = { operaciones: 0, ia: 0, creados: 0, actualizados: 0, borrados: 0, avisos: 0 };
  let aiUsed = false;
  const write = (nivel: RunLogEntry["nivel"], msg: string) => {
    if (log.length < 300) log.push({ t: new Date().toISOString(), nivel, msg: msg.slice(0, 500) });
  };
  const now = new Date();
  // Objeto sin prototipo: los nombres de variable nunca pueden alterar el intérprete.
  const vars: Record<string, unknown> = Object.assign(Object.create(null), {
    ahora: now.toISOString(),
    hoy: now.toISOString().slice(0, 10),
    ejecucion: ctx.runId,
  });

  const tick = () => {
    if (++resumen.operaciones > LIMITS.maxOperations) throw new RunAbort(`Se ha superado el máximo de ${LIMITS.maxOperations} operaciones por ejecución.`);
    if (Date.now() - started > LIMITS.timeoutMs) throw new RunAbort("Se ha superado el tiempo máximo de ejecución (5 minutos).");
  };
  // Los registros escritos con ayuda de la IA quedan pendientes de revisión humana.
  const mark = (rec: Record<string, unknown>) => (ctx.humanReview && aiUsed ? { ...rec, _revision: "pendiente" } : rec);

  async function exec(steps: Step[]): Promise<void> {
    for (const s of steps) {
      tick();
      switch (s.tipo) {
        case "listar": {
          const r = db.list(ctx.db, s.coleccion, {
            filtros: s.filtros ? renderObject(s.filtros, vars) : undefined,
            buscar: s.buscar ? String(render(s.buscar, vars)) : undefined,
            limite: s.limite,
          });
          vars[s.guardarEn] = r.registros;
          write("info", `«${s.coleccion}»: ${r.registros.length} registro(s) encontrados.`);
          break;
        }
        case "para_cada": {
          const list = vars[s.lista];
          if (!Array.isArray(list)) {
            write("aviso", `${s.lista} no es una lista; se omite el bucle.`);
            break;
          }
          if (list.length > LIMITS.maxItemsPerLoop) write("aviso", `Solo se procesan los primeros ${LIMITS.maxItemsPerLoop} elementos.`);
          const previous = vars.item;
          for (const item of list.slice(0, LIMITS.maxItemsPerLoop)) {
            vars.item = item;
            await exec(s.pasos);
          }
          vars.item = previous;
          break;
        }
        case "si":
          await exec(check(s.condicion, vars) ? s.entonces : s.sino || []);
          break;
        case "ia": {
          if (!ctx.ai) throw new RunAbort("Esta automatización no está autorizada a usar IA.");
          if (++resumen.ia > LIMITS.maxAiCalls) throw new RunAbort(`Se ha superado el máximo de ${LIMITS.maxAiCalls} consultas a la IA por ejecución.`);
          const input = maskPii(String(render(s.entrada, vars) ?? "")).text;
          let answer = await ctx.ai(s.instruccion + (s.opciones ? `\nResponde únicamente con una de estas opciones: ${s.opciones.join(", ")}.` : ""), input);
          if (s.opciones) {
            const match = s.opciones.find((o) => norm(answer).includes(norm(o)));
            if (!match) write("aviso", `La IA respondió fuera de las opciones permitidas («${answer.slice(0, 60)}»); se deja vacío.`);
            answer = match ?? "";
          }
          vars[s.guardarEn] = answer;
          aiUsed = true;
          break;
        }
        case "crear": {
          db.save(ctx.db, s.coleccion, mark(renderObject(s.registro, vars)));
          resumen.creados++;
          break;
        }
        case "actualizar": {
          const id = String(render(s.id, vars) ?? "");
          const current = db.get(ctx.db, s.coleccion, id);
          if (!current) {
            write("aviso", `No existe el registro ${id} en «${s.coleccion}».`);
            break;
          }
          const { _creado, _actualizado, _autor, ...data } = current as Record<string, unknown>;
          void _creado;
          void _actualizado;
          void _autor;
          db.save(ctx.db, s.coleccion, mark({ ...data, ...renderObject(s.cambios, vars), id }));
          resumen.actualizados++;
          break;
        }
        case "borrar": {
          resumen.borrados += db.remove(ctx.db, s.coleccion, String(render(s.id, vars) ?? "")).borrados;
          break;
        }
        case "notificar": {
          if (resumen.avisos >= LIMITS.maxNotifications) {
            write("aviso", "Se ha alcanzado el máximo de avisos por ejecución.");
            break;
          }
          const msg = String(render(s.mensaje, vars) ?? "");
          await ctx.notify(msg);
          resumen.avisos++;
          write("info", `Aviso enviado: ${msg}`);
          break;
        }
      }
    }
  }

  try {
    await exec(w.pasos);
    write("info", `Terminado: ${resumen.creados} creados, ${resumen.actualizados} actualizados, ${resumen.borrados} borrados, ${resumen.ia} consultas a la IA.`);
    if (ctx.humanReview && aiUsed && resumen.creados + resumen.actualizados > 0) {
      write("info", "Los registros escritos con ayuda de la IA quedan marcados con _revision = \"pendiente\" para que una persona los revise.");
    }
    return { estado: "ok", resumen, log };
  } catch (error) {
    const msg = error instanceof RunAbort || error instanceof db.DbError ? error.message : "Error interno durante la ejecución.";
    if (!(error instanceof RunAbort || error instanceof db.DbError)) console.error("Error en automatización:", error);
    write("error", msg);
    return { estado: "error", error: msg, resumen, log };
  }
}
