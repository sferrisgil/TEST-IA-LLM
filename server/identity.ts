/**
 * Identidad de quien hace la petición.
 *
 * - Modo "proxy" (producción): el proxy inverso corporativo autentica (SSO,
 *   Kerberos, SAML/OIDC…) y pasa usuario, nombre, departamento y grupos en
 *   cabeceras. Solo se aceptan si la petición llega desde ese proxy.
 * - Modo "desarrollo": perfiles de prueba seleccionables desde la interfaz.
 */
import type { NextFunction, Request, Response } from "express";
import type { Identity } from "../shared/publishing";
import { ipAllowed, parseNetworks } from "./network";

const env = process.env;
export const AUTH_MODE: "proxy" | "desarrollo" =
  env.AUTH_MODE === "proxy" || (env.NODE_ENV === "production" && env.AUTH_MODE !== "desarrollo") ? "proxy" : "desarrollo";

const H_USER = (env.AUTH_HEADER_USER || "x-remote-user").toLowerCase();
const H_NAME = (env.AUTH_HEADER_NAME || "x-remote-name").toLowerCase();
const H_GROUPS = (env.AUTH_HEADER_GROUPS || "x-remote-groups").toLowerCase();
const H_DEPT = (env.AUTH_HEADER_DEPARTMENT || "x-remote-department").toLowerCase();
const G_STAFF = (env.GROUP_STAFF || "plantilla").toLowerCase();
const G_CONTRACTOR = (env.GROUP_CONTRACTOR || "contratas").toLowerCase();
const G_REVIEWER = (env.GROUP_REVIEWER || "revisores-apps").toLowerCase();
const TRUSTED_PROXIES = parseNetworks(env.TRUSTED_PROXIES || "127.0.0.1/32,::1/128");

export const DEV_PROFILES: Record<string, { user: string; name: string; department: string; groups: string[]; label: string }> = {
  empleado: { user: "ana.garcia", name: "Ana García (prueba)", department: "Servicios Generales", groups: [G_STAFF], label: "Empleada de Servicios Generales" },
  companero: { user: "luis.martin", name: "Luis Martín (prueba)", department: "Servicios Generales", groups: [G_STAFF], label: "Compañero del mismo departamento" },
  otro: { user: "eva.ruiz", name: "Eva Ruiz (prueba)", department: "Urbanismo", groups: [G_STAFF], label: "Empleada de otro departamento" },
  revisor: { user: "dpd", name: "Delegado/a de Protección de Datos (prueba)", department: "Secretaría", groups: [G_STAFF, G_REVIEWER], label: "Revisor (TI / DPD)" },
  contrata: { user: "contrata.limpiezas", name: "Limpiezas Ejemplo S.L. (prueba)", department: "", groups: [G_CONTRACTOR], label: "Empresa contratista (VPN)" },
};

function header(req: Request, name: string): string {
  const v = req.headers[name];
  const raw = (Array.isArray(v) ? v[0] : v || "").toString().trim();
  // Los proxies suelen codificar los acentos (%C3%AD); si no, se usa tal cual.
  try {
    return /%[0-9a-f]{2}/i.test(raw) ? decodeURIComponent(raw) : raw;
  } catch {
    return raw;
  }
}

function build(user: string, name: string, department: string, groups: string[]): Identity {
  const g = groups.map((x) => x.toLowerCase());
  return {
    user: user.toLowerCase(),
    name: name || user,
    department,
    groups: g,
    isStaff: g.includes(G_STAFF),
    isContractor: g.includes(G_CONTRACTOR),
    isReviewer: g.includes(G_REVIEWER),
  };
}

function cookie(req: Request, name: string): string {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : "";
}

export function currentDevProfile(req: Request): string {
  const c = cookie(req, "perfil_prueba");
  return DEV_PROFILES[c] ? c : "empleado";
}

export function identify(req: Request): Identity | null {
  if (AUTH_MODE === "proxy") {
    if (!ipAllowed(req.socket.remoteAddress || "", TRUSTED_PROXIES)) return null;
    const user = header(req, H_USER);
    if (!user) return null;
    // Algunos proxies envían "DOMINIO\\usuario" o "usuario@dominio".
    const clean = user.replace(/^.*\\/, "").replace(/@.*$/, "");
    return build(clean, header(req, H_NAME), header(req, H_DEPT), header(req, H_GROUPS).split(/[,;]/).map((s) => s.trim()).filter(Boolean));
  }
  const p = DEV_PROFILES[currentDevProfile(req)];
  return build(p.user, p.name, p.department, p.groups);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      identity?: Identity;
    }
  }
}

/** Exige identidad válida. */
export function requireIdentity(req: Request, res: Response, next: NextFunction) {
  const id = identify(req);
  if (!id || (!id.isStaff && !id.isContractor)) {
    return res.status(401).json({ error: "No se ha podido identificar tu usuario. Accede a través de la intranet o la VPN." });
  }
  req.identity = id;
  next();
}

/** Solo el personal municipal puede crear aplicaciones. */
export function requireStaff(req: Request, res: Response, next: NextFunction) {
  requireIdentity(req, res, () => {
    if (!req.identity!.isStaff) return res.status(403).json({ error: "Solo el personal municipal puede crear aplicaciones." });
    next();
  });
}

export function requireReviewer(req: Request, res: Response, next: NextFunction) {
  requireIdentity(req, res, () => {
    if (!req.identity!.isReviewer) return res.status(403).json({ error: "Solo TI y el DPD pueden revisar publicaciones." });
    next();
  });
}
