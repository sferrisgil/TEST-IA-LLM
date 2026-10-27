import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assess, commitments as getCommitments, emptyAnswers, LEVEL_INFO, type Answers } from "@/shared/policy";
import type { ScanFinding } from "@/shared/codeScan";
import { IdeaStep, type Clarification } from "@/src/steps/IdeaStep";
import { DataStep } from "@/src/steps/DataStep";
import { UsageStep } from "@/src/steps/UsageStep";
import { AssessmentStep, LEVEL_STYLE } from "@/src/steps/AssessmentStep";
import { BuildStep, type Version } from "@/src/steps/BuildStep";
import { FichaStep } from "@/src/steps/FichaStep";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Tu idea", subtitle: "Describe lo que necesitas" },
  { title: "Los datos", subtitle: "Qué información usará" },
  { title: "El uso", subtitle: "Quién y cómo la usará" },
  { title: "Evaluación", subtitle: "Riesgos y compromisos" },
  { title: "Construir", subtitle: "Crea y ajusta tu app" },
  { title: "Ficha", subtitle: "Registro y entrega" },
];

export default function App() {
  const [step, setStepRaw] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const setStep = (fn: number | ((s: number) => number)) =>
    setStepRaw((s) => {
      const n = typeof fn === "function" ? fn(s) : fn;
      setMaxStep((m) => Math.max(m, n));
      return n;
    });
  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [clarifications, setClarifications] = useState<Clarification[]>([]);
  const [accepted, setAccepted] = useState<boolean[]>([]);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [findings, setFindings] = useState<ScanFinding[]>([]);
  const [status, setStatus] = useState<{ modoDemo: boolean; correoDpd: string }>({ modoDemo: false, correoDpd: "" });

  useEffect(() => {
    fetch("/api/estado")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  const update = (p: Partial<Answers>) => setAnswers((a) => ({ ...a, ...p }));
  const assessment = useMemo(() => assess(answers), [answers]);
  const commitments = useMemo(() => getCommitments(assessment), [assessment]);
  const allAccepted = commitments.length > 0 && commitments.every((_, i) => accepted[i]);

  // Si cambian los compromisos (porque cambian las respuestas) hay que volver a aceptarlos.
  const commitmentsKey = commitments.join("|");
  useEffect(() => {
    setAccepted([]);
    setAcceptedAt(null);
  }, [commitmentsKey]);

  const details = clarifications
    .filter((c) => c.answer.trim())
    .map((c) => `- ${c.question} ${c.answer}`)
    .join("\n");

  const canNext = (() => {
    if (step === 0) return answers.description.trim().length >= 15 && !!answers.appName.trim() && !!answers.owner.trim() && !!answers.department.trim();
    if (step === 1) return answers.data.length > 0 && (answers.origin.length > 0 || answers.data.includes("ninguno"));
    if (step === 3) return assessment.level !== "no_permitido" && allAccepted;
    if (step === 4) return versions.length > 0;
    return step < STEPS.length - 1;
  })();
  const missingHint = [
    "Completa la descripción (al menos una frase), el nombre, la persona responsable y el departamento.",
    "Marca al menos un tipo de información y su origen.",
    "",
    assessment.level === "no_permitido" ? "Esta aplicación no se puede construir en autoservicio. Puedes revisar tus respuestas o ir directamente a la ficha." : "Acepta todos los compromisos para continuar.",
    "Espera a que se genere la primera versión.",
    "",
  ][step];

  function next() {
    if (step === 3 && !acceptedAt) setAcceptedAt(new Date().toISOString());
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0 });
  }

  const style = LEVEL_STYLE[assessment.level];

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-[#1f4e79] text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Building2 className="size-7" />
          <div className="flex-1">
            <h1 className="text-lg leading-tight font-semibold">Taller de Apps IA</h1>
            <p className="text-xs text-white/80">Crea tus propias herramientas de forma segura · Ayuntamiento</p>
          </div>
          {status.modoDemo && (
            <span className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs" title="No hay clave de IA configurada">
              <FlaskConical className="size-3.5" /> Modo demostración
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <nav aria-label="Pasos" className="mb-6">
          <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {STEPS.map((s, i) => {
              // Tras la evaluación solo se puede avanzar con los compromisos aceptados.
              const blocked = assessment.level === "no_permitido";
              const reachable =
                i <= maxStep && (i <= 3 || (i === 5 && blocked) || (!blocked && allAccepted && (i === 4 || versions.length > 0)));
              return (
                <li key={s.title}>
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => setStep(i)}
                    aria-current={i === step ? "step" : undefined}
                    className={cn(
                      "w-full rounded-lg border bg-card p-2 text-left transition-colors disabled:opacity-50",
                      i === step && "border-blue-600 ring-2 ring-blue-600/20",
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full text-[0.65rem] font-semibold",
                          i < step ? "bg-blue-600 text-white" : "bg-muted",
                        )}
                      >
                        {i < step ? <Check className="size-3" /> : i + 1}
                      </span>
                      {s.title}
                    </span>
                    <span className="hidden text-xs text-muted-foreground lg:block">{s.subtitle}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">{STEPS[step].title}</h2>
            <p className="text-sm text-muted-foreground">{STEPS[step].subtitle}</p>
          </div>
          {step >= 1 && step !== 3 && (
            <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", style.box)}>{LEVEL_INFO[assessment.level].label}</span>
          )}
        </div>

        <main>
          {step === 0 && <IdeaStep answers={answers} update={update} clarifications={clarifications} setClarifications={setClarifications} />}
          {step === 1 && <DataStep answers={answers} update={update} />}
          {step === 2 && <UsageStep answers={answers} update={update} />}
          {step === 3 && <AssessmentStep assessment={assessment} commitments={commitments} accepted={accepted} setAccepted={setAccepted} />}
          {step === 4 && (
            <BuildStep
              answers={answers}
              assessment={assessment}
              details={details}
              versions={versions}
              setVersions={setVersions}
              setFindings={setFindings}
            />
          )}
          {step === 5 && (
            <FichaStep
              ficha={{ answers, assessment, commitments, acceptedAt, versions: versions.length, findings }}
              dpdEmail={status.correoDpd}
            />
          )}
        </main>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-4">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft /> Atrás
          </Button>
          <p className="flex-1 text-right text-xs text-muted-foreground">{!canNext && missingHint}</p>
          {step === 3 && assessment.level === "no_permitido" ? (
            <Button variant="outline" onClick={() => setStep(5)}>
              Ir a la ficha <ArrowRight />
            </Button>
          ) : (
            step < STEPS.length - 1 && (
              <Button onClick={next} disabled={!canNext}>
                Siguiente <ArrowRight />
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
