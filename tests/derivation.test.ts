import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAiAnswers, type AiAnswers, type ModelInfo } from "../shared/aiAct";
import { emptyScale, sanitizeScale, type Scale } from "../shared/derivation";
import { assess, emptyAnswers, type Answers } from "../shared/policy";
import { publishDecision } from "../shared/publishing";

const MODELS: ModelInfo[] = [
  { id: "rapido", name: "Rápido", hosting: "ue", capability: 2, contextTokens: 128000, languages: ["es", "cooficiales", "otros"], personalData: false, cost: 1, available: true },
  { id: "avanzado", name: "Avanzado", hosting: "ue", capability: 3, contextTokens: 1000000, languages: ["es", "cooficiales", "otros"], personalData: false, cost: 3, available: true },
];
const answers = (p: Partial<Answers> = {}, ai: Partial<AiAnswers> = {}, scale: Partial<Scale> = {}): Answers => ({
  ...emptyAnswers(),
  data: ["internos"],
  origin: ["propios"],
  ...p,
  ai: { ...emptyAiAnswers(), tasks: ["resumir"], ...ai },
  scale: { ...emptyScale(), ...scale },
});
const run = (a: Answers) => assess(a, MODELS);

test("app sencilla sin IA ni gran volumen: no se deriva", () => {
  const a = run(answers());
  assert.equal(a.derivation.required, false);
  assert.equal(publishDecision(answers(), a).allowed, true);
});

test("IA de riesgo mínimo con modelo intermedio: no se deriva", () => {
  assert.equal(run(answers({ aiUse: "sin_datos" })).derivation.required, false);
});

test("Reglamento de IA nivel medio (transparencia) → DPD", () => {
  const d = run(answers({ aiUse: "sin_datos" }, { interaction: "empleados", tasks: ["conversar"] })).derivation;
  assert.ok(d.required);
  assert.deepEqual(d.recipients, ["dpd"]);
});

test("Reglamento de IA posible alto riesgo (art. 6.3) → DPD y TI", () => {
  const d = run(answers({ aiUse: "sin_datos" }, { domains: ["empleo"] })).derivation;
  assert.deepEqual(d.recipients, ["dpd", "ti"]);
});

test("modelo demasiado complejo → TI", () => {
  const d = run(answers({ aiUse: "sin_datos" }, { reasoning: "complejo" })).derivation;
  assert.ok(d.required);
  assert.deepEqual(d.recipients, ["ti"]);
  assert.match(d.reasons[0].text, /modelo avanzado/);
});

test("volumen que desborda SQLite → TI", () => {
  for (const scale of [{ dailyOps: "alto" }, { records: "mas_500k" }, { records: "hasta_500k" }, { users: "mas_100" }] as Partial<Scale>[]) {
    const d = run(answers({ storage: "base_datos" }, {}, scale)).derivation;
    assert.ok(d.required, JSON.stringify(scale));
    assert.deepEqual(d.recipients, ["ti"]);
  }
  // Sin base de datos, muchas operaciones en una app normal no se derivan.
  assert.equal(run(answers({}, {}, { dailyOps: "alto" })).derivation.required, false);
});

test("si hay que derivar, no se puede publicar en autoservicio", () => {
  const a = answers({ storage: "base_datos" }, {}, { records: "mas_500k" });
  assert.equal(publishDecision(a, run(a)).allowed, false);
});

test("no permitido: se deriva y además bloquea la construcción", () => {
  const d = run(answers({ data: ["credenciales"] })).derivation;
  assert.ok(d.required);
  assert.ok(d.blocksBuild);
});

test("sanitizeScale descarta valores no válidos", () => {
  assert.deepEqual(sanitizeScale({ users: "millones", records: "mas_500k" }), { users: "hasta_20", dailyOps: "bajo", records: "mas_500k" });
});
