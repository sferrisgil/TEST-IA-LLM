/**
 * Detector de datos personales y confidenciales.
 *
 * Funciona sin red y sin IA: se ejecuta en el navegador del empleado (para
 * analizar los ejemplos de datos sin que salgan de su equipo) y en el servidor
 * (para enmascarar cualquier texto antes de enviarlo al modelo de IA).
 */

import type { DataCategory } from "./policy";

export type PiiKind =
  | "dni"
  | "nie"
  | "cif"
  | "iban"
  | "tarjeta"
  | "email"
  | "telefono"
  | "nss"
  | "matricula"
  | "direccion"
  | "fecha"
  | "credencial"
  | "palabra_clave";

export interface PiiFinding {
  kind: PiiKind;
  label: string;
  category: DataCategory;
  count: number;
  /** Ejemplo ya enmascarado para mostrar al usuario (nunca el valor completo). */
  sample: string;
}

interface Detector {
  kind: PiiKind;
  label: string;
  category: DataCategory;
  regex: RegExp;
  validate?: (match: string) => boolean;
  placeholder: string;
}

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

function clean(value: string): string {
  return value.replace(/[\s.\-/]/g, "").toUpperCase();
}

export function isValidDni(value: string): boolean {
  const v = clean(value);
  if (!/^\d{8}[A-Z]$/.test(v)) return false;
  return DNI_LETTERS[parseInt(v.slice(0, 8), 10) % 23] === v[8];
}

export function isValidNie(value: string): boolean {
  const v = clean(value);
  if (!/^[XYZ]\d{7}[A-Z]$/.test(v)) return false;
  const num = "XYZ".indexOf(v[0]) + v.slice(1, 8);
  return DNI_LETTERS[parseInt(num, 10) % 23] === v[8];
}

export function isValidIban(value: string): boolean {
  const v = clean(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  const rearranged = v.slice(4) + v.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of digits) remainder = (remainder * 10 + Number(ch)) % 97;
  return remainder === 1;
}

export function isValidLuhn(value: string): boolean {
  const v = value.replace(/\D/g, "");
  if (v.length < 13 || v.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = v.length - 1; i >= 0; i--) {
    let d = Number(v[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function isValidNss(value: string): boolean {
  const v = value.replace(/\D/g, "");
  if (v.length !== 12) return false;
  const base = Number(v.slice(0, 10));
  return base % 97 === Number(v.slice(10));
}

const DETECTORS: Detector[] = [
  {
    kind: "credencial",
    label: "Contraseñas, claves o tokens de acceso",
    category: "credenciales",
    regex:
      /\b(?:AIza[0-9A-Za-z_\-]{30,}|sk-[A-Za-z0-9_\-]{20,}|ghp_[A-Za-z0-9]{30,}|xox[abp]-[A-Za-z0-9\-]{10,}|AKIA[0-9A-Z]{16})\b|(?:contrase(?:ñ|n)a|password|passwd|pwd|clave|token|api[_\s-]?key)\s*[:=]\s*\S{4,}/gi,
    placeholder: "[CREDENCIAL]",
  },
  {
    kind: "iban",
    label: "Cuentas bancarias (IBAN)",
    category: "economicos",
    regex: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){4,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g,
    validate: isValidIban,
    placeholder: "[IBAN]",
  },
  {
    kind: "tarjeta",
    label: "Números de tarjeta bancaria",
    category: "economicos",
    regex: /\b(?:\d[ \-]?){12,18}\d\b/g,
    validate: isValidLuhn,
    placeholder: "[TARJETA]",
  },
  {
    kind: "nss",
    label: "Número de la Seguridad Social",
    category: "identificativos",
    regex: /\b\d{2}[ /\-]?\d{8}[ /\-]?\d{2}\b/g,
    validate: isValidNss,
    placeholder: "[NSS]",
  },
  {
    kind: "dni",
    label: "DNI",
    category: "identificativos",
    regex: /\b\d{8}[ \-]?[A-Za-z]\b/g,
    validate: isValidDni,
    placeholder: "[DNI]",
  },
  {
    kind: "nie",
    label: "NIE (personas extranjeras)",
    category: "identificativos",
    regex: /\b[XYZxyz][ \-]?\d{7}[ \-]?[A-Za-z]\b/g,
    validate: isValidNie,
    placeholder: "[NIE]",
  },
  {
    kind: "cif",
    label: "CIF/NIF de empresa (no es dato personal, pero revisa si identifica a autónomos)",
    category: "internos",
    regex: /\b[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]\b/g,
    placeholder: "[CIF]",
  },
  {
    kind: "email",
    label: "Correos electrónicos",
    category: "contacto",
    regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    placeholder: "[EMAIL]",
  },
  {
    kind: "telefono",
    label: "Teléfonos",
    category: "contacto",
    regex: /(?<![\d\w])(?:(?:\+|00)34[ \-]?)?[6789]\d{2}[ \-]?\d{2,3}[ \-]?\d{2,3}[ \-]?\d{0,2}(?![\d\w])/g,
    validate: (m) => {
      const d = m.replace(/\D/g, "").replace(/^(?:0034|34)(?=\d{9}$)/, "");
      return d.length === 9;
    },
    placeholder: "[TELEFONO]",
  },
  {
    kind: "matricula",
    label: "Matrículas de vehículos",
    category: "identificativos",
    regex: /\b\d{4}[ \-]?[BCDFGHJKLMNPRSTVWXYZ]{3}\b/g,
    placeholder: "[MATRICULA]",
  },
  {
    kind: "direccion",
    label: "Direcciones postales",
    category: "contacto",
    regex:
      /\b(?:c\/|calle|avda\.?|avenida|plaza|pza\.?|paseo|camino|carretera|ctra\.?|ronda|travesía|urbanización|urb\.)\s+[A-ZÁÉÍÓÚÑa-záéíóúñ][\wÁÉÍÓÚÑáéíóúñ .'ºª\-]{1,40}?,?\s*(?:n[ºo°.]?\s*)?\d{1,4}\b/gi,
    placeholder: "[DIRECCION]",
  },
  {
    kind: "fecha",
    label: "Fechas (posibles fechas de nacimiento)",
    category: "identificativos",
    regex: /\b(?:0?[1-9]|[12]\d|3[01])[/\-.](?:0?[1-9]|1[0-2])[/\-.](?:19|20)\d{2}\b/g,
    placeholder: "[FECHA]",
  },
];

/**
 * Palabras que suelen indicar categorías especiales (art. 9 RGPD), datos
 * penales (art. 10 RGPD), menores o colectivos vulnerables. Se buscan como
 * palabra completa e ignorando mayúsculas y tildes.
 */
const KEYWORDS: { category: DataCategory; label: string; words: string[] }[] = [
  {
    category: "especiales",
    label: "Posibles datos de salud",
    words: [
      "salud", "diagnostico", "enfermedad", "baja medica", "incapacidad temporal",
      "discapacidad", "minusvalia", "tratamiento", "medicacion", "embarazo",
      "psicologico", "psiquiatrico", "historia clinica", "alergia", "covid",
      "grado de dependencia", "certificado medico",
    ],
  },
  {
    category: "especiales",
    label: "Posible ideología, religión, afiliación sindical, origen u orientación",
    words: [
      "afiliacion sindical", "sindicato", "afiliado", "religion", "ideologia",
      "partido politico", "origen etnico", "raza", "etnia", "orientacion sexual",
      "vida sexual", "datos biometricos", "huella dactilar", "reconocimiento facial",
    ],
  },
  {
    category: "penales",
    label: "Posibles datos penales o de infracciones",
    words: [
      "antecedentes penales", "condena", "delito", "denuncia", "detenido",
      "sentencia penal", "orden de alejamiento", "atestado",
    ],
  },
  {
    category: "vulnerables",
    label: "Posibles colectivos vulnerables o servicios sociales",
    words: [
      "violencia de genero", "victima", "servicios sociales", "exclusion social",
      "renta minima", "ingreso minimo vital", "desahucio", "sin hogar",
      "ayuda de emergencia", "dependencia", "tutela", "acogida",
    ],
  },
  {
    category: "menores",
    label: "Posibles datos de menores",
    words: ["menor", "menores", "alumno", "alumna", "escolar", "nino", "nina", "tutor legal", "patria potestad"],
  },
  {
    category: "economicos",
    label: "Posibles datos económicos o laborales",
    words: ["nomina", "salario", "sueldo", "embargo", "deuda", "renta", "ingresos", "irpf", "declaracion de la renta"],
  },
  {
    category: "identificativos",
    label: "Columnas o campos que identifican personas",
    words: ["nombre y apellidos", "apellidos", "apellido", "dni", "nie", "pasaporte", "fecha de nacimiento", "firma"],
  },
];

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function maskSample(value: string): string {
  const v = value.trim();
  if (v.length <= 4) return "•".repeat(v.length);
  return v.slice(0, 2) + "•".repeat(Math.min(v.length - 4, 10)) + v.slice(-2);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Analiza un texto y devuelve qué tipos de datos sensibles parece contener. */
export function detectPii(text: string): PiiFinding[] {
  const findings: PiiFinding[] = [];
  if (!text || !text.trim()) return findings;

  for (const d of DETECTORS) {
    const matches = [...text.matchAll(new RegExp(d.regex.source, d.regex.flags))]
      .map((m) => m[0])
      .filter((m) => (d.validate ? d.validate(m) : true));
    if (matches.length > 0) {
      findings.push({
        kind: d.kind,
        label: d.label,
        category: d.category,
        count: matches.length,
        sample: maskSample(matches[0]),
      });
    }
  }

  const norm = normalize(text);
  for (const group of KEYWORDS) {
    const hits = group.words.filter((w) => new RegExp(`\\b${escapeRegex(w)}\\b`).test(norm));
    if (hits.length > 0) {
      findings.push({
        kind: "palabra_clave",
        label: group.label,
        category: group.category,
        count: hits.length,
        sample: hits.slice(0, 4).join(", "),
      });
    }
  }

  return findings;
}

/**
 * Sustituye los datos personales detectables por marcadores ([DNI], [EMAIL]...).
 * Se usa siempre antes de enviar texto al proveedor de IA.
 */
export function maskPii(text: string): { text: string; replaced: number } {
  let out = text;
  let replaced = 0;
  for (const d of DETECTORS) {
    if (d.kind === "cif") continue; // los CIF de empresa no son datos personales
    out = out.replace(new RegExp(d.regex.source, d.regex.flags), (m) => {
      if (d.validate && !d.validate(m)) return m;
      replaced++;
      return d.placeholder;
    });
  }
  return { text: out, replaced };
}

/** Categorías de datos sugeridas a partir de los hallazgos. */
export function categoriesFromFindings(findings: PiiFinding[]): DataCategory[] {
  return [...new Set(findings.map((f) => f.category))];
}
