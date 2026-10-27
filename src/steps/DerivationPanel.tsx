import { useState } from "react";
import { CheckCircle2, Loader2, Send, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/fields";
import { RECIPIENT_LABEL } from "@/shared/derivation";
import type { Answers, Assessment } from "@/shared/policy";
import type { Workflow } from "@/shared/workflow";
import { api, REQUEST_STATUS_LABEL, type DerivationView } from "@/src/api";

/**
 * Derivación a TI / DPD: explica por qué y envía la propuesta (ficha y, si lo
 * hay, el prototipo) para que la reciban automáticamente.
 */
export function DerivationPanel({
  answers,
  assessment,
  code,
  workflow,
  acceptedAt,
  request,
  setRequest,
}: {
  answers: Answers;
  assessment: Assessment;
  code: string | null;
  workflow: Workflow | null;
  acceptedAt: string | null;
  request: DerivationView | null;
  setRequest: (r: DerivationView) => void;
}) {
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const d = assessment.derivation;
  if (!d.required) return null;

  async function send() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api<DerivationView>("/api/derivaciones", {
        id: request?.id,
        respuestas: answers,
        mensaje: message,
        contacto: contact,
        codigo: code || undefined,
        flujo: workflow || undefined,
        aceptadoEn: acceptedAt,
      });
      setRequest(r);
      setNotice(r.aviso || "");
      setMessage("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const closed = request && ["aprobada", "rechazada", "proyecto_ti"].includes(request.estado);

  return (
    <section className="space-y-3 rounded-xl border-2 border-blue-600 bg-blue-50 p-4 text-blue-950 dark:bg-blue-950/30 dark:text-blue-50">
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <UserCog className="size-5" /> Esta propuesta debe estudiarla {d.recipients.map((r) => RECIPIENT_LABEL[r]).join(" y ")}
      </h3>
      <ul className="list-disc space-y-1 pl-6 text-sm">
        {d.reasons.map((r, i) => (
          <li key={i}>
            {r.text} <span className="text-xs opacity-75">({r.to.map((t) => t.toUpperCase()).join(", ")})</span>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        {d.blocksBuild
          ? "No se puede construir en autoservicio. Envía la propuesta y TI/DPD estudiarán una solución contigo."
          : "Puedes preparar un prototipo con datos ficticios para explicar mejor lo que necesitas, pero no podrás publicarlo tú. Al enviar la propuesta, TI/DPD reciben automáticamente la ficha completa" +
            (code ? " y el prototipo actual." : "; si después construyes el prototipo, podrás enviarlo como actualización.")}
      </p>

      {request && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/70 p-3 text-sm dark:bg-black/20">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span className="flex-1">
            Propuesta enviada · estado: <strong>{REQUEST_STATUS_LABEL[request.estado]}</strong>
            {request.prototipo ? " · con prototipo" : ""}. Sigue la conversación en «Mis apps».
          </span>
        </div>
      )}
      {notice && <p className="text-sm text-amber-800 dark:text-amber-300">{notice}</p>}

      {!closed && (
        <>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label={request ? "Mensaje de la actualización (opcional)" : "Mensaje para TI/DPD (opcional)"} htmlFor="msg-der">
              <Textarea
                id="msg-der"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Contexto, urgencia, a cuántas personas ayudaría…"
                className="bg-background"
              />
            </Field>
            <Field label="Teléfono o extensión (opcional)" htmlFor="tel-der">
              <Input id="tel-der" value={contact} onChange={(e) => setContact(e.target.value)} className="bg-background" />
            </Field>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={send} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
            {request ? (code ? "Enviar actualización con el prototipo actual" : "Enviar actualización") : "Enviar la propuesta a TI/DPD"}
          </Button>
        </>
      )}
    </section>
  );
}
