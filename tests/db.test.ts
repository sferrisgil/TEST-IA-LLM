import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import * as db from "../server/db";
import { assess, emptyAnswers, type Answers } from "../shared/policy";
import { hardenHtml, scanCode } from "../shared/codeScan";

db._useDatabase(new Database(":memory:"));

const answers = (p: Partial<Answers>): Answers => ({ ...emptyAnswers(), ...p });
const shared = (user: string, scope = "app:a") => ({ scope, user, dbScope: "compartida" as const });
const personal = (user: string, scope = "app:p") => ({ scope, user, dbScope: "personal" as const });

test("guardar, obtener, actualizar y borrar", () => {
  const r = db.save(shared("ana"), "incidencias", { titulo: "Gotera en sala 2", estado: "abierta" });
  assert.ok(r.id);
  assert.equal(r._autor, "ana");
  const upd = db.save(shared("luis"), "incidencias", { ...r, estado: "cerrada" });
  assert.equal(upd.id, r.id);
  assert.equal(db.get(shared("ana"), "incidencias", r.id).estado, "cerrada");
  assert.equal(db.remove(shared("ana"), "incidencias", r.id).borrados, 1);
  assert.equal(db.get(shared("ana"), "incidencias", r.id), null);
});

test("las apps no ven datos de otras apps", () => {
  db.save(shared("ana", "app:uno"), "c", { x: "secreto" });
  assert.equal(db.list(shared("ana", "app:dos"), "c").total, 0);
});

test("modo personal: cada persona solo ve y modifica lo suyo", () => {
  const r = db.save(personal("ana"), "agenda", { cita: "Médico" });
  db.save(personal("luis"), "agenda", { cita: "Reunión" });
  assert.deepEqual(db.list(personal("ana"), "agenda").registros.map((x) => x.cita), ["Médico"]);
  assert.equal(db.get(personal("luis"), "agenda", r.id), null);
  // Intentar sobrescribir el registro de otra persona crea uno nuevo propio.
  const hijack = db.save(personal("luis"), "agenda", { id: r.id, cita: "cambiado" });
  assert.notEqual(hijack.id, r.id);
  assert.equal(db.get(personal("ana"), "agenda", r.id).cita, "Médico");
  assert.equal(db.remove(personal("luis"), "agenda", r.id).borrados, 0);
});

test("búsqueda sin tildes ni mayúsculas, filtros, orden y paginación", () => {
  const ctx = shared("ana", "app:busqueda");
  db.save(ctx, "inv", { nombre: "Grapadora", ubicacion: "Almacén", cantidad: 12, activo: true });
  db.save(ctx, "inv", { nombre: "Tóner impresora", ubicacion: "Planta 2", cantidad: 3, activo: true });
  db.save(ctx, "inv", { nombre: "Grapas", ubicacion: "Almacén", cantidad: 40, activo: false });
  assert.equal(db.list(ctx, "inv", { buscar: "TONER" }).total, 1);
  assert.equal(db.list(ctx, "inv", { buscar: "almacen grap" }).total, 2);
  assert.equal(db.list(ctx, "inv", { filtros: { activo: true } }).total, 2);
  assert.deepEqual(db.list(ctx, "inv", { orden: "cantidad" }).registros.map((x) => x.cantidad), [3, 12, 40]);
  assert.deepEqual(db.list(ctx, "inv", { orden: "cantidad", descendente: true, limite: 1, desde: 1 }).registros.map((x) => x.cantidad), [12]);
  assert.equal(db.list(ctx, "inv", { buscar: "100%" }).total, 0);
});

test("rechaza intentos de inyección y operaciones no permitidas", () => {
  const ctx = shared("ana", "app:seguro");
  db.save(ctx, "c", { a: 1 });
  assert.throws(() => db.list(ctx, "c'; DROP TABLE registros; --"), db.DbError);
  assert.throws(() => db.list(ctx, "c", { filtros: { "a') OR 1=1 --": 1 } }), db.DbError);
  assert.throws(() => db.list(ctx, "c", { orden: "a; DROP TABLE registros" }), db.DbError);
  assert.throws(() => db.execute(ctx, "sql", ["SELECT * FROM registros"]), db.DbError);
  assert.equal(db.list(ctx, "c", { buscar: "' OR '1'='1" }).total, 0);
  assert.equal(db.list(ctx, "c").total, 1);
});

test("límite de tamaño por registro", () => {
  assert.throws(() => db.save(shared("ana"), "c", { texto: "x".repeat(70_000) }), db.DbError);
});

test("purga por plazo de conservación y de datos de prueba", () => {
  const ctx = shared("ana", "app:purga");
  db.save(ctx, "c", { a: 1 });
  db.save(shared("ana", "prueba:ana"), "c", { a: 1 });
  assert.equal(db.purge([{ scope: "app:purga", days: 30 }]), 0);
  // Simulamos registros antiguos cambiando el reloj.
  const realNow = Date.now;
  Date.now = () => realNow() + 40 * 86_400_000;
  try {
    assert.equal(db.purge([{ scope: "app:purga", days: 30 }]), 2);
  } finally {
    Date.now = realNow;
  }
  assert.equal(db.stats("app:purga").registros, 0);
});

test("evaluación: base de datos con datos personales es riesgo medio y restringe la app a BaseDatos", () => {
  const a = assess(answers({ data: ["contacto"], storage: "base_datos", audience: "departamento", origin: ["propios"], retention: "limitada", retentionDays: 90 }));
  assert.equal(a.level, "medio");
  assert.equal(a.constraints.storage, "bd");
  assert.equal(a.constraints.retentionDays, 90);
  assert.equal(assess(answers({ data: ["internos"], storage: "base_datos", retention: "indefinida" })).constraints.retentionDays, null);
});

test("revisión de código: BaseDatos solo si está autorizada; localStorage no con base de datos", () => {
  const bd = assess(answers({ data: ["internos"], storage: "base_datos" })).constraints;
  const nav = assess(answers({ data: ["internos"], storage: "navegador" })).constraints;
  const code = "<script>BaseDatos.guardar('c', {a:1})</script>";
  assert.ok(!scanCode(code, bd).some((f) => f.severity === "bloqueante"));
  assert.ok(scanCode(code, nav).some((f) => f.rule === "bd-no-autorizada"));
  assert.ok(scanCode("<script>localStorage.x=1</script>", bd).some((f) => f.severity === "bloqueante"));
  assert.match(hardenHtml("<html><head></head><body></body></html>", bd), /window\.BaseDatos/);
  assert.doesNotMatch(hardenHtml("<html><head></head><body></body></html>", nav), /window\.BaseDatos/);
});
