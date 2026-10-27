import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assess, commitments as getCommitments, emptyAnswers, LEVEL_INFO, type Answers } from "@/shared/policy";
import type { ScanFinding } from "@/shared/codeScan";
import { IdeaStep, type Clarification } from "@/src/steps/IdeaStep";
import { DataStep } from "@/src/steps/DataStep";
import { UsageStep } from "@/src/steps/UsageStep";
import { AssessmentStep, LEVEL_STYLE } from "@/src/steps/AssessmentStep";
import { BuildStep, type Version } from "@/src/steps/BuildStep";
import { FichaStep } from "@/src/steps/FichaStep";
import { PublishPanel } from "@/src/steps/PublishPanel";
import { api, type Me } from "@/src/api";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Tu idea", subtitle: "Describe lo que necesitas" },
  { title: "Los datos", subtitle: "Qué información usará" },
  { title: "El uso", subtitle: "Quién y cómo la usará" },
  { title: "Evaluación", subtitle: "Riesgos y compromisos" },
  { title: "Construir", subtitle: "Crea y ajusta tu app" },
  { title: "Ficha", subtitle: "Registro y entrega" },
];

export interface Status {
  modoDemo: boolean;
  correoDpd: string;
}

export function Builder({ me, status, editId }: { me: Me; status: Status; editId: { id: string; n: number } | null }) {
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
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [members, setMembers] = useState("");
  const [loadError, setLoadError] = useState("");

  // El responsable es la persona identificada (SSO); el departamento se propone.
  useEffect(() => {
    setAnswers((a) => ({ ...a, owner: a.owner || me.nombre, department: a.department || me.departamento }));
  }, [me]);

  // Reabrir una app publicada para crear una nueva versión.
  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        setLoadError("");
        const d = await api<{ id: string; respuestas: Answers; codigo: string | null; miembros: string[] }>(`/api/publicaciones/${editId.id}/editar`);
        const a = { ...d.respuestas, owner: me.nombre };
        setAnswers(a);
        setPublishedId(d.id);
        setEditing(true);
        setMembers(d.miembros.join(", "));
        setClarifications([]);
        setVersions([]);
        if (d.codigo) {
          const pv = await api<{ codigo: string | null; vistaPrevia: string | null; hallazgos: ScanFinding[] }>("/api/vista-previa", { respuestas: a, codigo: d.codigo });
          if (pv.codigo && pv.vistaPrevia) {
            setVersions([{ code: pv.codigo, preview: pv.vistaPrevia, constraintsKey: JSON.stringify(assess(a).constraints) }]);
            setFindings(pv.hallazgos);
          }
        }
        setStepRaw(3);
        setMaxStep(3);
        window.scrollTo({ top: 0 });
      } catch (e: any) {
        setLoadError(e.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  function reset() {
    if (!confirm("¿Empezar una aplicación nueva? Se perderá lo que no hayas descargado o publicado.")) return;
    setAnswers({ ...emptyAnswers(), owner: me.nombre, department: me.departamento });
    setClarifications([]);
    setVersions([]);
    setFindings([]);
    setPublishedId(null);
    setEditing(false);
    setMembers("");
    setStepRaw(0);
    setMaxStep(0);
  }

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
    <div>
      {loadError && <p className="mb-4 text-sm text-destructive">{loadError}</p>}
      {editing && (
        <p className="mb-4 rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-950 dark:bg-blue-950/30 dark:text-blue-100">
          Estás preparando una nueva versión de una aplicación publicada. Revisa las respuestas y vuelve a aceptar los compromisos.
        </p>
      )}
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
          <div className="flex items-center gap-2">
            {step >= 1 && step !== 3 && (
              <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", style.box)}>{LEVEL_INFO[assessment.level].label}</span>
            )}
            {maxStep > 0 && (
              <Button size="sm" variant="ghost" onClick={reset}>
                Nueva app
              </Button>
            )}
          </div>
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
            <div className="space-y-4">
              {versions.length > 0 && assessment.level !== "no_permitido" && (
                <PublishPanel
                  answers={answers}
                  assessment={assessment}
                  code={versions[versions.length - 1].code}
                  stale={versions[versions.length - 1].constraintsKey !== JSON.stringify(assessment.constraints)}
                  publishedId={publishedId}
                  setPublishedId={setPublishedId}
                  members={members}
                  setMembers={setMembers}
                />
              )}
              <FichaStep
                ficha={{ answers, assessment, commitments, acceptedAt, versions: versions.length, findings }}
                dpdEmail={status.correoDpd}
              />
            </div>
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
  );
}
