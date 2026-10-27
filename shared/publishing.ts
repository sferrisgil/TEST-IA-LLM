/**
 * Reglas de publicación en el servidor interno y de control de acceso.
 *
 * Fase 1: las apps se publican solo en la intranet, accesible para la
 * plantilla y, cuando la app lo permite, para las contratas que entran por VPN.
 * Fase 2 (no activa): publicación en internet de apps concretas aprobadas.
 */

import type { Answers, Assessment, Audience } from "./policy";

export type PublicationStatus = "pendiente" | "publicada" | "rechazada" | "retirada";
export type ExternalAccess = "no_aplica" | "solicitado" | "aprobado";

export interface Identity {
  user: string;
  name: string;
  department: string;
  groups: string[];
  isStaff: boolean;
  isContractor: boolean;
  isReviewer: boolean;
}

export interface HistoryEntry {
  date: string;
  user: string;
  action: string;
  comment?: string;
}

export interface Publication {
  id: string;
  name: string;
  owner: string;
  ownerName: string;
  department: string;
  audience: Audience;
  /** Usuarios con acceso explícito (equipos) o contratas autorizadas. */
  members: string[];
  answers: Answers;
  assessment: Assessment;
  version: number;
  status: PublicationStatus;
  /** Fase 2: acceso desde internet. */
  externalAccess: ExternalAccess;
  createdAt: string;
  updatedAt: string;
  /** Fecha límite para confirmar que la app sigue siendo necesaria. */
  reviewBy: string;
  approvedBy?: string;
  history: HistoryEntry[];
}

export const REVIEW_PERIOD_MONTHS = 12;

export interface PublishDecision {
  allowed: boolean;
  /** Requiere revisión de TI/DPD antes de quedar visible. */
  needsReview: boolean;
  reasons: string[];
}

/** ¿Puede publicarse y necesita revisión? */
export function publishDecision(answers: Answers, a: Assessment): PublishDecision {
  if (a.level === "no_permitido") {
    return { allowed: false, needsReview: false, reasons: ["Las aplicaciones no permitidas en autoservicio no pueden publicarse."] };
  }
  const reasons: string[] = [];
  if (a.level === "alto") reasons.push("Riesgo alto: debe revisarla TI y el DPD (solo como prototipo con datos ficticios salvo EIPD aprobada).");
  if (a.level === "medio") reasons.push("Riesgo medio: debe revisarla TI y el DPD antes de estar disponible.");
  if (answers.audience === "externos") reasons.push("La usarán empresas contratistas: la revisión comprueba que existe contrato que lo cubra.");
  if (answers.audience === "publico") reasons.push("Pensada para la ciudadanía: en esta fase se publica solo en la intranet, tras revisión.");
  if (answers.audience === "plantilla" && a.level !== "bajo") reasons.push("Visible para toda la plantilla.");
  const needsReview = reasons.length > 0;
  if (!needsReview) reasons.push("Riesgo bajo y uso interno limitado: se publica directamente.");
  return { allowed: true, needsReview, reasons };
}

export function isExpired(p: Publication, now = new Date()): boolean {
  return new Date(p.reviewBy).getTime() < now.getTime();
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** ¿Puede esta persona usar la app publicada? */
export function canAccess(p: Publication, who: Identity): boolean {
  if (who.user === p.owner) return true;
  if (p.status !== "publicada") return false;
  const named = p.members.map((m) => m.toLowerCase()).includes(who.user.toLowerCase());

  if (who.isContractor && !who.isStaff) {
    // Las contratas solo ven apps abiertas a contratas y, si hay lista, solo si están en ella.
    if (p.audience !== "externos" && p.audience !== "publico") return false;
    return p.members.length === 0 || named;
  }
  if (!who.isStaff) return false;

  switch (p.audience) {
    case "personal":
      return false;
    case "equipo":
      return named;
    case "departamento":
      return named || (!!who.department && who.department.toLowerCase() === p.department.toLowerCase());
    case "plantilla":
    case "externos":
    case "publico":
      return true;
  }
}

/** Revisores y propietario pueden ver la app aunque no esté publicada. */
export function canPreview(p: Publication, who: Identity): boolean {
  return who.user === p.owner || who.isReviewer || canAccess(p, who);
}

export function canManage(p: Publication, who: Identity): boolean {
  return who.user === p.owner || who.isReviewer;
}

/** Normaliza la lista de miembros: identificadores de usuario sin espacios. */
export function parseMembers(input: unknown): string[] {
  const raw = Array.isArray(input) ? input.join(",") : typeof input === "string" ? input : "";
  return [...new Set(raw.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z0-9._@\-]{2,80}$/.test(x)))].slice(0, 200);
}
