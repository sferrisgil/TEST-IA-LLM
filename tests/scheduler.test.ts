import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

// Almacén en una carpeta temporal (debe fijarse antes de cargar los módulos).
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "taller-prog-"));

test("el programador ejecuta las automatizaciones vencidas y reprograma la siguiente", async () => {
  const { store } = await import("../server/store");
  const db = await import("../server/db");
  const { runDue } = await import("../server/automations");
  const { assess, emptyAnswers } = await import("../shared/policy");
  const answers = { ...emptyAnswers(), appKind: "automatizacion" as const, data: ["internos" as const], storage: "base_datos" as const };
  const a = assess(answers);
  const base = {
    owner: "ana", ownerName: "Ana", department: "SG", audience: "equipo" as const, members: [], answers, assessment: a, version: 1,
    externalAccess: "no_aplica" as const, createdAt: "", updatedAt: "", reviewBy: "2999-01-01", history: [], scheduleActive: true,
    workflow: { programacion: { tipo: "diaria" as const, hora: "08:00" }, pasos: [{ tipo: "crear" as const, coleccion: "log", registro: { hecho: "{{hoy}}" } }] },
  };
  store.save({ ...base, id: "vencida", name: "Vencida", status: "publicada", nextRunAt: new Date(Date.now() - 60_000).toISOString() });
  store.save({ ...base, id: "futura", name: "Futura", status: "publicada", nextRunAt: new Date(Date.now() + 3_600_000).toISOString() });
  store.save({ ...base, id: "pausada", name: "Pausada", status: "publicada", scheduleActive: false, nextRunAt: new Date(Date.now() - 60_000).toISOString() });
  store.save({ ...base, id: "pendiente", name: "Pendiente", status: "pendiente", nextRunAt: new Date(Date.now() - 60_000).toISOString() });

  const deps = { audit: () => {}, rateLimit: () => () => {}, models: () => [], askAi: async () => "" };
  const runs = await Promise.all(runDue(deps as never));
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.estado, "ok");
  assert.equal(db.stats("app:vencida").registros, 1);
  assert.equal(db.stats("app:pausada").registros, 0);
  assert.equal(db.listRuns("vencida")[0].estado, "ok");
  // Se ha calculado la próxima ejecución (mañana a las 08:00).
  assert.ok(new Date(store.get("vencida")!.nextRunAt!) > new Date());
  // Una segunda pasada no vuelve a ejecutarla.
  assert.equal(runDue(deps as never).length, 0);
});
