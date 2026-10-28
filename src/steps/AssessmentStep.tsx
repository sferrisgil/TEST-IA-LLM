import { Ban, CheckCircle2, ClipboardList, ShieldCheck, TriangleAlert } from "lucide-react";
import { Section } from "@/components/fields";
import { LEVEL_INFO, type Assessment } from "@/shared/policy";
import { cn } from "@/lib/utils";
import { AiResult } from "@/src/steps/AiStep";

export const LEVEL_STYLE: Record<Assessment["level"], { box: string; icon: typeof Ban }> = {
  bajo: { box: "border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100", icon: CheckCircle2 },
  medio: { box: "border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100", icon: TriangleAlert },
  alto: { box: "border-orange-600 bg-orange-50 text-orange-950 dark:bg-orange-950/30 dark:text-orange-100", icon: TriangleAlert },
  no_permitido: { box: "border-red-600 bg-red-50 text-red-950 dark:bg-red-950/30 dark:text-red-100", icon: Ban },
};

export function AssessmentStep({
  assessment,
  commitments,
  accepted,
  setAccepted,
}: {
  assessment: Assessment;
  commitments: string[];
  accepted: boolean[];
  setAccepted: (a: boolean[]) => void;
}) {
  const style = LEVEL_STYLE[assessment.level];
  const Icon = style.icon;
  const blocked = assessment.level === "no_permitido";

  return (
    <div className="space-y-4">
      <div className={cn("rounded-xl border-2 p-5", style.box)} role="status">
        <div className="flex items-center gap-3">
          <Icon className="size-8 shrink-0" />
          <div>
            <p className="text-lg font-semibold">{LEVEL_INFO[assessment.level].label}</p>
            <p className="text-sm">{LEVEL_INFO[assessment.level].summary}</p>
          </div>
        </div>
        <ul className="mt-4 list-disc space-y-1 pl-6 text-sm">
          {assessment.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs opacity-80">
          Puntuación orientativa: {assessment.score}/100 · Categoría ENS orientativa: {assessment.ensCategory}
        </p>
      </div>

      {assessment.ai && <AiResult ai={assessment.ai} compact />}

      {!blocked && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Lo que hará la herramienta por ti">
            <ul className="space-y-2 text-sm">
              {assessment.controls.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  {c}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Lo que te corresponde a ti">
            <ul className="space-y-2 text-sm">
              {assessment.obligations.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <ClipboardList className="mt-0.5 size-4 shrink-0 text-blue-600" />
                  {c}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {blocked ? (
        <Section title="¿Y ahora qué?">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Vuelve atrás y revisa tus respuestas: quizá puedas reducir los datos o limitar quién la usa.</li>
            <li>Si de verdad la necesitas así, descarga la ficha en el último paso y envíala a TI y al Delegado de Protección de Datos.</li>
          </ul>
        </Section>
      ) : (
        <Section title="Compromisos de uso" description="Marca cada compromiso para continuar.">
          <div className="space-y-2">
            {commitments.map((c, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm hover:bg-muted">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-blue-600"
                  checked={!!accepted[i]}
                  onChange={(e) => setAccepted(commitments.map((_, j) => (j === i ? e.target.checked : !!accepted[j])))}
                />
                {c}
              </label>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
