/**
 * Catálogo de modelos de IA disponibles y llamada al modelo asignado.
 *
 * TI define el catálogo en un fichero JSON (MODELS_FILE). Cada modelo indica
 * sus características (para la evaluación) y cómo conectarse a él:
 *  - provider "gemini": API de Google Gemini (GEMINI_API_KEY).
 *  - provider "openai": cualquier servidor compatible con la API de OpenAI
 *    (vLLM, Ollama, LM Studio, Azure OpenAI…), por ejemplo un modelo local.
 */
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { DEFAULT_MODELS, sanitizeModels, type ModelInfo } from "../shared/aiAct";

interface Connection {
  provider: "gemini" | "openai";
  /** Nombre del modelo en el proveedor. */
  providerModel: string;
  /** Solo "openai": URL base, p. ej. http://ia.intranet:8000/v1 */
  baseUrl?: string;
  /** Solo "openai": nombre de la variable de entorno con la clave (opcional). */
  apiKeyEnv?: string;
}

type CatalogEntry = ModelInfo & { connection: Connection };

const GEMINI_KEY = process.env.GEMINI_API_KEY;
export const GEMINI_CONFIGURED = !!GEMINI_KEY && GEMINI_KEY !== "MY_GEMINI_API_KEY";
const gemini = GEMINI_CONFIGURED
  ? new GoogleGenAI({ apiKey: GEMINI_KEY, httpOptions: { headers: { "User-Agent": "taller-apps-ia-municipal" } } })
  : null;

const BUILD_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";

const DEFAULT_CONNECTIONS: Record<string, Connection> = {
  "local-basico": { provider: "openai", providerModel: process.env.LOCAL_MODEL || "modelo-local", baseUrl: process.env.LOCAL_MODEL_URL },
  rapido: { provider: "gemini", providerModel: process.env.GEMINI_FAST_MODEL || BUILD_MODEL },
  avanzado: { provider: "gemini", providerModel: BUILD_MODEL },
};

function loadCatalog(): CatalogEntry[] {
  const file = process.env.MODELS_FILE;
  if (!file) {
    return DEFAULT_MODELS.map((m) => ({
      ...m,
      // El modelo local solo está disponible si TI configura su URL.
      available: m.id === "local-basico" ? !!process.env.LOCAL_MODEL_URL : m.available,
      connection: DEFAULT_CONNECTIONS[m.id],
    }));
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>[];
  const models = sanitizeModels(raw);
  return models.map((m, i) => {
    const c = (raw[i].connection || {}) as Partial<Connection>;
    if (c.provider !== "gemini" && c.provider !== "openai") throw new Error(`Modelo ${m.id}: falta connection.provider ("gemini" u "openai")`);
    if (!c.providerModel) throw new Error(`Modelo ${m.id}: falta connection.providerModel`);
    if (c.provider === "openai" && !c.baseUrl) throw new Error(`Modelo ${m.id}: falta connection.baseUrl`);
    return { ...m, connection: c as Connection };
  });
}

const catalog = loadCatalog();

/** Catálogo sin datos de conexión (para el navegador y la evaluación). */
export function models(): ModelInfo[] {
  return catalog.map(({ connection: _c, ...m }) => m);
}

export interface AiCall {
  modelId: string;
  system: string;
  text: string;
  maxOutputTokens?: number;
}

/** Llama al modelo indicado. En modo demostración devuelve una respuesta simulada. */
export async function callModel({ modelId, system, text, maxOutputTokens = 2048 }: AiCall): Promise<string> {
  const entry = catalog.find((m) => m.id === modelId);
  if (!entry || !entry.available) throw new Error("El modelo de IA asignado a esta aplicación ya no está disponible. Publica una nueva versión.");
  const c = entry.connection;

  if (c.provider === "gemini") {
    if (!gemini) return `[Modo demostración · ${entry.name}] Respuesta simulada a: "${text.slice(0, 200)}"`;
    const r = await gemini.models.generateContent({ model: c.providerModel, contents: text, config: { systemInstruction: system, maxOutputTokens } });
    return r.text || "";
  }

  const key = c.apiKeyEnv ? process.env[c.apiKeyEnv] : undefined;
  const r = await fetch(`${c.baseUrl!.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({
      model: c.providerModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: text },
      ],
      max_tokens: maxOutputTokens,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`El modelo ${entry.name} ha respondido con error ${r.status}`);
  const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content || "";
}
