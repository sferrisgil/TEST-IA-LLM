import type { Answers, Assessment, Audience, RiskLevel } from "@/shared/policy";
import type { HistoryEntry, PublicationStatus } from "@/shared/publishing";

export interface Me {
  usuario: string;
  nombre: string;
  departamento: string;
  esPlantilla: boolean;
  esContrata: boolean;
  esRevisor: boolean;
  perfilActual: string | null;
  perfilesPrueba: { id: string; etiqueta: string }[];
}

export interface PublicationSummary {
  id: string;
  nombre: string;
  finalidad: string;
  responsable: string;
  departamento: string;
  audiencia: Audience;
  nivel: RiskLevel;
  version: number;
  estado: PublicationStatus;
  caducada: boolean;
  revisarAntesDe: string;
  actualizada: string;
  accesoExterno: "no_aplica" | "solicitado" | "aprobado";
  url: string;
  miembros?: string[];
  historial?: HistoryEntry[];
  propia?: boolean;
  ficha?: { respuestas: Answers; evaluacion: Assessment };
}

export async function api<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Error ${r.status}`), { data });
  return data as T;
}

export const STATUS_LABEL: Record<PublicationStatus, string> = {
  pendiente: "Pendiente de revisión",
  publicada: "Publicada",
  rechazada: "Rechazada",
  retirada: "Retirada",
};

export const fmtDate = (s: string) => new Date(s).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
