/** Ficha de la aplicación: se genera igual en el navegador y en el servidor. */
import {
  AI_USES, AUDIENCES, DATA_CATEGORIES, DB_SCOPES, DECISIONS, INTEGRATIONS, LEVEL_INFO, ORIGINS, RETENTIONS, STORAGES, VOLUMES,
  type Answers, type Assessment,
} from "./policy";
import type { ScanFinding } from "./codeScan";
import { maskPii } from "./pii";
import { AI_ACT_LABEL, AI_DOMAINS, AI_TASKS, CAPABILITY_LABEL } from "./aiAct";
import { RECIPIENT_LABEL, SCALE_OPTIONS } from "./derivation";

export interface FichaInput {
  answers: Answers;
  assessment: Assessment;
  commitments: string[];
  acceptedAt: string | null;
  versions: number;
  findings: ScanFinding[];
}

const label = <T extends { id: string; label: string }>(list: T[], id: string) => list.find((x) => x.id === id)?.label ?? id;

/** Ficha de la aplicación para el inventario municipal y el Registro de Actividades de Tratamiento. */
export function fichaMarkdown(f: FichaInput): string {
  const { answers: a, assessment: e } = f;
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "- (ninguno)");
  return `# Ficha de aplicación: ${a.appName || "Sin nombre"}

Generada el ${new Date().toLocaleString("es-ES")} con el Taller de Apps IA del Ayuntamiento.

## 1. Identificación
- **Responsable:** ${a.owner || "—"}
- **Departamento:** ${a.department || "—"}
- **Finalidad:** ${a.purpose || "—"}

## 2. Descripción funcional
${maskPii(a.description).text || "—"}

## 3. Datos tratados
${list(a.data.map((d) => label(DATA_CATEGORIES, d)))}
${e.undeclared.length ? `\n**Detectados en los ejemplos sin declarar:** ${e.undeclared.map((d) => label(DATA_CATEGORIES, d)).join(", ")}\n` : ""}
- **Origen:** ${a.origin.map((o) => label(ORIGINS, o)).join("; ") || "—"}
- **Volumen:** ${label(VOLUMES, a.volume)}
- **Conservación:** ${label(RETENTIONS, a.retention)}${a.retention === "limitada" ? ` (${a.retentionDays} días)` : ""}

## 4. Uso
- **Usuarios:** ${label(AUDIENCES, a.audience)}
- **Almacenamiento:** ${label(STORAGES, a.storage)}${a.storage === "base_datos" ? ` — registros: ${label(DB_SCOPES, a.dbScope).toLowerCase()}` : ""}
- **Uso de IA:** ${label(AI_USES, a.aiUse)}
- **Decisiones:** ${label(DECISIONS, a.decisions)}
- **Integraciones:** ${label(INTEGRATIONS, a.integrations)}

### Escala prevista
- **Usuarios a la vez:** ${label([...SCALE_OPTIONS.users], a.scale.users)}
- **Operaciones al día:** ${label([...SCALE_OPTIONS.dailyOps], a.scale.dailyOps)}
- **Registros acumulados:** ${label([...SCALE_OPTIONS.records], a.scale.records)}

${
    e.ai
      ? `## Inteligencia artificial
- **Tipo:** ${a.appKind === "automatizacion" ? "Automatización de un flujo de trabajo" : "Aplicación"}
- **Tareas de la IA:** ${a.ai.tasks.map((t) => label(AI_TASKS, t)).join(", ") || "—"}
- **Ámbitos del Anexo III:** ${a.ai.domains.map((d) => label(AI_DOMAINS, d)).join("; ") || "Ninguno"}
- **Clasificación (Reglamento de IA):** ${AI_ACT_LABEL[e.ai.category]}
- **Complejidad:** ${CAPABILITY_LABEL[e.ai.complexity]}
- **Modelo asignado:** ${e.ai.recommended ? `${e.ai.recommended.name} (${e.ai.recommended.hosting})` : "ninguno adecuado"}
- **Supervisión humana:** ${a.ai.oversight} · **Transparencia exigida:** ${e.constraints.aiDisclosure ? "sí" : "no"}
${e.ai.warnings.length ? `\n**Avisos:**\n${list(e.ai.warnings)}\n` : ""}
`
      : ""
  }## 5. Evaluación de riesgo
- **Nivel:** ${LEVEL_INFO[e.level].label} (puntuación orientativa ${e.score}/100)
- **Categoría ENS orientativa:** ${e.ensCategory}

### Motivos
${list(e.reasons)}

### Medidas técnicas aplicadas
${list(e.controls)}

### Obligaciones del responsable
${list(e.obligations)}

${
    e.derivation.required
      ? `### Derivación
Debe estudiarla: **${e.derivation.recipients.map((r) => RECIPIENT_LABEL[r]).join(" y ")}**.
${list(e.derivation.reasons.map((r) => `${r.text} (${r.to.map((t) => t.toUpperCase()).join(", ")})`))}

`
      : ""
  }## 6. Compromisos aceptados
${f.acceptedAt ? `Aceptados el ${new Date(f.acceptedAt).toLocaleString("es-ES")}:` : "No aceptados."}
${list(f.commitments)}

## 7. Revisión automática del código
- Versiones generadas: ${f.versions}
${list(f.findings.map((x) => `[${x.severity}] ${x.message}`))}

---
Esta ficha recoge lo declarado por la persona responsable. Remítela al Delegado de Protección de Datos${e.level === "bajo" ? " si la aplicación llega a compartirse" : ""}.
`;
}

