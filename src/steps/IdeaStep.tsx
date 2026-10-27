import { useMemo, useState } from "react";
import { Lightbulb, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Section } from "@/components/fields";
import { detectPii } from "@/shared/pii";
import type { Answers } from "@/shared/policy";

export interface Clarification {
  question: string;
  answer: string;
}

export function IdeaStep({
  answers,
  update,
  clarifications,
  setClarifications,
}: {
  answers: Answers;
  update: (p: Partial<Answers>) => void;
  clarifications: Clarification[];
  setClarifications: (c: Clarification[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pii = useMemo(
    () => detectPii(`${answers.description}\n${clarifications.map((c) => c.answer).join("\n")}`).filter((f) => f.kind !== "palabra_clave"),
    [answers.description, clarifications],
  );

  async function clarify() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/aclarar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respuestas: answers }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (!answers.appName && data.nombre) update({ appName: data.nombre });
      if (!answers.purpose && data.finalidad) update({ purpose: data.finalidad });
      setClarifications((data.preguntas || []).slice(0, 5).map((q: string) => ({ question: q, answer: "" })));
    } catch (e: any) {
      setError(e.message || "Error al contactar con la IA");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Section title="¿Qué aplicación necesitas?" description="Cuéntalo con tus palabras, como se lo explicarías a un compañero.">
        <Field label="Descripción de la idea" htmlFor="desc" hint="Qué problema resuelve, quién la usará y qué debería hacer.">
          <Textarea
            id="desc"
            rows={6}
            value={answers.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Ej.: Quiero una app para llevar el control de las salas de reuniones del edificio: quién la ha reservado, qué día y a qué hora, y que avise si hay solapes."
          />
        </Field>
        <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <span>No escribas datos reales de personas (nombres, DNI, teléfonos…). Si se te escapa alguno, se sustituirá por un marcador antes de enviarlo a la IA.</span>
        </div>
        {pii.length > 0 && (
          <p className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Hemos detectado posibles datos personales ({pii.map((p) => p.label.toLowerCase()).join(", ")}). Se enmascararán, pero es mejor que los quites.
          </p>
        )}
        <Button variant="outline" onClick={clarify} disabled={loading || answers.description.trim().length < 15}>
          {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Ayúdame a concretar la idea
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Section>

      {clarifications.length > 0 && (
        <Section title="Algunas preguntas para afinar" description="Responde las que puedas; el resto se decidirá con sentido común.">
          {clarifications.map((c, i) => (
            <div key={i}>
            <Field label={c.question} htmlFor={`q${i}`}>
              <Textarea
                id={`q${i}`}
                rows={2}
                value={c.answer}
                onChange={(e) => setClarifications(clarifications.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
              />
            </Field>
            </div>
          ))}
        </Section>
      )}

      <Section title="Identificación" description="Toda aplicación debe tener una persona responsable.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre de la aplicación" htmlFor="name">
            <Input id="name" value={answers.appName} onChange={(e) => update({ appName: e.target.value })} placeholder="Reserva de salas" />
          </Field>
          <Field label="Finalidad (una frase)" htmlFor="purpose">
            <Input id="purpose" value={answers.purpose} onChange={(e) => update({ purpose: e.target.value })} placeholder="Organizar las reservas de salas" />
          </Field>
          <Field label="Persona responsable" htmlFor="owner">
            <Input id="owner" value={answers.owner} onChange={(e) => update({ owner: e.target.value })} placeholder="Nombre y apellidos" />
          </Field>
          <Field label="Departamento o servicio" htmlFor="dept">
            <Input id="dept" value={answers.department} onChange={(e) => update({ department: e.target.value })} placeholder="Servicios Generales" />
          </Field>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lightbulb className="size-3.5" /> El nombre del responsable solo se usa en la ficha y en el pie de la app; no se envía a la IA como dato a tratar.
        </p>
      </Section>
    </div>
  );
}
