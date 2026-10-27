import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import * as db from "../server/db";
import { runWorkflow } from "../server/workflowRunner";
import { describeSteps, nextRun, sanitizeWorkflow, WorkflowError, type Workflow } from "../shared/workflow";

db._useDatabase(new Database(":memory:"));

const ctx = (scope: string, ai: ((i: string, t: string) => Promise<string>) | null = null, humanReview = false) => ({
  db: { scope, user: "ana", dbScope: "compartida" as const },
  ai,
  humanReview,
  runId: "t",
  notify: async () => {},
});

const flow = (pasos: unknown[], programacion: unknown = { tipo: "diaria", hora: "08:00" }) => sanitizeWorkflow({ programacion, pasos }, { ai: true });

test("valida pasos y rechaza los no permitidos", () => {
  assert.throws(() => flow([{ tipo: "ejecutar_codigo", codigo: "process.exit()" }]), WorkflowError);
  assert.throws(() => flow([{ tipo: "listar", coleccion: "a; DROP", guardarEn: "x" }]), WorkflowError);
  assert.throws(() => flow([{ tipo: "listar", coleccion: "c", guardarEn: "__proto__" }]), WorkflowError);
  assert.throws(() => flow([{ tipo: "crear", coleccion: "c", registro: { a: { anidado: 1 } } }]), WorkflowError);
  assert.throws(() => flow([{ tipo: "notificar", mensaje: "x" }], { tipo: "cada", minutos: 1 }), /intervalo/);
  assert.throws(() => sanitizeWorkflow({ programacion: { tipo: "manual" }, pasos: [{ tipo: "ia", instruccion: "x", entrada: "y", guardarEn: "z" }] }, { ai: false }), /IA/);
});

test("calcula la próxima ejecución", () => {
  const base = new Date(2026, 9, 27, 10, 0); // martes 27/10/2026 10:00
  assert.equal(nextRun({ tipo: "diaria", hora: "08:00" }, base)!.getDate(), 28);
  assert.equal(nextRun({ tipo: "diaria", hora: "11:30" }, base)!.getHours(), 11);
  const w = nextRun({ tipo: "semanal", dias: [5], hora: "09:00" }, base)!; // viernes
  assert.equal(w.getDay(), 5);
  assert.equal(nextRun({ tipo: "mensual", dia: 1, hora: "08:00" }, base)!.getMonth(), 10);
  assert.equal(nextRun({ tipo: "cada", minutos: 30 }, base)!.getMinutes(), 30);
  assert.equal(nextRun({ tipo: "manual" }, base), null);
});

test("ejecuta un flujo: listar, condición, IA con opciones y actualizar", async () => {
  const c = ctx("app:wf1", async () => "Categoría: Alumbrado público.");
  db.save(c.db, "avisos", { texto: "Farola fundida en la calle Mayor", estado: "nuevo" });
  db.save(c.db, "avisos", { texto: "Bache", estado: "cerrado" });
  const w = flow([
    { tipo: "listar", coleccion: "avisos", filtros: { estado: "nuevo" }, guardarEn: "nuevos" },
    {
      tipo: "para_cada",
      lista: "nuevos",
      pasos: [
        { tipo: "ia", instruccion: "Clasifica", entrada: "{{item.texto}}", opciones: ["obras", "alumbrado", "limpieza"], guardarEn: "cat" },
        { tipo: "actualizar", coleccion: "avisos", id: "{{item.id}}", cambios: { categoria: "{{cat}}", estado: "clasificado" } },
      ],
    },
    { tipo: "crear", coleccion: "informes", registro: { total: "{{nuevos.length}}", fecha: "{{hoy}}" } },
  ]);
  const r = await runWorkflow(w, c);
  assert.equal(r.estado, "ok");
  assert.equal(r.resumen.ia, 1);
  const done = db.list(c.db, "avisos", { filtros: { estado: "clasificado" } }).registros;
  assert.equal(done.length, 1);
  assert.equal(done[0].categoria, "alumbrado");
  assert.equal(db.list(c.db, "informes").registros[0].total, 1);
});

test("con revisión humana, lo escrito tras usar la IA queda pendiente de revisar", async () => {
  const c = ctx("app:wf2", async () => "resumen", true);
  db.save(c.db, "c", { a: 1 });
  const w = flow([
    { tipo: "listar", coleccion: "c", guardarEn: "l" },
    { tipo: "para_cada", lista: "l", pasos: [{ tipo: "ia", instruccion: "x", entrada: "{{item.a}}", guardarEn: "r" }, { tipo: "actualizar", coleccion: "c", id: "{{item.id}}", cambios: { r: "{{r}}" } }] },
  ]);
  await runWorkflow(w, c);
  assert.equal(db.list(c.db, "c").registros[0]._revision, "pendiente");
});

test("sin autorización de IA, el paso de IA aborta la ejecución", async () => {
  const w: Workflow = { programacion: { tipo: "manual" }, pasos: [{ tipo: "ia", instruccion: "x", entrada: "y", guardarEn: "z" }] };
  const r = await runWorkflow(w, ctx("app:wf3", null));
  assert.equal(r.estado, "error");
});

test("las plantillas no permiten acceder a propiedades internas", async () => {
  const c = ctx("app:wf4");
  await runWorkflow(flow([{ tipo: "crear", coleccion: "c", registro: { x: "{{item.__proto__}}", y: "{{constructor.name}}" } }]), c);
  const rec = db.list(c.db, "c").registros[0];
  assert.equal(rec.x, null);
  assert.equal(rec.y, null);
});

test("límite de operaciones por ejecución", async () => {
  const c = ctx("app:wf5");
  for (let i = 0; i < 500; i++) db.save(c.db, "c", { i });
  const w = flow([
    { tipo: "listar", coleccion: "c", limite: 500, guardarEn: "l" },
    { tipo: "para_cada", lista: "l", pasos: [{ tipo: "para_cada", lista: "l", pasos: [{ tipo: "borrar", coleccion: "otra", id: "{{item.id}}" }] }] },
  ]);
  const r = await runWorkflow(w, c);
  assert.equal(r.estado, "error");
  assert.match(r.error!, /máximo/);
});

test("descripción legible del flujo", () => {
  const lines = describeSteps(flow([{ tipo: "listar", coleccion: "avisos", guardarEn: "l" }, { tipo: "notificar", mensaje: "Hecho" }]).pasos);
  assert.match(lines[0], /Buscar en «avisos»/);
  assert.match(lines[1], /Avisar/);
});
