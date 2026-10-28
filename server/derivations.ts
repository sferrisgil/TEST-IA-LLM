/**
 * Solicitudes derivadas a TI / DPD.
 *
 * Cuando la evaluación exige derivar, la persona envía su propuesta (ficha +
 * prototipo opcional + mensaje). TI/DPD la reciben automáticamente (correo,
 * webhook de tickets y panel de revisión), la estudian, conversan con la
 * persona y la resuelven. Si la aprueban con prototipo, pueden publicarla.
 */
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { Express, Request, Response } from "express";
import { APP_CSP, hardenHtml, scanCode, type ScanFinding } from "../shared/codeScan";
import { fichaMarkdown } from "../shared/ficha";
import { RECIPIENT_LABEL, type Recipient } from "../shared/derivation";
import { assess, commitments, LEVEL_INFO, sanitizeAnswers, type Answers, type Assessment } from "../shared/policy";
import { maskPii } from "../shared/pii";
import { addMonths, REVIEW_PERIOD_MONTHS, type Identity, type Publication } from "../shared/publishing";
import type { ModelInfo } from "../shared/aiAct";
import { requireReviewer, requireStaff } from "./identity";
import { link, notifyRequester, notifyStaff, type Message, type NotificationLog } from "./notify";
import { store as publications } from "./store";
import * as db from "./db";
import { scheduleNext, validateWorkflow } from "./automations";
import { WorkflowError, type Workflow } from "../shared/workflow";

export type RequestStatus = "recibida" | "en_estudio" | "aprobada" | "rechazada" | "proyecto_ti";

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  recibida: "Recibida",
  en_estudio: "En estudio",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  proyecto_ti: "Pasa a proyecto de TI",
};

interface Comment {
  date: string;
  user: string;
  name: string;
  role: "solicitante" | "revision";
  text: string;
}

export interface DerivationRequest {
  id: string;
  createdAt: string;
  updatedAt: string;
  requester: string;
  requesterName: string;
  requesterEmail?: string;
  department: string;
  appName: string;
  answers: Answers;
  assessment: Assessment;
  ficha: string;
  message: string;
  contact: string;
  hasPrototype: boolean;
  findings: ScanFinding[];
  recipients: Recipient[];
  status: RequestStatus;
  comments: Comment[];
  history: { date: string; user: string; action: string }[];
  notifications: NotificationLog[];
  publicationId?: string;
  workflow?: Workflow;
}

// --- Almacén -----------------------------------------------------------------

const DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
const INDEX = path.join(DATA_DIR, "solicitudes.json");
const CODE_DIR = path.join(DATA_DIR, "solicitudes");
const table = db.documents<DerivationRequest>("solicitudes", INDEX);

function load(): DerivationRequest[] {
  return table.all();
}
function write(file: string, content: string) {
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, content, { mode: 0o640 });
  fs.renameSync(tmp, file);
}
function save(r: DerivationRequest, code?: string | null) {
  if (code) {
    fs.mkdirSync(CODE_DIR, { recursive: true, mode: 0o750 });
    write(path.join(CODE_DIR, `${r.id}.html`), code);
  }
  table.save(r);
}
function codeOf(r: DerivationRequest): string | null {
  if (!/^sol-[a-f0-9]+$/.test(r.id)) return null;
  const f = path.join(CODE_DIR, `${r.id}.html`);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
}

// --- Mensajes -----------------------------------------------------------------

function staffMessage(r: DerivationRequest, kind: "nueva" | "actualizada" | "comentario", extra = ""): Message {
  const title = kind === "nueva" ? "Nueva propuesta para estudio" : kind === "actualizada" ? "Propuesta actualizada" : "Nuevo comentario en una propuesta";
  const text = `${title}: «${r.appName}»

Solicitante: ${r.requesterName} (${r.department || "sin departamento"})${r.contact ? `\nContacto: ${r.contact}` : ""}
Nivel de riesgo: ${LEVEL_INFO[r.assessment.level].label}
Destinatarios: ${r.recipients.map((x) => RECIPIENT_LABEL[x]).join(", ")}
Prototipo adjunto en la plataforma: ${r.hasPrototype ? "sí" : "no"}

Motivos de la derivación:
${r.assessment.derivation.reasons.map((x) => `- ${x.text}`).join("\n")}
${r.message ? `\nMensaje del solicitante:\n${r.message}\n` : ""}${extra ? `\n${extra}\n` : ""}
Estudiar en la plataforma: ${link("/#revision")}

Se adjunta la ficha completa de la propuesta.`;
  return {
    subject: `[Taller de Apps IA] ${title}: ${r.appName} (${LEVEL_INFO[r.assessment.level].label})`,
    text,
    attachments: [
      { filename: `ficha-${r.id}.md`, content: r.ficha, contentType: "text/markdown; charset=utf-8" },
      {
        filename: `ficha-${r.id}.json`,
        content: JSON.stringify({ solicitud: r.id, respuestas: r.answers, evaluacion: r.assessment }, null, 2),
        contentType: "application/json",
      },
    ],
  };
}

function webhookPayload(r: DerivationRequest, evento: string) {
  return {
    evento,
    solicitud: {
      id: r.id,
      aplicacion: r.appName,
      solicitante: r.requester,
      nombre: r.requesterName,
      departamento: r.department,
      destinatarios: r.recipients,
      nivel: r.assessment.level,
      reglamentoIA: r.assessment.ai?.category ?? null,
      estado: r.status,
      motivos: r.assessment.derivation.reasons.map((x) => x.text),
      url: link("/#revision"),
    },
    ficha: r.ficha,
  };
}

// --- Rutas -------------------------------------------------------------------

interface Deps {
  audit: (event: string, answers: Answers, a: Assessment, extra?: Record<string, unknown>) => void;
  rateLimit: (max: number, windowMs: number) => (req: Request, res: Response, next: () => void) => void;
  models: () => ModelInfo[];
}

const now = () => new Date().toISOString();
const CLOSED: RequestStatus[] = ["aprobada", "rechazada", "proyecto_ti"];

function view(r: DerivationRequest, full: boolean) {
  return {
    id: r.id,
    aplicacion: r.appName,
    solicitante: r.requesterName,
    departamento: r.department,
    nivel: r.assessment.level,
    reglamentoIA: r.assessment.ai?.category ?? null,
    destinatarios: r.recipients,
    motivos: r.assessment.derivation.reasons,
    estado: r.status,
    creada: r.createdAt,
    actualizada: r.updatedAt,
    prototipo: r.hasPrototype ? `/derivaciones/${r.id}/prototipo` : null,
    comentarios: r.comments,
    avisos: r.notifications,
    publicacion: r.publicationId ? `/apps/${r.publicationId}` : null,
    ...(full ? { ficha: r.ficha, mensaje: r.message, contacto: r.contact, historial: r.history, hallazgos: r.findings } : {}),
  };
}

export function registerDerivations(app: Express, deps: Deps) {
  const canSee = (r: DerivationRequest, who: Identity) => r.requester === who.user || who.isReviewer;

  /** Enviar (o actualizar) una propuesta a TI/DPD. */
  app.post("/api/derivaciones", requireStaff, deps.rateLimit(10, 10 * 60_000), async (req, res) => {
    const who = req.identity!;
    const answers = { ...sanitizeAnswers(req.body?.respuestas), owner: who.name };
    const a = assess(answers, deps.models());
    if (!a.derivation.required) return res.status(400).json({ error: "Esta propuesta no necesita derivarse: puedes construirla y publicarla tú." });

    const message = maskPii(String(req.body?.mensaje || "").slice(0, 4000)).text;
    const contact = String(req.body?.contacto || "").replace(/[\r\n]+/g, " ").slice(0, 200);
    // El prototipo se adjunta solo si supera la revisión de seguridad.
    const rawCode = typeof req.body?.codigo === "string" ? req.body.codigo.slice(0, 500_000) : "";
    const findings = rawCode ? scanCode(rawCode, a.constraints) : [];
    const code = rawCode && !findings.some((f) => f.severity === "bloqueante") && !a.derivation.blocksBuild ? hardenHtml(rawCode, a.constraints) : null;

    let workflow: Workflow | undefined;
    let workflowError = "";
    if (req.body?.flujo) {
      try {
        workflow = validateWorkflow(req.body.flujo, answers, a);
      } catch (e) {
        workflowError = e instanceof WorkflowError || e instanceof SyntaxError ? e.message : "Flujo no válido.";
      }
    }

    const ficha = fichaMarkdown({
      answers,
      assessment: a,
      commitments: commitments(a),
      acceptedAt: typeof req.body?.aceptadoEn === "string" ? req.body.aceptadoEn.slice(0, 40) : null,
      versions: code ? 1 : 0,
      findings,
      workflow,
    });

    const existingId = typeof req.body?.id === "string" ? req.body.id : "";
    let r = existingId ? load().find((x) => x.id === existingId) : undefined;
    if (existingId && (!r || r.requester !== who.user)) return res.status(404).json({ error: "Solicitud no encontrada." });
    if (r && CLOSED.includes(r.status)) return res.status(409).json({ error: "La solicitud ya está resuelta. Envía una nueva." });

    const kind = r ? "actualizada" : "nueva";
    r = {
      id: r?.id || `sol-${randomBytes(5).toString("hex")}`,
      createdAt: r?.createdAt || now(),
      updatedAt: now(),
      requester: who.user,
      requesterName: who.name,
      requesterEmail: who.email,
      department: who.department || answers.department,
      appName: answers.appName || "Propuesta sin nombre",
      answers,
      assessment: a,
      ficha,
      message,
      contact,
      hasPrototype: !!code || (r?.hasPrototype ?? false),
      findings,
      recipients: a.derivation.recipients,
      status: r?.status || "recibida",
      comments: r?.comments || [],
      history: [...(r?.history || []), { date: now(), user: who.user, action: kind === "nueva" ? "Propuesta enviada" : "Propuesta actualizada" }],
      notifications: r?.notifications || [],
      publicationId: r?.publicationId,
      workflow: workflow ?? r?.workflow,
    };
    save(r, code);
    // Envío automático de la ficha a TI / DPD.
    const logs = await notifyStaff(r.recipients, staffMessage(r, kind), webhookPayload(r, kind === "nueva" ? "solicitud_creada" : "solicitud_actualizada"));
    r.notifications.push(...logs);
    save(r);
    deps.audit(kind === "nueva" ? "derivacion_creada" : "derivacion_actualizada", answers, a, { id: r.id, destinatarios: r.recipients.join(",") });
    res.json({
      ...view(r, false),
      aviso:
        [code || !rawCode ? "" : "El prototipo no se ha adjuntado porque no supera la revisión de seguridad.", workflowError ? `La automatización no se ha adjuntado: ${workflowError}` : ""]
          .filter(Boolean)
          .join(" ") || undefined,
    });
  });

  app.get("/api/derivaciones/mias", requireStaff, (req, res) => {
    res.json(load().filter((r) => r.requester === req.identity!.user).map((r) => view(r, true)).reverse());
  });

  app.get("/api/derivaciones", requireReviewer, (_req, res) => {
    res.json(load().map((r) => view(r, true)).reverse());
  });

  /** Prototipo adjunto, aislado igual que las vistas previas. */
  app.get("/derivaciones/:id/prototipo", requireStaff, (req, res) => {
    const r = load().find((x) => x.id === req.params.id);
    const code = r && canSee(r, req.identity!) ? codeOf(r) : null;
    if (!r || !code) return res.status(404).type("text/plain; charset=utf-8").send("Prototipo no disponible.");
    res.setHeader("Content-Security-Policy", `${APP_CSP}; frame-ancestors 'self'; sandbox allow-scripts allow-forms allow-modals`);
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Cache-Control", "no-store");
    res.type("text/html; charset=utf-8").send(hardenHtml(code, r.assessment.constraints, { preview: true }));
  });

  /** Conversación entre la persona solicitante y TI/DPD. */
  app.post("/api/derivaciones/:id/comentarios", requireStaff, deps.rateLimit(30, 10 * 60_000), async (req, res) => {
    const who = req.identity!;
    const r = load().find((x) => x.id === req.params.id);
    if (!r || !canSee(r, who)) return res.status(404).json({ error: "Solicitud no encontrada." });
    const text = maskPii(String(req.body?.texto || "").slice(0, 4000)).text.trim();
    if (!text) return res.status(400).json({ error: "Escribe un comentario." });
    const fromRequester = who.user === r.requester;
    r.comments.push({ date: now(), user: who.user, name: who.name, role: fromRequester ? "solicitante" : "revision", text });
    r.updatedAt = now();
    const logs = fromRequester
      ? await notifyStaff(r.recipients, staffMessage(r, "comentario", `Comentario de ${who.name}:\n${text}`), webhookPayload(r, "comentario"))
      : await notifyRequester(r.requesterEmail, {
          subject: `[Taller de Apps IA] Respuesta sobre tu propuesta «${r.appName}»`,
          text: `${who.name} ha comentado tu propuesta «${r.appName}»:\n\n${text}\n\nConsúltala en ${link("/#mis-apps")}`,
        });
    r.notifications.push(...logs);
    save(r);
    res.json(view(r, true));
  });

  /** Resolución por TI / DPD. */
  app.post("/api/derivaciones/:id/estado", requireReviewer, async (req, res) => {
    const who = req.identity!;
    const r = load().find((x) => x.id === req.params.id);
    if (!r) return res.status(404).json({ error: "Solicitud no encontrada." });
    if (r.requester === who.user) return res.status(403).json({ error: "No puedes resolver tus propias solicitudes." });
    const status = req.body?.estado as RequestStatus;
    if (!(status in REQUEST_STATUS_LABEL) || status === "recibida") return res.status(400).json({ error: "Estado no válido." });
    const comment = maskPii(String(req.body?.comentario || "").slice(0, 4000)).text.trim();
    if ((status === "rechazada" || status === "proyecto_ti") && !comment) return res.status(400).json({ error: "Explica la decisión a la persona solicitante." });

    let published: Publication | undefined;
    if (status === "aprobada" && req.body?.publicar === true) {
      const code = codeOf(r);
      if (!code) return res.status(400).json({ error: "No hay prototipo que publicar." });
      if (r.assessment.level === "no_permitido") return res.status(400).json({ error: "Una propuesta no permitida no puede publicarse desde la plataforma." });
      if (r.assessment.level === "alto" && req.body?.confirmacionRiesgoAlto !== true) {
        return res.status(400).json({ error: "Confirma que se usará con datos ficticios o que existen EIPD/evaluación de impacto aprobadas." });
      }
      published = {
        id: publications.newId(r.appName),
        name: r.appName,
        owner: r.requester,
        ownerName: r.requesterName,
        department: r.department,
        audience: r.answers.audience,
        members: [],
        answers: r.answers,
        assessment: r.assessment,
        version: 1,
        status: "publicada",
        externalAccess: r.answers.audience === "publico" ? "solicitado" : "no_aplica",
        createdAt: now(),
        updatedAt: now(),
        reviewBy: addMonths(new Date(), REVIEW_PERIOD_MONTHS).toISOString(),
        approvedBy: who.user,
        history: [{ date: now(), user: who.user, action: "Publicada por TI/DPD", comment: `Solicitud ${r.id}` }],
        ownerEmail: r.requesterEmail,
        workflow: r.workflow,
        scheduleActive: r.workflow ? true : undefined,
        nextRunAt: null,
      };
      scheduleNext(published);
      publications.save(published, code);
      r.publicationId = published.id;
    }

    r.status = status;
    r.updatedAt = now();
    r.history.push({ date: now(), user: who.user, action: `${REQUEST_STATUS_LABEL[status]}${published ? " y publicada" : ""}` });
    if (comment) r.comments.push({ date: now(), user: who.user, name: who.name, role: "revision", text: comment });
    r.notifications.push(
      ...(await notifyRequester(r.requesterEmail, {
        subject: `[Taller de Apps IA] Tu propuesta «${r.appName}»: ${REQUEST_STATUS_LABEL[status]}`,
        text: `Estado de tu propuesta «${r.appName}»: ${REQUEST_STATUS_LABEL[status]}.${comment ? `\n\n${who.name}: ${comment}` : ""}${
          published ? `\n\nYa está publicada: ${link(`/apps/${published.id}`)}` : ""
        }\n\nConsúltala en ${link("/#mis-apps")}`,
      })),
    );
    save(r);
    deps.audit(`derivacion_${status}`, r.answers, r.assessment, { id: r.id, revisor: who.user, publicada: !!published });
    res.json(view(r, true));
  });
}
