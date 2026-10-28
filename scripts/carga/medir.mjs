// Mide peticiones por segundo y latencias de las operaciones principales.
//   node scripts/carga/medir.mjs http://localhost:3000 <id-app> [conexiones] [segundos]
// Arranca el servidor con RATE_LIMIT_FACTOR alto para que no limite la prueba.
import autocannon from "autocannon";
const [BASE = "http://localhost:3000", id, conns = "50", secs = "10"] = process.argv.slice(2);
if (!id) throw new Error("Indica el id de la app creada con preparar.mjs");
const headers = { "content-type": "application/json", "x-remote-user": "prueba.carga", "x-remote-groups": "plantilla", "x-remote-department": "TI" };
const bd = (op, args) => JSON.stringify({ servicio: "bd", op, args });
const tests = [
  ["Catálogo (búsqueda)", { method: "GET", path: "/api/publicaciones/catalogo?buscar=prueba" }],
  ["Abrir app publicada", { method: "GET", path: `/apps/${id}/contenido` }],
  ["BD: listar 50", { method: "POST", path: `/api/apps/${id}/plataforma`, body: bd("listar", ["inventario", { limite: 50 }]) }],
  ["BD: búsqueda de texto", { method: "POST", path: `/api/apps/${id}/plataforma`, body: bd("listar", ["inventario", { buscar: "toner planta 3", limite: 50 }]) }],
  ["BD: filtro por campo", { method: "POST", path: `/api/apps/${id}/plataforma`, body: bd("listar", ["inventario", { filtros: { cantidad: 7 }, limite: 50 }]) }],
  ["BD: guardar", { method: "POST", path: `/api/apps/${id}/plataforma`, body: bd("guardar", ["inventario", { nombre: "nuevo", cantidad: 1 }]) }],
];
for (const [name, req] of tests) {
  const r = await autocannon({ url: BASE, connections: Number(conns), duration: Number(secs), headers, requests: [req] });
  console.log(`${name.padEnd(24)} ${String(Math.round(r.requests.average)).padStart(6)} pet/s   p50 ${String(r.latency.p50).padStart(4)} ms   p99 ${String(r.latency.p99).padStart(5)} ms   errores ${r.errors + r.non2xx}`);
}
