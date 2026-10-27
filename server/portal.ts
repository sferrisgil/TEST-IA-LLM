/**
 * Portal interno de aplicaciones: publicación, revisión, catálogo y visor.
 */
import type { Express, Request, Response } from "express";
import { APP_CSP, hardenHtml, scanCode } from "../shared/codeScan";
import { assess, LEVEL_INFO, sanitizeAnswers, type Answers, type Assessment } from "../shared/policy";
import { maskPii } from "../shared/pii";
import {
  addMonths, canAccess, canManage, canPreview, isExpired, parseMembers, publishDecision,
  REVIEW_PERIOD_MONTHS, type Identity, type Publication,
} from "../shared/publishing";
import { requireIdentity, requireReviewer, requireStaff } from "./identity";
import { store } from "./store";

interface Deps {
  audit: (event: string, answers: Answers, a: Assessment, extra?: Record<string, unknown>) => void;
  askAi: (answers: Answers, text: string) => Promise<string>;
  rateLimit: (max: number, windowMs: number) => (req: Request, res: Response, next: () => void) => void;
}

/** Lo que se envía al navegador: nunca el HTML ni más datos de los necesarios. */
function summary(p: Publication, who: Identity) {
  const manage = canManage(p, who);
  return {
    id: p.id,
    nombre: p.name,
    finalidad: p.answers.purpose,
    responsable: p.ownerName,
    departamento: p.department,
    audiencia: p.audience,
    nivel: p.assessment.level,
    version: p.version,
    estado: p.status,
    caducada: isExpired(p),
    revisarAntesDe: p.reviewBy,
    actualizada: p.updatedAt,
    accesoExterno: p.externalAccess,
    url: `/apps/${p.id}`,
    ...(manage ? { miembros: p.members, historial: p.history, propia: p.owner === who.user } : {}),
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function viewerHtml(p: Publication, who: Identity): string {
  const level = LEVEL_INFO[p.assessment.level].label;
  const notice =
    p.status !== "publicada"
      ? `<div class="aviso">Vista de ${p.owner === who.user ? "propietario" : "revisión"}: esta app está <strong>${esc(p.status)}</strong> y no es visible para otras personas.</div>`
      : isExpired(p)
        ? `<div class="aviso">La revisión anual de esta app ha vencido. Su responsable debe confirmar que sigue siendo necesaria.</div>`
        : "";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.name)} · Apps municipales</title>
<style>
  html,body{margin:0;height:100%;font-family:system-ui,sans-serif;background:#f6f7f9;color:#1d2433}
  body{display:flex;flex-direction:column}
  header{background:#1f4e79;color:#fff;padding:8px 16px;display:flex;flex-wrap:wrap;gap:4px 16px;align-items:center;font-size:14px}
  header a{color:#fff}
  header .t{font-weight:600;font-size:16px;flex:1;min-width:200px}
  header small{opacity:.85}
  .aviso{background:#fff4ce;color:#5c4300;padding:6px 16px;font-size:13px}
  iframe{flex:1;border:0;width:100%;background:#fff}
  footer{font-size:12px;color:#5b6475;padding:6px 16px;border-top:1px solid #dde2e8;background:#fff}
</style></head>
<body data-id="${esc(p.id)}" data-usuario="${esc(who.user)}" data-ia="${p.assessment.constraints.ai ? "1" : ""}" data-almacen="${esc(p.assessment.constraints.storage)}">
<header>
  <span class="t">${esc(p.name)}</span>
  <small>v${p.version} · ${esc(level)} · Responsable: ${esc(p.ownerName)} (${esc(p.department)})</small>
  <a href="/#catalogo">Catálogo de apps</a>
</header>
${notice}
<iframe id="app" title="${esc(p.name)}" sandbox="allow-scripts allow-forms allow-modals allow-downloads" referrerpolicy="no-referrer"></iframe>
<footer>Aplicación creada por personal municipal con el Taller de Apps IA. No introduzcas datos que no sean necesarios.${
    p.assessment.constraints.ai ? " Usa IA: revisa siempre sus respuestas." : ""
  }</footer>
<script src="/portal/visor.js"></script>
</body></html>`;
}

/** Script del visor: carga la app aislada y hace de puente (datos e IA). */
const VIEWER_JS = `(function(){
  var b = document.body, id = b.dataset.id, frame = document.getElementById('app');
  var key = 'app-datos:' + id + ':' + b.dataset.usuario;
  var persist = b.dataset.almacen === 'local';
  var initial = '';
  if (persist) { try { initial = localStorage.getItem(key) || ''; } catch (e) {} }
  var hash = initial ? '#' + btoa(unescape(encodeURIComponent(initial))) : '';
  frame.src = '/apps/' + encodeURIComponent(id) + '/contenido' + hash;
  window.addEventListener('message', function(e){
    if (e.source !== frame.contentWindow) return;
    var d = e.data || {};
    if (d.tipo === 'almacen' && persist) {
      try {
        var json = JSON.stringify(d.datos || {});
        if (json.length > 2000000) return;
        localStorage.setItem(key, json);
      } catch (err) {}
    }
    if (d.tipo === 'ia-pregunta' && typeof d.id === 'string') {
      var reply = function(m){ m.tipo = 'ia-respuesta'; m.id = d.id; e.source.postMessage(m, '*'); };
      if (!b.dataset.ia) return reply({ error: 'Esta aplicación no está autorizada a usar IA.' });
      fetch('/api/apps/' + encodeURIComponent(id) + '/ia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: String(d.texto || '') })
      }).then(function(r){ return r.json().then(function(j){ if (!r.ok) throw new Error(j.error); reply({ texto: j.texto }); }); })
        .catch(function(err){ reply({ error: err.message || 'Error del asistente' }); });
    }
  });
})();`;

export function registerPortal(app: Express, deps: Deps) {
  const now = () => new Date().toISOString();

  // --- Publicar (nueva app o nueva versión) -------------------------------
  app.post("/api/publicaciones", requireStaff, deps.rateLimit(20, 10 * 60_000), (req, res) => {
    const who = req.identity!;
    const answers = sanitizeAnswers(req.body?.respuestas);
    const a = assess(answers);
    const decision = publishDecision(answers, a);
    if (!decision.allowed) return res.status(403).json({ error: decision.reasons[0] });
    if (req.body?.compromisosAceptados !== true) return res.status(400).json({ error: "Debes aceptar los compromisos de uso." });

    const code = typeof req.body?.codigo === "string" ? req.body.codigo.slice(0, 500_000) : "";
    if (!code.trim()) return res.status(400).json({ error: "No hay aplicación que publicar." });
    // El servidor vuelve a revisar el código: no se confía en el navegador.
    const findings = scanCode(code, a.constraints);
    if (findings.some((f) => f.severity === "bloqueante")) {
      return res.status(422).json({ error: "La revisión de seguridad ha encontrado problemas graves. Corrígelos antes de publicar.", hallazgos: findings });
    }

    const members = parseMembers(req.body?.miembros);
    if (answers.audience === "equipo" && members.length === 0) {
      return res.status(400).json({ error: "Indica los usuarios de tu equipo que podrán usarla." });
    }

    const existingId = typeof req.body?.id === "string" ? req.body.id : "";
    let p = existingId ? store.get(existingId) : undefined;
    if (existingId && !p) return res.status(404).json({ error: "La aplicación no existe." });
    if (p && p.owner !== who.user) return res.status(403).json({ error: "Solo su responsable puede publicar nuevas versiones." });

    const status = decision.needsReview ? "pendiente" : "publicada";
    const entry = {
      date: now(),
      user: who.user,
      action: p ? `Nueva versión ${p.version + 1}` : "Creación",
      comment: decision.needsReview ? "Enviada a revisión" : "Publicada automáticamente (riesgo bajo)",
    };
    p = {
      id: p?.id || store.newId(answers.appName || "app"),
      name: answers.appName || "Aplicación sin nombre",
      owner: who.user,
      ownerName: who.name,
      department: who.department || answers.department,
      audience: answers.audience,
      members,
      answers: { ...answers, owner: who.name },
      assessment: a,
      version: (p?.version || 0) + 1,
      status,
      externalAccess: answers.audience === "publico" ? "solicitado" : "no_aplica",
      createdAt: p?.createdAt || now(),
      updatedAt: now(),
      reviewBy: addMonths(new Date(), REVIEW_PERIOD_MONTHS).toISOString(),
      approvedBy: decision.needsReview ? undefined : "automática",
      history: [...(p?.history || []), entry],
    };
    store.save(p, hardenHtml(code, a.constraints));
    deps.audit(status === "publicada" ? "app_publicada" : "app_enviada_revision", answers, a, { id: p.id, version: p.version });
    res.json({ publicacion: summary(p, who), revision: decision });
  });

  // --- Consultas ------------------------------------------------------------
  app.get("/api/publicaciones/catalogo", requireIdentity, (req, res) => {
    const who = req.identity!;
    res.json(
      store
        .all()
        .filter((p) => p.status === "publicada" && !isExpired(p) && canAccess(p, who))
        .map((p) => summary(p, who)),
    );
  });

  app.get("/api/publicaciones/mias", requireStaff, (req, res) => {
    const who = req.identity!;
    res.json(store.all().filter((p) => p.owner === who.user).map((p) => summary(p, who)));
  });

  app.get("/api/publicaciones/revision", requireReviewer, (req, res) => {
    const who = req.identity!;
    res.json(store.all().map((p) => ({ ...summary(p, who), ficha: { respuestas: p.answers, evaluacion: p.assessment } })));
  });

  /** Para editar una app publicada: devuelve respuestas y código a su responsable. */
  app.get("/api/publicaciones/:id/editar", requireStaff, (req, res) => {
    const p = store.get(req.params.id);
    if (!p || p.owner !== req.identity!.user) return res.status(404).json({ error: "No encontrada." });
    res.json({ id: p.id, respuestas: p.answers, codigo: store.html(p), miembros: p.members });
  });

  // --- Revisión (TI / DPD) --------------------------------------------------
  app.post("/api/publicaciones/:id/revision", requireReviewer, (req, res) => {
    const who = req.identity!;
    const p = store.get(req.params.id);
    if (!p) return res.status(404).json({ error: "No encontrada." });
    if (p.owner === who.user) return res.status(403).json({ error: "No puedes revisar tus propias aplicaciones." });
    if (p.status !== "pendiente") return res.status(409).json({ error: "Esta publicación no está pendiente de revisión." });
    const decision = req.body?.decision;
    const comment = maskPii(String(req.body?.comentario || "").slice(0, 2000)).text;
    if (decision !== "aprobar" && decision !== "rechazar") return res.status(400).json({ error: "Decisión no válida." });
    if (decision === "rechazar" && !comment.trim()) return res.status(400).json({ error: "Explica el motivo del rechazo." });
    if (decision === "aprobar" && p.assessment.level === "alto" && req.body?.confirmacionRiesgoAlto !== true) {
      return res.status(400).json({ error: "Para aprobar una app de riesgo alto confirma que se usará solo con datos ficticios o que existe EIPD aprobada." });
    }
    p.status = decision === "aprobar" ? "publicada" : "rechazada";
    p.approvedBy = decision === "aprobar" ? who.user : undefined;
    p.updatedAt = now();
    p.history.push({ date: now(), user: who.user, action: decision === "aprobar" ? "Aprobada" : "Rechazada", comment });
    store.save(p);
    deps.audit(`revision_${decision}`, p.answers, p.assessment, { id: p.id, revisor: who.user });
    res.json(summary(p, who));
  });

  app.post("/api/publicaciones/:id/retirar", requireStaff, (req, res) => {
    const who = req.identity!;
    const p = store.get(req.params.id);
    if (!p || !canManage(p, who)) return res.status(404).json({ error: "No encontrada." });
    p.status = "retirada";
    p.updatedAt = now();
    p.history.push({ date: now(), user: who.user, action: "Retirada", comment: maskPii(String(req.body?.comentario || "").slice(0, 2000)).text });
    store.save(p);
    deps.audit("app_retirada", p.answers, p.assessment, { id: p.id });
    res.json(summary(p, who));
  });

  /** Renovación anual: el responsable confirma que sigue siendo necesaria. */
  app.post("/api/publicaciones/:id/renovar", requireStaff, (req, res) => {
    const who = req.identity!;
    const p = store.get(req.params.id);
    if (!p || p.owner !== who.user) return res.status(404).json({ error: "No encontrada." });
    if (p.status === "retirada" || p.status === "rechazada") return res.status(409).json({ error: "Publica una nueva versión para reactivarla." });
    p.reviewBy = addMonths(new Date(), REVIEW_PERIOD_MONTHS).toISOString();
    p.updatedAt = now();
    p.history.push({ date: now(), user: who.user, action: "Renovada", comment: "El responsable confirma que sigue siendo necesaria" });
    store.save(p);
    res.json(summary(p, who));
  });

  // --- Visor de apps publicadas --------------------------------------------
  function loadForViewer(req: Request, res: Response): Publication | null {
    const p = store.get(req.params.id);
    const who = req.identity!;
    if (!p || !canPreview(p, who)) {
      res.status(404).type("text/plain; charset=utf-8").send("Aplicación no encontrada o sin permiso de acceso.");
      return null;
    }
    const privileged = who.user === p.owner || who.isReviewer;
    if (!privileged && isExpired(p)) {
      res.status(410).type("text/plain; charset=utf-8").send("La revisión anual de esta aplicación ha vencido. Contacta con su responsable.");
      return null;
    }
    return p;
  }

  app.get("/portal/visor.js", (_req, res) => {
    res.type("application/javascript").setHeader("Cache-Control", "no-cache");
    res.send(VIEWER_JS);
  });

  app.get("/apps/:id", requireIdentity, (req, res) => {
    const p = loadForViewer(req, res);
    if (!p) return;
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    res.setHeader("Cache-Control", "no-store");
    res.type("text/html; charset=utf-8").send(viewerHtml(p, req.identity!));
  });

  app.get("/apps/:id/contenido", requireIdentity, (req, res) => {
    const p = loadForViewer(req, res);
    if (!p) return;
    const html = store.html(p);
    if (!html) return res.status(404).send("Contenido no disponible.");
    res.setHeader("Content-Security-Policy", `${APP_CSP}; frame-ancestors 'self'; sandbox allow-scripts allow-forms allow-modals allow-downloads`);
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.type("text/html; charset=utf-8").send(hardenHtml(html, p.assessment.constraints, { published: true }));
  });

  /** IA de las apps publicadas: usa la evaluación guardada, no la del navegador. */
  app.post("/api/apps/:id/ia", requireIdentity, deps.rateLimit(30, 5 * 60_000), async (req, res) => {
    const p = store.get(req.params.id);
    const who = req.identity!;
    if (!p || !canPreview(p, who)) return res.status(404).json({ error: "No encontrada." });
    if (!p.assessment.constraints.ai) return res.status(403).json({ error: "Esta aplicación no está autorizada a usar IA." });
    const q = maskPii(String(req.body?.texto || "").slice(0, 8000));
    if (!q.text.trim()) return res.status(400).json({ error: "Pregunta vacía." });
    try {
      deps.audit("ia_app_publicada", p.answers, p.assessment, { id: p.id, enmascarados: q.replaced });
      res.json({ texto: await deps.askAi(p.answers, q.text) });
    } catch (error) {
      console.error("Error en IA de app publicada:", error);
      res.status(500).json({ error: "El asistente de IA no está disponible." });
    }
  });
}
