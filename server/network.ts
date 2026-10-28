/**
 * Restricción por red: el servidor solo atiende a la red interna del
 * Ayuntamiento y al rango de direcciones de la VPN de las contratas.
 */
import type { NextFunction, Request, Response } from "express";

interface Net {
  v6: boolean;
  base: bigint;
  bits: number;
}

function ipToBig(ip: string): { v6: boolean; value: bigint } | null {
  let addr = ip.trim();
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) addr = mapped[1];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(addr)) {
    const parts = addr.split(".").map(Number);
    if (parts.some((p) => p > 255)) return null;
    return { v6: false, value: parts.reduce((acc, p) => (acc << 8n) + BigInt(p), 0n) };
  }
  if (!addr.includes(":")) return null;
  const [head, tail] = addr.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  if (tail === undefined && h.length !== 8) return null;
  const groups = [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return { v6: true, value: groups.reduce((acc, g) => (acc << 16n) + BigInt(parseInt(g, 16)), 0n) };
}

export function parseNetworks(list: string): Net[] {
  return list
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((cidr) => {
      const [ip, b] = cidr.split("/");
      const parsed = ipToBig(ip);
      if (!parsed) throw new Error(`Red no válida en la configuración: ${cidr}`);
      const max = parsed.v6 ? 128 : 32;
      const bits = b === undefined ? max : Number(b);
      if (!(bits >= 0 && bits <= max)) throw new Error(`Máscara no válida: ${cidr}`);
      return { v6: parsed.v6, base: parsed.value >> BigInt(max - bits), bits };
    });
}

export function ipAllowed(ip: string, nets: Net[]): boolean {
  const parsed = ipToBig(ip);
  if (!parsed) return false;
  return nets.some((n) => n.v6 === parsed.v6 && parsed.value >> BigInt((n.v6 ? 128 : 32) - n.bits) === n.base);
}

/** Redes privadas + localhost: valor por defecto razonable para una intranet. */
export const PRIVATE_NETWORKS = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8,::1/128,fc00::/7";

export function internalOnly(list: string) {
  const nets = parseNetworks(list);
  return (req: Request, res: Response, next: NextFunction) => {
    if (ipAllowed(req.socket.remoteAddress || "", nets)) return next();
    res.status(403).type("text/plain; charset=utf-8").send("Acceso solo desde la red interna del Ayuntamiento o la VPN.");
  };
}
