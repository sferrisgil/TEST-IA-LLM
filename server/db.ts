/**
 * Base de datos municipal para las apps (SQLite).
 *
 * Las apps NO escriben SQL: usan una API sencilla (guardar, obtener, listar,
 * borrar…) y es el servidor quien construye siempre las consultas con
 * parámetros. Así cada app queda encerrada en su propio "ámbito" y no puede
 * leer datos de otras apps ni inyectar SQL.
 *
 * Ámbitos:
 *  - app:<id>                 datos reales de una app publicada
 *  - prueba:<usuario>         pruebas mientras se construye (se vacían solas)
 *  - revision:<id>:<usuario>  pruebas de apps aún no publicadas (revisores/responsable)
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { DbScope } from "../shared/policy";

const DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_RECORDS_PER_SCOPE = Number(process.env.DB_MAX_RECORDS_PER_APP) || 50_000;
const MAX_LIST = 500;
const TEST_TTL_DAYS = 1;

let db: Database.Database | null = null;

function open(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o750 });
  const file = path.join(DATA_DIR, "datos.sqlite");
  db = new Database(file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* sistemas sin permisos POSIX */
  }
  db.pragma("journal_mode = WAL");
  init(db);
  return db;
}

function init(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS registros (
      ambito          TEXT NOT NULL,
      coleccion       TEXT NOT NULL,
      id              TEXT NOT NULL,
      propietario     TEXT NOT NULL,
      datos           TEXT NOT NULL,
      busqueda        TEXT NOT NULL,
      creado          TEXT NOT NULL,
      actualizado     TEXT NOT NULL,
      actualizado_por TEXT NOT NULL,
      PRIMARY KEY (ambito, coleccion, id)
    );
    CREATE INDEX IF NOT EXISTS idx_registros_lista ON registros (ambito, coleccion, actualizado);
    CREATE INDEX IF NOT EXISTS idx_registros_prop ON registros (ambito, coleccion, propietario);
  `);
}

export class DbError extends Error {}

export interface DbContext {
  /** Ámbito de datos (lo fija el servidor, nunca la app). */
  scope: string;
  user: string;
  dbScope: DbScope;
}

const COLLECTION = /^[A-Za-z0-9_\-]{1,40}$/;
const FIELD = /^[A-Za-z0-9_]{1,40}$/;
const ID = /^[A-Za-z0-9_\-]{1,64}$/;

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function searchText(value: unknown): string {
  const parts: string[] = [];
  const walk = (v: unknown) => {
    if (v === null || v === undefined) return;
    if (typeof v === "object") Object.values(v as object).forEach(walk);
    else parts.push(String(v));
  };
  walk(value);
  return normalize(parts.join(" ")).slice(0, 20_000);
}

function collection(name: unknown): string {
  if (typeof name !== "string" || !COLLECTION.test(name)) {
    throw new DbError("Nombre de colección no válido (letras, números, guiones; máx. 40).");
  }
  return name;
}

interface Row {
  id: string;
  datos: string;
  creado: string;
  actualizado: string;
  propietario: string;
}

function toRecord(r: Row) {
  return { ...JSON.parse(r.datos), id: r.id, _creado: r.creado, _actualizado: r.actualizado, _autor: r.propietario };
}

/** Filtro de visibilidad: en modo "personal" cada usuario solo ve lo suyo. */
function owner(ctx: DbContext): { sql: string; params: string[] } {
  return ctx.dbScope === "personal" ? { sql: " AND propietario = ?", params: [ctx.user] } : { sql: "", params: [] };
}

export function save(ctx: DbContext, coll: unknown, record: unknown) {
  const c = collection(coll);
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new DbError("El registro debe ser un objeto.");
  const { id: rawId, _creado, _actualizado, _autor, ...data } = record as Record<string, unknown>;
  void _creado;
  void _actualizado;
  void _autor;
  const json = JSON.stringify(data);
  if (Buffer.byteLength(json) > MAX_RECORD_BYTES) throw new DbError("El registro es demasiado grande (máx. 64 KB).");
  const d = open();
  const now = new Date().toISOString();
  const o = owner(ctx);

  if (typeof rawId === "string" && ID.test(rawId)) {
    const exists = d
      .prepare(`SELECT id FROM registros WHERE ambito = ? AND coleccion = ? AND id = ?${o.sql}`)
      .get(ctx.scope, c, rawId, ...o.params);
    if (exists) {
      d.prepare(`UPDATE registros SET datos = ?, busqueda = ?, actualizado = ?, actualizado_por = ? WHERE ambito = ? AND coleccion = ? AND id = ?`).run(
        json, searchText(data), now, ctx.user, ctx.scope, c, rawId,
      );
      return get(ctx, c, rawId);
    }
  }
  const count = (d.prepare("SELECT COUNT(*) n FROM registros WHERE ambito = ?").get(ctx.scope) as { n: number }).n;
  if (count >= MAX_RECORDS_PER_SCOPE) throw new DbError("Se ha alcanzado el máximo de registros de esta aplicación.");
  // Si el id lo propone la app y está libre, se respeta; si no, se genera.
  let id = typeof rawId === "string" && ID.test(rawId) ? rawId : randomUUID();
  if (d.prepare("SELECT 1 FROM registros WHERE ambito = ? AND coleccion = ? AND id = ?").get(ctx.scope, c, id)) id = randomUUID();
  d.prepare(
    `INSERT INTO registros (ambito, coleccion, id, propietario, datos, busqueda, creado, actualizado, actualizado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(ctx.scope, c, id, ctx.user, json, searchText(data), now, now, ctx.user);
  return get(ctx, c, id);
}

export function get(ctx: DbContext, coll: unknown, id: unknown) {
  const c = collection(coll);
  if (typeof id !== "string" || !ID.test(id)) return null;
  const o = owner(ctx);
  const row = open()
    .prepare(`SELECT id, datos, creado, actualizado, propietario FROM registros WHERE ambito = ? AND coleccion = ? AND id = ?${o.sql}`)
    .get(ctx.scope, c, id, ...o.params) as Row | undefined;
  return row ? toRecord(row) : null;
}

export interface ListOptions {
  buscar?: unknown;
  filtros?: unknown;
  orden?: unknown;
  descendente?: unknown;
  limite?: unknown;
  desde?: unknown;
}

export function list(ctx: DbContext, coll: unknown, opts: ListOptions = {}) {
  const c = collection(coll);
  const o = owner(ctx);
  let where = `ambito = ? AND coleccion = ?${o.sql}`;
  const params: (string | number)[] = [ctx.scope, c, ...o.params];

  // Búsqueda de texto: todas las palabras deben aparecer en algún campo.
  if (typeof opts.buscar === "string" && opts.buscar.trim()) {
    for (const word of normalize(opts.buscar).split(/\s+/).filter(Boolean).slice(0, 10)) {
      where += " AND busqueda LIKE ? ESCAPE '\\'";
      params.push(`%${word.replace(/[\\%_]/g, (m) => "\\" + m)}%`);
    }
  }
  // Filtros exactos por campo: { estado: "pendiente", prioridad: 2 }
  if (opts.filtros && typeof opts.filtros === "object" && !Array.isArray(opts.filtros)) {
    for (const [field, value] of Object.entries(opts.filtros as Record<string, unknown>).slice(0, 10)) {
      if (!FIELD.test(field)) throw new DbError(`Campo de filtro no válido: ${field}`);
      if (!["string", "number", "boolean"].includes(typeof value)) throw new DbError("Los filtros solo admiten textos, números o sí/no.");
      where += " AND json_extract(datos, ?) = ?";
      params.push(`$.${field}`, typeof value === "boolean" ? (value ? 1 : 0) : (value as string | number));
    }
  }

  let orderBy = "actualizado";
  const orderParams: string[] = [];
  if (typeof opts.orden === "string" && opts.orden) {
    if (opts.orden === "_creado") orderBy = "creado";
    else if (opts.orden === "_actualizado") orderBy = "actualizado";
    else if (FIELD.test(opts.orden)) {
      orderBy = "json_extract(datos, ?)";
      orderParams.push(`$.${opts.orden}`);
    } else throw new DbError("Campo de orden no válido.");
  }
  const dir = opts.descendente === false || (opts.orden && opts.descendente !== true) ? "ASC" : "DESC";
  const limit = Math.min(MAX_LIST, Math.max(1, Number(opts.limite) || 100));
  const offset = Math.max(0, Number(opts.desde) || 0);

  const d = open();
  const total = (d.prepare(`SELECT COUNT(*) n FROM registros WHERE ${where}`).get(...params) as { n: number }).n;
  const rows = d
    .prepare(`SELECT id, datos, creado, actualizado, propietario FROM registros WHERE ${where} ORDER BY ${orderBy} ${dir}, id LIMIT ? OFFSET ?`)
    .all(...params, ...orderParams, limit, offset) as Row[];
  return { registros: rows.map(toRecord), total };
}

export function remove(ctx: DbContext, coll: unknown, id: unknown) {
  const c = collection(coll);
  if (typeof id !== "string" || !ID.test(id)) return { borrados: 0 };
  const o = owner(ctx);
  const r = open().prepare(`DELETE FROM registros WHERE ambito = ? AND coleccion = ? AND id = ?${o.sql}`).run(ctx.scope, c, id, ...o.params);
  return { borrados: r.changes };
}

export function clear(ctx: DbContext, coll?: unknown) {
  const o = owner(ctx);
  const d = open();
  const r =
    coll === undefined || coll === null
      ? d.prepare(`DELETE FROM registros WHERE ambito = ?${o.sql}`).run(ctx.scope, ...o.params)
      : d.prepare(`DELETE FROM registros WHERE ambito = ? AND coleccion = ?${o.sql}`).run(ctx.scope, collection(coll), ...o.params);
  return { borrados: r.changes };
}

export function collections(ctx: DbContext) {
  const o = owner(ctx);
  return open()
    .prepare(`SELECT coleccion, COUNT(*) total FROM registros WHERE ambito = ?${o.sql} GROUP BY coleccion ORDER BY coleccion`)
    .all(ctx.scope, ...o.params);
}

/** Ejecuta una operación pedida por una app (a través del puente). */
export function execute(ctx: DbContext, op: unknown, args: unknown[]) {
  const a = Array.isArray(args) ? args : [];
  switch (op) {
    case "guardar":
      return save(ctx, a[0], a[1]);
    case "obtener":
      return get(ctx, a[0], a[1]);
    case "listar":
      return list(ctx, a[0], (a[1] as ListOptions) || {});
    case "borrar":
      return remove(ctx, a[0], a[1]);
    case "vaciar":
      return clear(ctx, a[0]);
    case "colecciones":
      return collections(ctx);
    default:
      throw new DbError("Operación no permitida.");
  }
}

// --- Gestión (responsable de la app / revisores) -----------------------------

export function exportScope(scope: string) {
  const rows = open()
    .prepare("SELECT coleccion, id, datos, creado, actualizado, propietario FROM registros WHERE ambito = ? ORDER BY coleccion, creado")
    .all(scope) as (Row & { coleccion: string })[];
  return rows.map((r) => ({ coleccion: r.coleccion, ...toRecord(r) }));
}

export function stats(scope: string): { registros: number } {
  return { registros: (open().prepare("SELECT COUNT(*) n FROM registros WHERE ambito = ?").get(scope) as { n: number }).n };
}

export function deleteScope(scope: string): number {
  return open().prepare("DELETE FROM registros WHERE ambito = ?").run(scope).changes;
}

/** Borra los registros que superan el plazo de conservación. */
export function purge(retention: { scope: string; days: number | null }[]): number {
  const d = open();
  let total = 0;
  const cutoff = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  for (const r of retention) {
    if (r.days) total += d.prepare("DELETE FROM registros WHERE ambito = ? AND actualizado < ?").run(r.scope, cutoff(r.days)).changes;
  }
  total += d
    .prepare("DELETE FROM registros WHERE (ambito LIKE 'prueba:%' OR ambito LIKE 'revision:%') AND actualizado < ?")
    .run(cutoff(TEST_TTL_DAYS)).changes;
  return total;
}

/** Solo para pruebas automáticas. */
export function _useDatabase(instance: Database.Database) {
  db = instance;
  init(instance);
}
