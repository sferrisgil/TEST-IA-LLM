import { useState } from "react";
import { ExternalLink, Loader2, Rocket, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Section } from "@/components/fields";
import { publishDecision } from "@/shared/publishing";
import type { Answers, Assessment } from "@/shared/policy";
import { api, STATUS_LABEL, type PublicationSummary } from "@/src/api";

export function PublishPanel({
  answers,
  assessment,
  code,
  stale,
  publishedId,
  setPublishedId,
  members,
  setMembers,
}: {
  answers: Answers;
  assessment: Assessment;
  code: string | null;
  stale: boolean;
  publishedId: string | null;
  setPublishedId: (id: string) => void;
  members: string;
  setMembers: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PublicationSummary | null>(null);
  const decision = publishDecision(answers, assessment);
  const needsMembers = answers.audience === "equipo";

  async function publish() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ publicacion: PublicationSummary }>("/api/publicaciones", {
        id: publishedId || undefined,
        respuestas: answers,
        codigo: code,
        miembros: members,
        compromisosAceptados: true,
      });
      setResult(r.publicacion);
      setPublishedId(r.publicacion.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!decision.allowed) return null;

  const membersHelp: Record<string, string> = {
    equipo: "Usuarios de red de tu equipo (por ejemplo: luis.martin, eva.ruiz). Obligatorio.",
    departamento: "Opcional: personas de otros departamentos que también deban acceder.",
    externos: "Opcional: usuarios de las contratas autorizadas. Si lo dejas vacío, podrá acceder cualquier contrata con VPN.",
  };

  return (
    <Section
      title={publishedId ? "Publicar nueva versión en la intranet" : "Publicar en la intranet"}
      description="La app quedará disponible en el servidor interno del Ayuntamiento, accesible desde la red municipal y, si procede, para las contratas por VPN."
    >
      <ul className="space-y-1 text-sm">
        {decision.reasons.map((r, i) => (
          <li key={i} className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-blue-600" /> {r}
          </li>
        ))}
      </ul>

      {membersHelp[answers.audience] && (
        <Field label={needsMembers ? "Personas del equipo" : "Accesos adicionales"} hint={membersHelp[answers.audience]} htmlFor="miembros">
          <Input id="miembros" value={members} onChange={(e) => setMembers(e.target.value)} placeholder="usuario1, usuario2" />
        </Field>
      )}

      {stale && <p className="text-sm text-amber-700">Has cambiado las respuestas: adapta la aplicación en el paso «Construir» antes de publicar.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {result ? (
        <div className="rounded-lg border border-emerald-500 bg-emerald-50 p-3 text-sm text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100">
          <p className="font-medium">
            {STATUS_LABEL[result.estado]} · versión {result.version}
          </p>
          <p>
            {result.estado === "publicada"
              ? "Ya está disponible para las personas autorizadas."
              : "TI y el DPD la revisarán. Puedes seguir su estado en «Mis apps»."}
          </p>
          <a className="mt-1 inline-flex items-center gap-1 underline" href={result.url} target="_blank" rel="noreferrer">
            Abrir <ExternalLink className="size-3.5" />
          </a>
        </div>
      ) : (
        <Button onClick={publish} disabled={busy || !code || stale || (needsMembers && !members.trim())}>
          {busy ? <Loader2 className="animate-spin" /> : <Rocket />}
          {decision.needsReview ? "Enviar a revisión" : "Publicar"}
        </Button>
      )}
    </Section>
  );
}
