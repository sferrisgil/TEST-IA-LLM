import { useState } from "react";
import { CalendarClock, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeSchedule, describeSteps, type Schedule, type Workflow } from "@/shared/workflow";
import type { Answers, Assessment } from "@/shared/policy";
import { api } from "@/src/api";
import { cn } from "@/lib/utils";

interface RunResponse {
  estado: "ok" | "error";
  error?: string;
  resumen: { operaciones: number; ia: number; creados: number; actualizados: number; borrados: number; avisos: number };
  log: { t: string; nivel: string; msg: string }[];
  avisosSimulados?: string[];
}

const DAYS = ["L", "M", "X", "J", "V", "S", "D"];

export function ScheduleEditor({ value, onChange }: { value: Schedule; onChange: (s: Schedule) => void }) {
  const hora = "hora" in value ? value.hora : "08:00";
  const set = (tipo: Schedule["tipo"]) => {
    if (tipo === "cada") onChange({ tipo, minutos: 60 });
    if (tipo === "diaria") onChange({ tipo, hora });
    if (tipo === "semanal") onChange({ tipo, dias: [1], hora });
    if (tipo === "mensual") onChange({ tipo, dia: 1, hora });
    if (tipo === "manual") onChange({ tipo });
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select
        aria-label="Tipo de programación"
        className="h-8 rounded-lg border bg-background px-2"
        value={value.tipo}
        onChange={(e) => set(e.target.value as Schedule["tipo"])}
      >
        <option value="cada">Cada cierto tiempo</option>
        <option value="diaria">Cada día</option>
        <option value="semanal">Algunos días de la semana</option>
        <option value="mensual">Una vez al mes</option>
        <option value="manual">Solo a mano</option>
      </select>
      {value.tipo === "cada" && (
        <select
          aria-label="Intervalo"
          className="h-8 rounded-lg border bg-background px-2"
          value={value.minutos}
          onChange={(e) => onChange({ tipo: "cada", minutos: Number(e.target.value) })}
        >
          {[15, 30, 60, 120, 240, 720].map((m) => (
            <option key={m} value={m}>
              {m < 60 ? `${m} minutos` : `${m / 60} hora(s)`}
            </option>
          ))}
        </select>
      )}
      {value.tipo === "semanal" &&
        DAYS.map((d, i) => (
          <button
            key={d}
            type="button"
            aria-pressed={value.dias.includes(i + 1)}
            onClick={() => {
              const dias = value.dias.includes(i + 1) ? value.dias.filter((x) => x !== i + 1) : [...value.dias, i + 1].sort();
              if (dias.length) onChange({ ...value, dias });
            }}
            className={cn("size-8 rounded-full border text-xs", value.dias.includes(i + 1) && "border-blue-600 bg-blue-600 text-white")}
          >
            {d}
          </button>
        ))}
      {value.tipo === "mensual" && (
        <label className="flex items-center gap-1">
          día
          <Input
            type="number"
            min={1}
            max={28}
            value={value.dia}
            onChange={(e) => onChange({ ...value, dia: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })}
            className="h-8 w-16"
          />
        </label>
      )}
      {"hora" in value && (
        <label className="flex items-center gap-1">
          a las
          <Input type="time" value={value.hora} onChange={(e) => e.target.value && onChange({ ...value, hora: e.target.value })} className="h-8 w-28" />
        </label>
      )}
    </div>
  );
}

export function WorkflowPanel({
  answers,
  assessment,
  workflow,
  error,
  onChange,
}: {
  answers: Answers;
  assessment: Assessment;
  workflow: Workflow | null;
  error?: string;
  onChange: (w: Workflow) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<RunResponse | null>(null);
  const [runError, setRunError] = useState("");

  async function test() {
    setBusy(true);
    setRunError("");
    setRun(null);
    try {
      setRun(await api<RunResponse>("/api/flujo-prueba", { respuestas: answers, flujo: workflow }));
    } catch (e: any) {
      setRunError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <CalendarClock className="size-5" /> Automatización programada
      </h3>
      {assessment.constraints.storage !== "bd" ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Para que se ejecute sola necesita guardar los datos en la base de datos municipal. Cámbialo en el paso «El uso».
        </p>
      ) : !workflow ? (
        <p className="text-sm text-muted-foreground">
          {error ? `El flujo propuesto no es válido: ${error}. Pide a la IA que lo corrija.` : "Todavía no hay flujo. Describe en la conversación qué debe hacer y cuándo."}
        </p>
      ) : (
        <>
          <div className="space-y-1">
            <p className="text-sm font-medium">Cuándo se ejecuta</p>
            <ScheduleEditor value={workflow.programacion} onChange={(programacion) => onChange({ ...workflow, programacion })} />
            <p className="text-xs text-muted-foreground">{describeSchedule(workflow.programacion)} (hora del servidor municipal)</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Qué hace</p>
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{describeSteps(workflow.pasos).join("\n")}</pre>
            <p className="text-xs text-muted-foreground">Para cambiar los pasos, pídeselo a la IA en la conversación.</p>
          </div>
          {error && <p className="text-sm text-amber-700">La última propuesta de la IA no era válida ({error}); se mantiene el flujo anterior.</p>}
          <Button variant="outline" onClick={test} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Play />} Probar ahora (base de datos de pruebas)
          </Button>
          {runError && <p className="text-sm text-destructive">{runError}</p>}
          {run && (
            <div className={cn("space-y-1 rounded-md border p-3 text-xs", run.estado === "error" && "border-destructive")}>
              <p className="font-medium">
                {run.estado === "ok" ? "Ejecución correcta" : `Error: ${run.error}`} · {run.resumen.creados} creados · {run.resumen.actualizados} actualizados ·{" "}
                {run.resumen.borrados} borrados · {run.resumen.ia} consultas IA
              </p>
              {run.log.map((l, i) => (
                <p key={i} className={l.nivel === "error" ? "text-destructive" : l.nivel === "aviso" ? "text-amber-700" : "text-muted-foreground"}>
                  {l.msg}
                </p>
              ))}
              {run.avisosSimulados?.map((m, i) => (
                <p key={`n${i}`}>✉ Aviso (no enviado en pruebas): {m}</p>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
