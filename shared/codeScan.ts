/**
 * Revisión automática del código que genera la IA y blindaje de la app.
 *
 * Dos capas complementarias:
 *  1. scanCode(): busca patrones peligrosos y los explica en lenguaje claro.
 *  2. hardenHtml(): inserta una política de seguridad de contenido (CSP) que el
 *     navegador hace cumplir aunque el escáner no detecte algo.
 */

import type { GenerationConstraints } from "./policy";
import { detectPii } from "./pii";

export type Severity = "bloqueante" | "aviso";

export interface ScanFinding {
  severity: Severity;
  rule: string;
  message: string;
}

interface Rule {
  id: string;
  severity: Severity | ((c: GenerationConstraints) => Severity | null);
  pattern: RegExp;
  message: string;
}

const RULES: Rule[] = [
  { id: "script-externo", severity: "bloqueante", pattern: /<script[^>]+src\s*=\s*["']?(?:https?:)?\/\//i, message: "Carga código de un servidor externo." },
  { id: "estilo-externo", severity: "bloqueante", pattern: /<link[^>]+href\s*=\s*["']?(?:https?:)?\/\//i, message: "Carga recursos (estilos o fuentes) de un servidor externo." },
  { id: "import-externo", severity: "bloqueante", pattern: /import\s*(?:[^'"]*from\s*)?["'](?:https?:)?\/\//i, message: "Importa módulos de internet." },
  { id: "red-fetch", severity: "bloqueante", pattern: /\bfetch\s*\(/, message: "Intenta conectarse a un servidor (fetch)." },
  { id: "red-xhr", severity: "bloqueante", pattern: /\bXMLHttpRequest\b/, message: "Intenta conectarse a un servidor (XMLHttpRequest)." },
  { id: "red-socket", severity: "bloqueante", pattern: /\b(?:WebSocket|EventSource|RTCPeerConnection)\b/, message: "Abre una conexión de red en tiempo real." },
  { id: "red-beacon", severity: "bloqueante", pattern: /\bsendBeacon\b/, message: "Envía datos en segundo plano (sendBeacon)." },
  { id: "form-externo", severity: "bloqueante", pattern: /<form[^>]+action\s*=\s*["']?(?:https?:)?\/\//i, message: "Un formulario envía datos a un servidor externo." },
  { id: "imagen-externa", severity: "aviso", pattern: /<(?:img|iframe|video|audio|source)[^>]+src\s*=\s*["']?(?:https?:)?\/\//i, message: "Usa imágenes o contenidos externos (se bloquearán)." },
  { id: "eval", severity: "bloqueante", pattern: /\beval\s*\(|\bnew\s+Function\s*\(|set(?:Timeout|Interval)\s*\(\s*["'`]/, message: "Ejecuta texto como código (eval), una vía habitual de ataques." },
  { id: "cookies", severity: "bloqueante", pattern: /document\.cookie/, message: "Accede a cookies." },
  { id: "padre", severity: "bloqueante", pattern: /\b(?:window\.)?(?:parent|top|opener)\.(?!postMessage)/, message: "Intenta acceder a la plataforma que la contiene." },
  { id: "ventanas", severity: "aviso", pattern: /\bwindow\.open\s*\(/, message: "Abre ventanas nuevas." },
  { id: "geolocalizacion", severity: "bloqueante", pattern: /navigator\.geolocation/, message: "Pide la ubicación del usuario." },
  { id: "camara", severity: "bloqueante", pattern: /getUserMedia|getDisplayMedia/, message: "Pide acceso a cámara, micrófono o pantalla." },
  { id: "service-worker", severity: "bloqueante", pattern: /serviceWorker\.register/, message: "Instala procesos en segundo plano." },
  {
    id: "almacenamiento-local",
    severity: (c) => (c.storage === "local" ? null : "bloqueante"),
    pattern: /\blocalStorage\b|\bindexedDB\b/,
    message: "Guarda datos de forma permanente en el navegador, y la evaluación no lo permite.",
  },
  {
    id: "almacenamiento-sesion",
    severity: (c) => (c.storage === "ninguno" ? "bloqueante" : null),
    pattern: /\bsessionStorage\b/,
    message: "Guarda datos en el navegador, y la evaluación no lo permite.",
  },
  {
    id: "bd-no-autorizada",
    severity: (c) => (c.storage === "bd" ? null : "bloqueante"),
    pattern: /BaseDatos\s*\.\s*(?:guardar|obtener|listar|borrar|vaciar|colecciones)/,
    message: "Usa la base de datos municipal, pero la evaluación no lo autoriza.",
  },
  {
    id: "ia-no-autorizada",
    severity: (c) => (c.ai ? null : "bloqueante"),
    pattern: /IAMunicipal\s*\.\s*preguntar/,
    message: "Usa el asistente de IA, pero la evaluación no lo autoriza.",
  },
];

export function scanCode(html: string, constraints: GenerationConstraints): ScanFinding[] {
  const out: ScanFinding[] = [];
  // Quitamos el bloque que inyecta la propia plataforma antes de revisar.
  const code = html.replace(/<!--plataforma:inicio-->[\s\S]*?<!--plataforma:fin-->/g, "");

  for (const r of RULES) {
    if (!r.pattern.test(code)) continue;
    const severity = typeof r.severity === "function" ? r.severity(constraints) : r.severity;
    if (severity) out.push({ severity, rule: r.id, message: r.message });
  }

  // Datos personales reales escritos dentro del código.
  const pii = detectPii(code).filter((f) => f.kind !== "palabra_clave" && f.kind !== "fecha" && f.kind !== "cif");
  for (const f of pii) {
    out.push({
      severity: f.kind === "credencial" ? "bloqueante" : "aviso",
      rule: `dato-${f.kind}`,
      message: `El código contiene ${f.count} posible(s) dato(s) de tipo "${f.label}". Comprueba que son ficticios.`,
    });
  }

  if (constraints.deleteButton && !/borrar|eliminar|vaciar|limpiar/i.test(code)) {
    out.push({ severity: "aviso", rule: "boton-borrar", message: "No se encuentra el botón para borrar los datos." });
  }
  if (constraints.privacyNotice && !/privacidad|protecci[oó]n de datos/i.test(code)) {
    out.push({ severity: "aviso", rule: "aviso-privacidad", message: "No se encuentra el aviso de privacidad." });
  }
  if (constraints.syntheticDataOnly && !/ficticio|prototipo/i.test(code)) {
    out.push({ severity: "aviso", rule: "aviso-prototipo", message: "No se encuentra el aviso de \"solo datos ficticios\"." });
  }
  return out;
}

export const APP_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'";

/**
 * Puentes con la plataforma (IA y base de datos): solo funcionan dentro de
 * ella. La app envía un mensaje a la ventana que la contiene (vista previa o
 * visor) y esta reenvía la petición al servidor, que aplica los permisos.
 */
function platformBridge(c: GenerationConstraints): string {
  if (!c.ai && c.storage !== "bd") return "";
  return `
<script>
(function(){
  var pending = {}; var n = 0;
  window.addEventListener('message', function(e){
    var d = e.data || {};
    if (d.tipo !== 'plataforma-respuesta' || !pending[d.id]) return;
    var p = pending[d.id]; delete pending[d.id];
    d.error ? p.reject(new Error(d.error)) : p.resolve(d.resultado);
  });
  function llamar(servicio, op, args){
    return new Promise(function(resolve, reject){
      if (window.parent === window) { reject(new Error('Solo disponible dentro de la plataforma municipal.')); return; }
      var id = 'p' + (++n);
      pending[id] = { resolve: resolve, reject: reject };
      window.parent.postMessage({ tipo: 'plataforma', servicio: servicio, id: id, op: op, args: args }, '*');
      setTimeout(function(){ if (pending[id]) { delete pending[id]; reject(new Error('Tiempo de espera agotado')); } }, 60000);
    });
  }${
    c.ai
      ? `
  window.IAMunicipal = {
    preguntar: function(texto){ return llamar('ia', 'preguntar', [String(texto).slice(0, 8000)]); }
  };`
      : ""
  }${
    c.storage === "bd"
      ? `
  window.BaseDatos = {
    guardar: function(coleccion, registro){ return llamar('bd', 'guardar', [coleccion, registro]); },
    obtener: function(coleccion, id){ return llamar('bd', 'obtener', [coleccion, id]); },
    listar: function(coleccion, opciones){ return llamar('bd', 'listar', [coleccion, opciones || {}]); },
    borrar: function(coleccion, id){ return llamar('bd', 'borrar', [coleccion, id]); },
    vaciar: function(coleccion){ return llamar('bd', 'vaciar', [coleccion]); },
    colecciones: function(){ return llamar('bd', 'colecciones', []); }
  };`
      : ""
  }
})();
</script>`;
}

/**
 * En la vista previa (iframe aislado) el navegador no da acceso a
 * localStorage/sessionStorage. Lo sustituimos por un almacén en memoria.
 */
const PREVIEW_STORAGE_SHIM = `
<script>
(function(){
  function mem(){ var s = {}; return {
    getItem: function(k){ return Object.prototype.hasOwnProperty.call(s, k) ? s[k] : null; },
    setItem: function(k, v){ s[k] = String(v); },
    removeItem: function(k){ delete s[k]; },
    clear: function(){ s = {}; },
    key: function(i){ return Object.keys(s)[i] || null; },
    get length(){ return Object.keys(s).length; }
  }; }
  ['localStorage', 'sessionStorage'].forEach(function(name){
    try { window[name].length; } catch (e) {
      try { Object.defineProperty(window, name, { value: mem(), configurable: true }); } catch (e2) {}
    }
  });
})();
</script>`;

/**
 * Apps publicadas: se ejecutan aisladas (sin acceso al almacenamiento del
 * servidor). El visor de la plataforma les pasa sus datos guardados en el
 * fragmento de la URL (que nunca viaja al servidor) y recibe los cambios por
 * mensajes, guardándolos en el navegador de la persona usuaria, por app.
 */
const PUBLISHED_STORAGE_SHIM = `
<script>
(function(){
  var initial = {};
  try {
    var h = location.hash.slice(1);
    if (h) initial = JSON.parse(decodeURIComponent(escape(atob(h)))) || {};
  } catch (e) { initial = {}; }
  function mem(data, persist){
    var s = {}; Object.keys(data).forEach(function(k){ s[k] = String(data[k]); });
    function sync(){ if (persist && window.parent !== window) window.parent.postMessage({ tipo: 'almacen', datos: s }, '*'); }
    return {
      getItem: function(k){ return Object.prototype.hasOwnProperty.call(s, k) ? s[k] : null; },
      setItem: function(k, v){ s[k] = String(v); sync(); },
      removeItem: function(k){ delete s[k]; sync(); },
      clear: function(){ s = {}; sync(); },
      key: function(i){ return Object.keys(s)[i] || null; },
      get length(){ return Object.keys(s).length; }
    };
  }
  try { Object.defineProperty(window, 'localStorage', { value: mem(initial, true), configurable: true }); } catch (e) {}
  try { Object.defineProperty(window, 'sessionStorage', { value: mem({}, false), configurable: true }); } catch (e) {}
})();
</script>`;

/**
 * Inserta la CSP (y, si procede, el puente de IA) al principio del <head>.
 * Debe aplicarse siempre: en la vista previa, en la app publicada y en el
 * fichero descargado.
 */
export function hardenHtml(
  html: string,
  constraints: GenerationConstraints,
  opts: { preview?: boolean; published?: boolean } = {},
): string {
  let doc = html.replace(/<!--plataforma:inicio-->[\s\S]*?<!--plataforma:fin-->/g, "");
  // Eliminamos cualquier CSP o <base> que haya escrito la IA: manda la nuestra.
  doc = doc.replace(/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy[^>]*>/gi, "");
  doc = doc.replace(/<base\b[^>]*>/gi, "");
  if (!/<html[\s>]/i.test(doc)) doc = `<!doctype html><html lang="es"><head></head><body>${doc}</body></html>`;
  if (!/<head[\s>]/i.test(doc)) doc = doc.replace(/<html([^>]*)>/i, "<html$1><head></head>");

  const block =
    `<!--plataforma:inicio-->` +
    `<meta http-equiv="Content-Security-Policy" content="${APP_CSP}">` +
    `<meta name="referrer" content="no-referrer">` +
    platformBridge(constraints) +
    (opts.preview && constraints.storage !== "ninguno" ? PREVIEW_STORAGE_SHIM : "") +
    (opts.published && constraints.storage !== "ninguno" && constraints.storage !== "bd" ? PUBLISHED_STORAGE_SHIM : "") +
    `<!--plataforma:fin-->`;
  return doc.replace(/<head([^>]*)>/i, `<head$1>${block}`);
}

/** Extrae el HTML de una respuesta del modelo aunque venga envuelto en ```html. */
export function extractHtml(text: string): string {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/<!doctype html|<html/i);
  return start >= 0 ? body.slice(start) : body;
}
