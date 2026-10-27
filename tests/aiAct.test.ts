import { test } from "node:test";
import assert from "node:assert/strict";
import { assessAi, DEFAULT_MODELS, emptyAiAnswers, sanitizeAiAnswers, type AiAnswers, type ModelInfo } from "../shared/aiAct";
import { assess, emptyAnswers, type Answers } from "../shared/policy";

const ai = (p: Partial<AiAnswers>): AiAnswers => ({ ...emptyAiAnswers(), tasks: ["resumir"], ...p });
const ctx = { appKind: "aplicacion" as const, personalData: false, sendsPersonalData: false, decisions: "informativa" as const };
const answers = (p: Partial<Answers>, a: Partial<AiAnswers> = {}): Answers => ({ ...emptyAnswers(), aiUse: "sin_datos", ...p, ai: ai(a) });

const MODELS: ModelInfo[] = [
  { id: "local", name: "Local", hosting: "local", capability: 1, contextTokens: 8000, languages: ["es", "cooficiales"], personalData: true, cost: 1, available: true },
  { id: "rapido", name: "Rápido", hosting: "ue", capability: 2, contextTokens: 128000, languages: ["es", "cooficiales", "otros"], personalData: false, cost: 1, available: true },
  { id: "avanzado", name: "Avanzado", hosting: "ue", capability: 3, contextTokens: 1000000, languages: ["es", "cooficiales", "otros"], personalData: true, cost: 3, available: true },
];

test("uso interno sencillo: riesgo mínimo y modelo más económico adecuado", () => {
  const r = assessAi(ai({ tasks: ["simplificar"] }), ctx, MODELS);
  assert.equal(r.category, "riesgo_minimo");
  assert.equal(r.complexity, 1);
  assert.equal(r.recommended?.id, "local");
});

test("la complejidad sube con el razonamiento y el impacto del error", () => {
  assert.equal(assessAi(ai({ reasoning: "medio" }), ctx, MODELS).recommended?.id, "rapido");
  const r = assessAi(ai({ reasoning: "medio", errorImpact: "alto" }), ctx, MODELS);
  assert.equal(r.complexity, 3);
  assert.equal(r.recommended?.id, "avanzado");
});

test("textos largos exigen un modelo con más contexto", () => {
  assert.equal(assessAi(ai({ tasks: ["extraer"], inputSize: "largo" }), ctx, MODELS).recommended?.id, "avanzado");
});

test("con datos personales solo valen modelos autorizados", () => {
  const r = assessAi(ai({ reasoning: "medio" }), { ...ctx, personalData: true, sendsPersonalData: true }, MODELS);
  assert.equal(r.recommended?.id, "avanzado");
  assert.ok(r.options.find((o) => o.model.id === "rapido")!.reasons.some((x) => /datos personales/.test(x)));
});

test("sin modelo adecuado la app no se puede construir", () => {
  const a = assess(answers({ data: ["contacto"], aiUse: "con_datos", origin: ["propios"] }, { reasoning: "medio" }), DEFAULT_MODELS);
  assert.equal(a.level, "no_permitido");
  assert.equal(a.constraints.ai, false);
});

test("ámbito del Anexo III que influye en decisiones: alto riesgo", () => {
  const a = assess(answers({ data: ["internos"], decisions: "apoyo" }, { domains: ["prestaciones"], tasks: ["recomendar"] }), MODELS);
  assert.equal(a.ai?.category, "alto_riesgo");
  assert.equal(a.level, "alto");
  assert.ok(a.obligations.some((o) => /art\. 27/.test(o)));
});

test("ámbito del Anexo III sin influir en decisiones: revisar art. 6.3", () => {
  const a = assess(answers({ data: ["internos"] }, { domains: ["empleo"], tasks: ["simplificar"] }), MODELS);
  assert.equal(a.ai?.category, "revisar_art6");
  assert.equal(a.level, "medio");
});

test("prácticas prohibidas: no permitido", () => {
  assert.equal(assess(answers({ data: ["ninguno"] }, { prohibited: ["emociones"] }), MODELS).level, "no_permitido");
});

test("chatbot para la ciudadanía: transparencia y aviso obligatorio", () => {
  const a = assess(answers({ data: ["publicos"], audience: "publico" }, { interaction: "ciudadania", tasks: ["conversar"] }), MODELS);
  assert.equal(a.ai?.category, "transparencia");
  assert.ok(a.constraints.aiDisclosure);
  assert.ok(a.obligations.some((o) => /art\. 50/.test(o)));
});

test("automatización sin supervisión con datos personales: alto riesgo", () => {
  const a = assess(
    answers({ appKind: "automatizacion", data: ["contacto"], origin: ["propios"] }, { oversight: "ninguna", tasks: ["clasificar"] }),
    MODELS,
  );
  assert.equal(a.level, "alto");
});

test("la IA que propone decisiones exige revisión humana en la app", () => {
  const a = assess(answers({ data: ["internos"], decisions: "apoyo" }, { tasks: ["redactar"] }), MODELS);
  assert.ok(a.constraints.aiHumanReview);
  assert.ok(a.constraints.aiMaxInputChars > 0);
});

test("sanitizeAiAnswers descarta valores no válidos", () => {
  const s = sanitizeAiAnswers({ tasks: ["resumir", "hackear"], oversight: "nadie", referenceDocs: "sí" });
  assert.deepEqual(s.tasks, ["resumir"]);
  assert.equal(s.oversight, "siempre");
  assert.equal(s.referenceDocs, false);
});
