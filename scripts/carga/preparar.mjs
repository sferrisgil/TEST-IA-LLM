// Prepara datos para la prueba de carga: publica una app con base de datos y
// carga N registros. Uso (con el servidor en producción y AUTH_MODE=proxy):
//   node scripts/carga/preparar.mjs http://localhost:3000 20000
const BASE = process.argv[2] || "http://localhost:3000";
const N = Number(process.argv[3]) || 20000;
const H = { "Content-Type": "application/json", "X-Remote-User": "prueba.carga", "X-Remote-Groups": "plantilla", "X-Remote-Department": "TI" };

const respuestas = {
  appName: "Prueba de carga", description: "App sintética para medir el rendimiento", data: ["internos"], origin: ["propios"],
  audience: "personal", storage: "base_datos", retention: "indefinida",
};
const codigo = '<!doctype html><html><head><title>carga</title></head><body><p>Borrar todos los datos</p><script>BaseDatos.listar("c")</script></body></html>';
const r = await fetch(`${BASE}/api/publicaciones`, { method: "POST", headers: H, body: JSON.stringify({ respuestas, codigo, compromisosAceptados: true }) });
const j = await r.json();
if (!r.ok) throw new Error(JSON.stringify(j));
const id = j.publicacion.id;
const words = ["grapadora", "toner", "papel", "silla", "mesa", "lampara", "cable", "monitor", "teclado", "raton"];
const t0 = Date.now();
let batch = [];
for (let i = 0; i < N; i++) {
  const registro = { nombre: `${words[i % 10]} ${i}`, ubicacion: `Planta ${i % 7}`, cantidad: i % 50, notas: "Registro de prueba con algo de texto descriptivo." };
  batch.push(fetch(`${BASE}/api/apps/${id}/plataforma`, { method: "POST", headers: H, body: JSON.stringify({ servicio: "bd", op: "guardar", args: ["inventario", registro] }) }));
  if (batch.length === 50) { await Promise.all(batch); batch = []; }
}
await Promise.all(batch);
console.log(JSON.stringify({ app: id, registros: N, segundos: (Date.now() - t0) / 1000 }));
