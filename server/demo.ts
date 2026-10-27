/**
 * Modo demostración: se usa cuando no hay clave de IA configurada, para poder
 * probar todo el flujo (cuestionario, evaluación, revisión, vista previa).
 */
import type { Answers, Assessment } from "../shared/policy";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function demoClarify(description: string) {
  const first = description.split(/[.\n,]/)[0].replace(/^(quiero|necesito|me gustaría)\s+(una\s+)?(app|aplicación)\s+(para\s+)?/i, "").split(/\s+/).slice(0, 5).join(" ");
  return {
    nombre: first ? first.charAt(0).toUpperCase() + first.slice(1) : "Mi aplicación",
    finalidad: "Facilitar una tarea del día a día del servicio.",
    preguntas: [
      "¿Qué información quieres apuntar en cada registro (campos)?",
      "¿Necesitas buscar o filtrar los registros? ¿Por qué campo?",
      "¿Quieres poder exportar los datos a una hoja de cálculo (CSV)?",
      "¿Hay algún cálculo o recuento que deba hacer la aplicación?",
    ],
  };
}

export function demoApp(answers: Answers, a: Assessment, instruction: string) {
  const c = a.constraints;
  const name = esc(answers.appName || "Mi aplicación");
  const store =
    c.storage === "local" ? "localStorage" : c.storage === "sesion" ? "sessionStorage" : null;

  const aiCode = c.ai
    ? `var r = document.getElementById('resumir');
  r.onclick = async function () {
    var out = document.getElementById('ia'); out.textContent = 'Pensando…';
    try { out.textContent = await window.IAMunicipal.preguntar('Resume: ' + items.map(function (x) { return x.titulo; }).join('; ')); }
    catch (e) { out.textContent = e.message; }
  };`
    : "";

  const script =
    c.storage === "bd"
      ? `  var items = [];
  var q = document.getElementById('buscar');
  async function cargar() {
    try {
      var r = await BaseDatos.listar('registros', { buscar: q.value, limite: 100 });
      items = r.registros; pintar(r.total);
    } catch (e) { alert(e.message); }
  }
  function pintar(total) {
    var ul = document.getElementById('lista'); ul.textContent = '';
    items.forEach(function (it) {
      var li = document.createElement('li');
      li.textContent = it.titulo + (it.notas ? ' — ' + it.notas : '') + ' (' + it._autor + ')';
      var b = document.createElement('button'); b.className = 'sec'; b.textContent = 'Eliminar';
      b.setAttribute('aria-label', 'Eliminar ' + it.titulo);
      b.onclick = async function () { await BaseDatos.borrar('registros', it.id); cargar(); };
      li.appendChild(document.createTextNode(' ')); li.appendChild(b); ul.appendChild(li);
    });
    document.getElementById('n').textContent = total;
  }
  document.getElementById('f').onsubmit = async function (e) {
    e.preventDefault();
    try {
      await BaseDatos.guardar('registros', { titulo: document.getElementById('titulo').value, notas: document.getElementById('notas').value });
      e.target.reset(); cargar();
    } catch (err) { alert(err.message); }
  };
  var t; q.oninput = function () { clearTimeout(t); t = setTimeout(cargar, 250); };
  var bb = document.getElementById('borrar');
  if (bb) bb.onclick = async function () { if (confirm('¿Borrar todos los datos?')) { await BaseDatos.vaciar('registros'); cargar(); } };
  ${aiCode}
  cargar();`
      : `  var KEY = 'app-registros';
  var items = [];
  ${store ? `try { items = JSON.parse(${store}.getItem(KEY) || '[]'); } catch (e) { items = []; }` : ""}
  function guardar() { ${store ? `try { ${store}.setItem(KEY, JSON.stringify(items)); } catch (e) {}` : ""} }
  function pintar() {
    var ul = document.getElementById('lista'); ul.textContent = '';
    items.forEach(function (it, i) {
      var li = document.createElement('li');
      li.textContent = it.titulo + (it.notas ? ' — ' + it.notas : '');
      var b = document.createElement('button'); b.className = 'sec'; b.textContent = 'Eliminar';
      b.setAttribute('aria-label', 'Eliminar ' + it.titulo);
      b.onclick = function () { items.splice(i, 1); guardar(); pintar(); };
      li.appendChild(document.createTextNode(' ')); li.appendChild(b); ul.appendChild(li);
    });
    document.getElementById('n').textContent = items.length;
  }
  document.getElementById('f').onsubmit = function (e) {
    e.preventDefault();
    items.push({ titulo: document.getElementById('titulo').value, notas: document.getElementById('notas').value });
    e.target.reset(); guardar(); pintar();
  };
  var bb = document.getElementById('borrar');
  if (bb) bb.onclick = function () { if (confirm('¿Borrar todos los datos?')) { items = []; guardar(); pintar(); } };
  ${aiCode}
  pintar();`;

  const codigo = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #f6f7f9; color: #1d2433; }
  header { background: #1f4e79; color: #fff; padding: 16px 20px; }
  header h1 { margin: 0; font-size: 1.3rem; }
  main { max-width: 760px; margin: 0 auto; padding: 16px; }
  .card { background: #fff; border-radius: 10px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  label { display: block; font-weight: 600; margin: 8px 0 4px; }
  input, textarea { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #b8c0cc; border-radius: 6px; font: inherit; }
  button { margin-top: 10px; padding: 8px 14px; border-radius: 6px; border: 0; background: #1f4e79; color: #fff; font: inherit; cursor: pointer; }
  button.sec { background: #e7ebf0; color: #1d2433; }
  button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 3px solid #f2a900; outline-offset: 2px; }
  ul { padding-left: 18px; }
  .banner { background: #b00020; color: #fff; text-align: center; padding: 8px; font-weight: 700; position: sticky; top: 0; }
  footer { text-align: center; font-size: .8rem; color: #5b6475; padding: 16px; }
</style>
</head>
<body>
${c.syntheticDataOnly ? '<div class="banner" role="alert">PROTOTIPO – usar solo datos ficticios</div>' : ""}
<header><h1>${name}</h1></header>
<main>
  <section class="card" aria-labelledby="t-nuevo">
    <h2 id="t-nuevo">Nuevo registro</h2>
    <form id="f">
      <label for="titulo">Título</label>
      <input id="titulo" required placeholder="Ej.: Revisión de material">
      <label for="notas">Notas</label>
      <textarea id="notas" rows="3" placeholder="Detalles…"></textarea>
      <button type="submit">Añadir</button>
    </form>
  </section>
  <section class="card" aria-labelledby="t-lista">
    <h2 id="t-lista">Registros (<span id="n">0</span>)</h2>
    ${c.storage === "bd" ? '<label for="buscar">Buscar</label><input id="buscar" type="search" placeholder="Escribe para buscar en todos los campos">' : ""}
    <ul id="lista"></ul>
    ${c.deleteButton ? '<button class="sec" id="borrar">Borrar todos los datos</button>' : ""}
  </section>
  ${c.ai ? `<section class="card"><h2>Asistente</h2><button id="resumir">Resumir registros con IA</button><p id="ia" aria-live="polite"></p><p><small>Las respuestas de la IA pueden contener errores: revísalas siempre.</small></p></section>` : ""}
  ${c.privacyNotice ? `<section class="card"><h2>Aviso de privacidad</h2><p>Finalidad: ${esc(answers.purpose || "la indicada por el servicio")}. Responsable: ${esc(answers.department || "el Ayuntamiento")}. ${c.storage === "bd" ? `Los datos se guardan en la base de datos municipal${c.retentionDays ? ` y se borran a los ${c.retentionDays} días sin cambios` : ""}` : `Los datos no salen de este navegador${store ? "" : " y se borran al cerrar la página"}`}.</p></section>` : ""}
</main>
<footer>${name} · Responsable: ${esc(answers.owner || "—")} · Creada con el Taller de Apps IA del Ayuntamiento</footer>
<script>
${script}
</script>
</body>
</html>`;

  return {
    resumen:
      "Modo demostración (no hay clave de IA configurada): se ha generado una aplicación de ejemplo con un formulario y un listado que respeta las reglas de tu evaluación." +
      (instruction ? ` Tu petición ("${instruction.slice(0, 120)}") se aplicaría con la IA activada.` : ""),
    codigo,
    sugerencias: ["Añade un campo de fecha", "Permite exportar a CSV", "Añade un buscador"],
  };
}
