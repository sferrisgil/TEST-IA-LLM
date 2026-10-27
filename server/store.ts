/**
 * Almacén de publicaciones: los datos en la base de datos (tabla
 * "publicaciones", compartida entre procesos) y un HTML por versión en disco.
 */
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { Publication } from "../shared/publishing";
import { documents } from "./db";

const DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
const INDEX = path.join(DATA_DIR, "publicaciones.json");
const APPS_DIR = path.join(DATA_DIR, "apps");

const table = documents<Publication>("publicaciones", INDEX);

function ensureDirs() {
  fs.mkdirSync(APPS_DIR, { recursive: true, mode: 0o750 });
}

function writeAtomic(file: string, content: string) {
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, content, { mode: 0o640 });
  fs.renameSync(tmp, file);
}

function htmlFile(id: string, version: number) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Identificador no válido");
  return path.join(APPS_DIR, `${id}-v${version}.html`);
}

export const store = {
  all(): Publication[] {
    return table.all();
  },
  get(id: string): Publication | undefined {
    return table.get(id);
  },
  save(p: Publication, html?: string) {
    if (html !== undefined) {
      ensureDirs();
      writeAtomic(htmlFile(p.id, p.version), html);
    }
    table.save(p);
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
