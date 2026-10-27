import { test } from "node:test";
import assert from "node:assert/strict";
import { assess, emptyAnswers, type Answers } from "../shared/policy";
import { canAccess, canPreview, parseMembers, publishDecision, type Identity, type Publication } from "../shared/publishing";
import { ipAllowed, parseNetworks } from "../server/network";

const answers = (p: Partial<Answers>): Answers => ({ ...emptyAnswers(), ...p });

const person = (user: string, p: Partial<Identity> = {}): Identity => ({
  user,
  name: user,
  department: "Servicios Generales",
  groups: [],
  isStaff: true,
  isContractor: false,
  isReviewer: false,
  ...p,
});
const owner = person("ana");
const colleague = person("luis");
const otherDept = person("eva", { department: "Urbanismo" });
const contractor = person("contrata.a", { isStaff: false, isContractor: true, department: "" });
const reviewer = person("dpd", { isReviewer: true, department: "Secretaría" });

function pub(p: Partial<Publication>): Publication {
  const a = answers({ audience: p.audience || "plantilla" });
  return {
    id: "x", name: "X", owner: "ana", ownerName: "Ana", department: "Servicios Generales",
    audience: "plantilla", members: [], answers: a, assessment: assess(a), version: 1, status: "publicada",
    externalAccess: "no_aplica", createdAt: "", updatedAt: "", reviewBy: "2999-01-01", history: [], ...p,
  };
}

test("riesgo bajo e interno se publica sin revisión", () => {
  const a = answers({ data: ["ninguno"], audience: "equipo" });
  assert.deepEqual([publishDecision(a, assess(a)).allowed, publishDecision(a, assess(a)).needsReview], [true, false]);
});

test("riesgo medio, contratas o público requieren revisión", () => {
  for (const a of [
    answers({ data: ["contacto"], audience: "equipo", origin: ["propios"] }),
    answers({ data: ["ninguno"], audience: "externos" }),
    answers({ data: ["publicos"], audience: "publico" }),
  ]) assert.equal(publishDecision(a, assess(a)).needsReview, true);
});

test("no permitido no se publica", () => {
  const a = answers({ data: ["credenciales"] });
  assert.equal(publishDecision(a, assess(a)).allowed, false);
});

test("contratas por VPN con datos personales: riesgo medio, no alto", () => {
  assert.equal(assess(answers({ data: ["contacto"], audience: "externos", origin: ["propios"] })).level, "medio");
  assert.equal(assess(answers({ data: ["especiales"], audience: "externos" })).level, "alto");
});

test("app personal: solo su responsable", () => {
  const p = pub({ audience: "personal" });
  assert.ok(canAccess(p, owner));
  assert.ok(!canAccess(p, colleague));
  assert.ok(!canAccess(p, contractor));
});

test("app de equipo: solo miembros indicados", () => {
  const p = pub({ audience: "equipo", members: ["luis"] });
  assert.ok(canAccess(p, colleague));
  assert.ok(!canAccess(p, otherDept));
});

test("app de departamento: mismo departamento o miembros", () => {
  const p = pub({ audience: "departamento" });
  assert.ok(canAccess(p, colleague));
  assert.ok(!canAccess(p, otherDept));
  assert.ok(canAccess(pub({ audience: "departamento", members: ["eva"] }), otherDept));
});

test("las contratas solo ven apps abiertas a contratas", () => {
  assert.ok(!canAccess(pub({ audience: "plantilla" }), contractor));
  assert.ok(canAccess(pub({ audience: "externos" }), contractor));
  assert.ok(!canAccess(pub({ audience: "externos", members: ["contrata.b"] }), contractor));
  assert.ok(canAccess(pub({ audience: "externos" }), otherDept));
});

test("pendientes: solo responsable y revisores", () => {
  const p = pub({ status: "pendiente" });
  assert.ok(!canAccess(p, colleague));
  assert.ok(canPreview(p, reviewer));
  assert.ok(canPreview(p, owner));
  assert.ok(!canPreview(p, colleague));
});

test("parseMembers limpia la lista", () => {
  assert.deepEqual(parseMembers("Luis.Martin, eva.ruiz;  <script>, luis.martin"), ["luis.martin", "eva.ruiz"]);
});

test("filtro de red interna (IPv4, IPv6 y mapeadas)", () => {
  const nets = parseNetworks("10.0.0.0/8,192.168.10.0/24,::1/128,fc00::/7");
  assert.ok(ipAllowed("10.20.30.40", nets));
  assert.ok(ipAllowed("::ffff:192.168.10.5", nets));
  assert.ok(!ipAllowed("192.168.11.5", nets));
  assert.ok(!ipAllowed("8.8.8.8", nets));
  assert.ok(ipAllowed("::1", nets));
  assert.ok(ipAllowed("fd12:3456::1", nets));
  assert.ok(!ipAllowed("2001:db8::1", nets));
});

test("la app de demostración supera la revisión en cualquier configuración permitida", async () => {
  const { demoApp } = await import("../server/demo");
  const { scanCode } = await import("../shared/codeScan");
  for (const data of [["ninguno"], ["internos"], ["contacto"], ["especiales"]] as const)
    for (const audience of ["personal", "equipo", "departamento", "externos"] as const)
      for (const storage of ["ninguno", "navegador", "base_datos"] as const)
        for (const aiUse of ["no", "sin_datos"] as const) {
          const a = answers({ data: [...data], audience, storage, aiUse, origin: ["propios"] });
          const e = assess(a);
          if (e.level === "no_permitido") continue;
          const blockers = scanCode(demoApp(a, e, "").codigo, e.constraints).filter((f) => f.severity === "bloqueante");
          assert.deepEqual(blockers, [], JSON.stringify({ data, audience, storage, aiUse }));
        }
});
