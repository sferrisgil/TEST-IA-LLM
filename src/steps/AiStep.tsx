import { Bot, Cpu, Scale, TriangleAlert } from "lucide-react";
import { Choice, Section } from "@/components/fields";
import {
  AI_ACT_LABEL, AI_DOMAINS, AI_OPTIONS, AI_TASKS, CAPABILITY_LABEL, PROHIBITED_PRACTICES,
  type AiAnswers, type AiAssessment,
} from "@/shared/aiAct";
import type { Answers } from "@/shared/policy";
import { cn } from "@/lib/utils";

const CATEGORY_STYLE: Record<AiAssessment["category"], string> = {
  prohibida: "border-red-600 bg-red-50 text-red-950 dark:bg-red-950/30 dark:text-red-100",
  alto_riesgo: "border-orange-600 bg-orange-50 text-orange-950 dark:bg-orange-950/30 dark:text-orange-100",
  revisar_art6: "border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100",
  transparencia: "border-blue-500 bg-blue-50 text-blue-950 dark:bg-blue-950/30 dark:text-blue-100",
  riesgo_minimo: "border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100",
};

const HOSTING = { local: "Servidores municipales", ue: "Nube (UE)", fuera_ue: "Nube (fuera de la UE)" };

/** Resultado de la evaluación de IA (se reutiliza en el paso de evaluación). */
export function AiResult({ ai, compact = false }: { ai: AiAssessment; compact?: boolean }) {
  return (
    <div className="space-y-3">
      <div className={cn("rounded-xl border-2 p-4", CATEGORY_STYLE[ai.category])}>
        <p className="flex items-center gap-2 font-semibold">
          <Scale className="size-5" /> Reglamento de IA: {AI_ACT_LABEL[ai.category]}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
          {ai.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <p className="flex items-center gap-2 font-semibold">
          <Cpu className="size-5" /> Complejidad de la tarea: {CAPABILITY_LABEL[ai.complexity]}
        </p>
        {!compact && (
          <ul className="mt-1 list-disc pl-6 text-xs text-muted-foreground">
            {ai.complexityFactors.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm">
          {ai.recommended ? (
            <>
              Modelo asignado: <strong>{ai.recommended.name}</strong> ({HOSTING[ai.recommended.hosting]}, capacidad {CAPABILITY_LABEL[ai.recommended.capability]})
            </>
          ) : (
            <strong className="text-destructive">Ningún modelo disponible es adecuado.</strong>
          )}
        </p>
        {!compact && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b">
                  <th className="py-1 pr-2">Modelo</th>
                  <th className="py-1 pr-2">Dónde</th>
                  <th className="py-1 pr-2">Capacidad</th>
                  <th className="py-1">¿Sirve?</th>
                </tr>
              </thead>
              <tbody>
                {ai.options.map((o) => (
                  <tr key={o.model.id} className={cn("border-b last:border-0", ai.recommended?.id === o.model.id && "font-medium")}>
                    <td className="py-1 pr-2">{o.model.name}</td>
                    <td className="py-1 pr-2">{HOSTING[o.model.hosting]}</td>
                    <td className="py-1 pr-2">{CAPABILITY_LABEL[o.model.capability]}</td>
                    <td className={cn("py-1", o.suitable ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                      {o.suitable ? (ai.recommended?.id === o.model.id ? "Sí · elegido (el más económico adecuado)" : "Sí") : o.reasons.join(" ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {ai.warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          {ai.warnings.map((w, i) => (
            <li key={i} className="flex gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AiStep({
  answers,
  update,
  result,
}: {
  answers: Answers;
  update: (p: Partial<Answers>) => void;
  result: AiAssessment | null;
}) {
  if (answers.aiUse === "no" || !result) {
    return (
      <Section title="Esta aplicación no usa IA mientras se usa">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Bot className="size-4" /> La IA solo te ayuda a construirla, así que no hace falta esta evaluación. Si cambias de idea, vuelve al paso «El uso».
        </p>
      </Section>
    );
  }
  const ai = answers.ai;
  const set = (p: Partial<AiAnswers>) => update({ ai: { ...ai, ...p } });
  const kind = answers.appKind === "automatizacion" ? "la automatización" : "la aplicación";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        <Section title={`¿Qué tiene que hacer la IA en ${kind}?`} description="Marca todas las tareas.">
          <Choice options={AI_TASKS} value={ai.tasks} onChange={(tasks) => set({ tasks })} multiple />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4" checked={ai.referenceDocs} onChange={(e) => set({ referenceDocs: e.target.checked })} />
            Necesita apoyarse en documentos propios del Ayuntamiento (ordenanzas, procedimientos, instrucciones…).
          </label>
        </Section>

        <Section
          title="¿Interviene en alguno de estos ámbitos?"
          description="Son ámbitos de alto riesgo según el Reglamento europeo de IA (Anexo III). Márcalo aunque la IA solo ayude."
        >
          <Choice options={AI_DOMAINS.map((d) => ({ id: d.id, label: d.label, help: d.ref }))} value={ai.domains} onChange={(domains) => set({ domains })} multiple columns={1} />
        </Section>

        <Section title="¿Hará la IA alguna de estas cosas?" description="Son prácticas prohibidas por el Reglamento de IA (art. 5). Lo normal es que no marques ninguna.">
          <Choice
            options={PROHIBITED_PRACTICES.map((d) => ({ id: d.id, label: d.label, help: d.ref }))}
            value={ai.prohibited}
            onChange={(prohibited) => set({ prohibited })}
            multiple
            columns={1}
          />
        </Section>

        <Section title="Transparencia y supervisión">
          <p className="text-sm font-medium">¿La IA conversa directamente con alguien?</p>
          <Choice options={[...AI_OPTIONS.interaction]} value={ai.interaction} onChange={(interaction) => set({ interaction })} columns={3} />
          <p className="text-sm font-medium">¿Los textos de la IA se publican o se envían a la ciudadanía?</p>
          <Choice options={[...AI_OPTIONS.publishes]} value={ai.publishes} onChange={(publishes) => set({ publishes })} columns={3} />
          <p className="text-sm font-medium">¿Quién revisa lo que hace la IA?</p>
          <Choice options={[...AI_OPTIONS.oversight]} value={ai.oversight} onChange={(oversight) => set({ oversight })} columns={3} />
        </Section>

        <Section title="Complejidad de la tarea" description="Sirve para elegir el modelo adecuado: ni más potente (y caro) de lo necesario, ni insuficiente.">
          <p className="text-sm font-medium">¿Cuánto razonamiento exige?</p>
          <Choice options={[...AI_OPTIONS.reasoning]} value={ai.reasoning} onChange={(reasoning) => set({ reasoning })} columns={3} />
          <p className="text-sm font-medium">¿Qué extensión tienen los textos que recibe?</p>
          <Choice options={[...AI_OPTIONS.inputSize]} value={ai.inputSize} onChange={(inputSize) => set({ inputSize })} columns={3} />
          <p className="text-sm font-medium">Si la IA se equivoca, ¿qué impacto tiene?</p>
          <Choice options={[...AI_OPTIONS.errorImpact]} value={ai.errorImpact} onChange={(errorImpact) => set({ errorImpact })} columns={3} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">Idiomas</p>
              <Choice options={[...AI_OPTIONS.languages]} value={ai.languages} onChange={(languages) => set({ languages })} columns={1} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Volumen de consultas</p>
              <Choice options={[...AI_OPTIONS.volume]} value={ai.volume} onChange={(volume) => set({ volume })} columns={1} />
            </div>
          </div>
        </Section>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <AiResult ai={result} />
      </div>
    </div>
  );
}
