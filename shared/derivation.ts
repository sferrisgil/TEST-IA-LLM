/**
 * Derivación a TI y al Delegado de Protección de Datos (DPD).
 *
 * Cuando una propuesta supera lo que puede resolverse en autoservicio, se
 * deriva: la persona no puede publicarla por su cuenta y TI/DPD reciben
 * automáticamente la ficha completa (y el prototipo, si lo hay).
 */
import type { AiAssessment } from "./aiAct";
import type { Answers, RiskLevel } from "./policy";

export type Recipient = "ti" | "dpd";

export interface Scale {
  /** Personas usándola a la vez en momentos de máxima actividad. */
  users: "hasta_20" | "hasta_100" | "mas_100";
  /** Operaciones (altas, cambios, consultas, ejecuciones) al día. */
  dailyOps: "bajo" | "medio" | "alto";
  /** Registros acumulados previstos. */
  records: "hasta_50k" | "hasta_500k" | "mas_500k";
}

export function emptyScale(): Scale {
  return { users: "hasta_20", dailyOps: "bajo", records: "hasta_50k" };
}

export const SCALE_OPTIONS = {
  users: [
    { id: "hasta_20", label: "Hasta 20 personas a la vez" },
    { id: "hasta_100", label: "Entre 20 y 100" },
    { id: "mas_100", label: "Más de 100" },
  ],
  dailyOps: [
    { id: "bajo", label: "Menos de 1.000 al día" },
    { id: "medio", label: "Entre 1.000 y 20.000" },
    { id: "alto", label: "Más de 20.000" },
  ],
  records: [
    { id: "hasta_50k", label: "Hasta 50.000 registros" },
    { id: "hasta_500k", label: "Entre 50.000 y 500.000" },
    { id: "mas_500k", label: "Más de 500.000" },
  ],
} as const;

export function sanitizeScale(input: unknown): Scale {
  const s = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const base = emptyScale();
  const pick = <K extends keyof Scale>(k: K) =>
    (SCALE_OPTIONS[k] as readonly { id: string }[]).some((o) => o.id === s[k]) ? (s[k] as Scale[K]) : base[k];
  return { users: pick("users"), dailyOps: pick("dailyOps"), records: pick("records") };
}

export interface DerivationReason {
  text: string;
  to: Recipient[];
}

export interface Derivation {
  required: boolean;
  recipients: Recipient[];
  reasons: DerivationReason[];
  /** Si además se impide construir (solo cuando no está permitido). */
  blocksBuild: boolean;
}

export const RECIPIENT_LABEL: Record<Recipient, string> = { ti: "Servicio de TI", dpd: "Delegado/a de Protección de Datos" };

export function computeDerivation(answers: Answers, level: RiskLevel, ai: AiAssessment | null): Derivation {
  const reasons: DerivationReason[] = [];
  const add = (text: string, ...to: Recipient[]) => reasons.push({ text, to });

  // 1. Reglamento de IA: riesgo medio (transparencia, posible alto riesgo) o superior.
  if (ai) {
    if (ai.category === "prohibida") add("El uso de IA descrito es una práctica prohibida por el Reglamento de IA.", "dpd", "ti");
    if (ai.category === "alto_riesgo") add("El Reglamento de IA lo clasifica como sistema de alto riesgo.", "dpd", "ti");
    if (ai.category === "revisar_art6") add("Posible alto riesgo según el Reglamento de IA: hay que analizar la excepción del art. 6.3.", "dpd", "ti");
    if (ai.category === "transparencia") add("Riesgo limitado según el Reglamento de IA (obligaciones de transparencia).", "dpd");

    // 2. Modelo demasiado complejo o inexistente.
    if (!ai.recommended) add("Ningún modelo de IA disponible es adecuado: TI debe valorar otro modelo o un desarrollo a medida.", "ti");
    else if (ai.complexity === 3 || ai.recommended.cost === 3) {
      add(`La tarea necesita un modelo avanzado («${ai.recommended.name}»), de mayor coste: TI debe validar su uso.`, "ti");
    }
    if (answers.ai.volume === "alto") add("Volumen de consultas a la IA muy alto (miles al día): TI debe validar coste y capacidad.", "ti");
  }

  // 3. Volumen que puede desbordar la plataforma o la base de datos SQLite.
  const db = answers.storage === "base_datos";
  const s = answers.scale;
  if (s.users === "mas_100") add("Más de 100 personas usándola a la vez: puede exceder la capacidad de la plataforma de autoservicio.", "ti");
  if (db && s.dailyOps === "alto") add("Más de 20.000 operaciones al día: excede lo recomendable para la base de datos SQLite de la plataforma.", "ti");
  else if (s.dailyOps === "alto" && answers.appKind === "automatizacion") add("Automatización con más de 20.000 operaciones al día.", "ti");
  if (db && s.records === "mas_500k") add("Más de 500.000 registros: necesita una base de datos corporativa.", "ti");
  else if (db && s.records === "hasta_500k") add("Supera el cupo estándar de 50.000 registros por aplicación: TI debe ampliarlo o proponer otra base de datos.", "ti");
  if (db && s.users === "hasta_100" && s.dailyOps !== "bajo") add("Uso intensivo y concurrente de la base de datos: TI debe comprobar el rendimiento.", "ti");

  // 4. Riesgo global alto o no permitido.
  if (level === "alto") add("El nivel de riesgo global es alto: requiere evaluación de impacto y validación antes de usar datos reales.", "dpd", "ti");
  if (level === "no_permitido" && !reasons.some((r) => r.to.includes("dpd"))) add("La propuesta no puede resolverse en autoservicio.", "dpd", "ti");

  const recipients = [...new Set(reasons.flatMap((r) => r.to))].sort() as Recipient[];
  return { required: reasons.length > 0, recipients, reasons, blocksBuild: level === "no_permitido" };
}
