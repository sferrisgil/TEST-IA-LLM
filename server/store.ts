/**
 * Almacén de publicaciones en disco (JSON + un HTML por versión).
 * Suficiente para un servidor interno; puede sustituirse por una base de datos
 * manteniendo esta misma interfaz.
 */
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { Publication } from "../shared/publishing";

const DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
const INDEX = path.join(DATA_DIR, "publicaciones.json");
const APPS_DIR = path.join(DATA_DIR, "apps");

let cache: Publication[] | null = null;

function ensureDirs() {
  fs.mkdirSync(APPS_DIR, { recursive: true, mode: 0o750 });
}

function writeAtomic(file: string, content: string) {
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, content, { mode: 0o640 });
  fs.renameSync(tmp, file);
}

function load(): Publication[] {
  if (cache) return cache;
  ensureDirs();
  cache = fs.existsSync(INDEX) ? (JSON.parse(fs.readFileSync(INDEX, "utf8")) as Publication[]) : [];
  return cache;
}

function persist() {
  writeAtomic(INDEX, JSON.stringify(cache, null, 2));
}

function htmlFile(id: string, version: number) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Identificador no válido");
  return path.join(APPS_DIR, `${id}-v${version}.html`);
}

export const store = {
  all(): Publication[] {
    return load();
  },
  get(id: string): Publication | undefined {
    return load().find((p) => p.id === id);
  },
  save(p: Publication, html?: string) {
    const list = load();
    if (html !== undefined) {
      ensureDirs();
      writeAtomic(htmlFile(p.id, p.version), html);
    }
    const i = list.findIndex((x) => x.id === p.id);
    if (i >= 0) list[i] = p;
    else list.push(p);
    persist();
  },
  html(p: Publication): string | null {
    const f = htmlFile(p.id, p.version);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
  },
  newId(name: string): string {
    const base =
      name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "app";
    let id: string;
    do id = `${base}-${randomBytes(3).toString("hex")}`;
    while (this.get(id));
    return id;
  },
};
