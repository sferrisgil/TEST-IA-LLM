/**
 * Motor de automatizaciones programadas.
 *
 *  - Programador: cada 30 s revisa qué automatizaciones publicadas toca
 *    ejecutar y las lanza (con un máximo de ejecuciones simultáneas).
 *  - Pruebas: ejecución en la base de datos de pruebas mientras se construye.
 *  - Gestión: historial, ejecutar ahora, pausar y reanudar.
 *
 * Con varias instancias del servidor, solo una debe programar
 * (SCHEDULER_ENABLED=false en las demás).
 */
import { randomBytes } from "crypto";
import type { Express, Request, Response } from "express";
import { assess, sanitizeAnswers, type Answers, type Assessment } from "../shared/policy";
import { canManage, isExpired, type Publication } from "../shared/publishing";
import { describeSchedule, nextRun, sanitizeWorkflow, WorkflowError, type Workflow } from "../shared/workflow";
import type { ModelInfo } from "../shared/aiAct";
import * as db from "./db";
import { requireStaff } from "./identity";
import { link, notifyRequester } from "./notify";
import { store } from "./store";
import { runWorkflow, type RunResult } from "./workflowRunner";

interface Deps {
  audit: (event: string, answers: Answers, a: Assessment, extra?: Record<string, unknown>) => void;
  rateLimit: (max: number, windowMs: number) => (req: Request, res: Response, next: () => void) => void;
  models: () => ModelInfo[];
  /** Llamada a la IA asignada (con sus límites y reglas). */
  askAi: (answers: Answers, text: string, a: Assessment) => Promise<string>;
}

const CONCURRENCY = Math.max(1, Number(process.env.SCHEDULER_CONCURRENCY) || 2);
const running = new Set<string>();

/** Valida el flujo para una evaluación concreta. */
export function validateWorkflow(input: unknown, answers: Answers, a: Assessment): Workflow {
  if (answers.appKind !== "automatizacion") throw new WorkflowError("Solo las automatizaciones pueden tener un flujo programado.");
  if (a.constraints.storage !== "bd") throw new WorkflowError("Las automatizaciones programadas necesitan guardar los datos en la base de datos municipal.");
  return sanitizeWorkflow(input, { ai: a.constraints.ai });
}

export function scheduleNext(p: Publication, from = new Date()) {
  p.nextRunAt = p.workflow && p.scheduleActive !== false ? nextRun(p.workflow.programacion, from)?.toISOString() ?? null : null;
}

function aiFor(deps: Deps, answers: Answers, a: Assessment) {
  return a.constraints.ai ? (instruction: string, input: string) => deps.askAi(answers, `${instruction}\n\n---\n${input}`, a) : null;
}

/** Ejecuta la automatización de una app publicada y guarda el resultado. */
export async function runPublication(p: Publication, deps: Deps, origin: "programada" | "manual", user: string | null): Promise<RunResult | null> {
  if (!p.workflow || running.has(p.id)) return null;
  running.add(p.id);
  const runId = `ej-${randomBytes(5).toString("hex")}`;
  db.startRun(runId, p.id, origin, user);
  const notices: string[] = [];
  try {
    const result = await runWorkflow(p.workflow, {
      db: { scope: `app:${p.id}`, user: p.owner, dbScope: p.assessment.constraints.dbScope },
      ai: aiFor(deps, p.answers, p.assessment),
      humanReview: p.assessment.constraints.aiHumanReview,
      runId,
      notify: async (msg) => {
        notices.push(msg);
      },
    });
    db.finishRun(runId, result.estado, { ...result.resumen, error: result.error }, result.log);
    deps.audit(`automatizacion_${result.estado}`, p.answers, p.assessment, { id: p.id, origen: origin, ...result.resumen });
    // Avisos del flujo y errores, a la persona responsable.
    if (notices.length || result.estado === "error") {
      await notifyRequester(p.ownerEmail, {
        subject: `[Taller de Apps IA] ${result.estado === "error" ? "Error en" : "Aviso de"} la automatización «${p.name}»`,
        text: [...notices, result.error ? `Error: ${result.error}` : ""].filter(Boolean).join("\n\n") + `\n\nHistorial: ${link("/#mis-apps")}`,
      });
    }
    return result;
  } catch (error) {
    console.error("Error ejecutando automatización:", error);
    db.finishRun(runId, "error", { error: "Error interno" }, []);
    return null;
  } finally {
    running.delete(p.id);
    const fresh = store.get(p.id);
    if (fresh) {
      scheduleNext(fresh);
      store.save(fresh);
    }
  }
}

/** Lanza las automatizaciones a las que les toca ejecutarse. Devuelve las ejecuciones iniciadas. */
export function runDue(deps: Deps, now = new Date()): Promise<RunResult | null>[] {
  const started: Promise<RunResult | null>[] = [];
  for (const p of store.all()) {
    if (running.size >= CONCURRENCY) break;
    if (!p.workflow || p.status !== "publicada" || p.scheduleActive === false || isExpired(p) || running.has(p.id)) continue;
    if (!p.nextRunAt) {
      // Publicada sin fecha calculada (p. ej. recién aprobada): se programa.
      if (p.workflow.programacion.tipo === "manual") continue;
      scheduleNext(p, now);
      store.save(p);
      continue;
    }
    // Si el servidor estuvo parado, se recupera una sola ejecución atrasada.
    if (new Date(p.nextRunAt) <= now) started.push(runPublication(p, deps, "programada", null));
  }
  return started;
}

export function startScheduler(deps: Deps) {
  if (process.env.SCHEDULER_ENABLED === "false") {
    console.log("Programador de automatizaciones desactivado en esta instancia.");
    return;
  }
  const abandoned = db.abandonRuns();
  if (abandoned) console.log(`${abandoned} ejecución(es) interrumpida(s) por el reinicio marcadas como error.`);

  const tick = () => void runDue(deps);
  setInterval(tick, 30_000).unref();
  setInterval(() => db.purgeRuns(90), 24 * 60 * 60_000).unref();
  setTimeout(tick, 5_000).unref();
}

export function registerAutomations(app: Express, deps: Deps) {
  /** Prueba del flujo en la base de datos de pruebas (mientras se construye). */
  app.post("/api/flujo-prueba", requireStaff, deps.rateLimit(20, 5 * 60_000), async (req, res) => {
    const who = req.identity!;
    const answers = sanitizeAnswers(req.body?.respuestas);
    const a = assess(answers, deps.models());
    let w: Workflow;
    try {
      w = validateWorkflow(req.body?.flujo, answers, a);
    } catch (e) {
      return res.status(400).json({ error: e instanceof WorkflowError || e instanceof SyntaxError ? e.message : "Flujo no válido." });
    }
    const notices: string[] = [];
    const result = await runWorkflow(w, {
      db: { scope: `prueba:${who.user}`, user: who.user, dbScope: a.constraints.dbScope },
      ai: aiFor(deps, answers, a),
      humanReview: a.constraints.aiHumanReview,
      runId: "prueba",
      notify: async (m) => {
        notices.push(m);
      },
    });
    res.json({ ...result, avisosSimulados: notices });
  });

  const managed = (req: Request, res: Response): Publication | null => {
    const p = store.get(req.params.id);
    if (!p || !canManage(p, req.identity!)) {
      res.status(404).json({ error: "No encontrada." });
      return null;
    }
    if (!p.workflow) {
      res.status(400).json({ error: "Esta aplicación no tiene automatización." });
      return null;
    }
    return p;
  };

  app.get("/api/publicaciones/:id/ejecuciones", requireStaff, (req, res) => {
    const p = managed(req, res);
    if (!p) return;
    res.json({
      programacion: describeSchedule(p.workflow!.programacion),
      activa: p.scheduleActive !== false,
      proxima: p.nextRunAt ?? null,
      enCurso: running.has(p.id),
      ejecuciones: db.listRuns(p.id, 20),
    });
  });

  app.post("/api/publicaciones/:id/ejecutar", requireStaff, deps.rateLimit(10, 10 * 60_000), async (req, res) => {
    const p = managed(req, res);
    if (!p) return;
    if (p.status !== "publicada") return res.status(409).json({ error: "Solo se ejecutan automatizaciones publicadas." });
    if (running.has(p.id)) return res.status(409).json({ error: "Ya se está ejecutando." });
    const r = await runPublication(p, deps, "manual", req.identity!.user);
    res.json(r ?? { estado: "error", error: "No se ha podido ejecutar." });
  });

  app.post("/api/publicaciones/:id/programacion", requireStaff, (req, res) => {
    const p = managed(req, res);
    if (!p) return;
    p.scheduleActive = req.body?.activa === true;
    p.history.push({ date: new Date().toISOString(), user: req.identity!.user, action: p.scheduleActive ? "Programación reanudada" : "Programación pausada" });
    scheduleNext(p);
    store.save(p);
    res.json({ activa: p.scheduleActive, proxima: p.nextRunAt ?? null });
  });
}
