import { useEffect, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, Send, ShieldCheck, ShieldX, TriangleAlert, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { maskPii } from "@/shared/pii";
import type { ScanFinding } from "@/shared/codeScan";
import type { Answers, Assessment } from "@/shared/policy";
import { download, slug } from "@/lib/ficha";
import { cn } from "@/lib/utils";

export interface Version {
  code: string;
  preview: string;
  constraintsKey: string;
}

interface Message {
  role: "usuario" | "asistente" | "sistema";
  text: string;
  findings?: ScanFinding[];
  suggestions?: string[];
}

export function BuildStep({
  answers,
  assessment,
  details,
  versions,
  setVersions,
  setFindings,
}: {
  answers: Answers;
  assessment: Assessment;
  details: string;
  versions: Version[];
  setVersions: (v: Version[]) => void;
  setFindings: (f: ScanFinding[]) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const current = versions[versions.length - 1];
  const constraintsKey = JSON.stringify(assessment.constraints);
  const stale = !!current && current.constraintsKey !== constraintsKey;

  async function build(instruction: string, fresh = false) {
    setBusy(true);
    if (instruction) setMessages((m) => [...m, { role: "usuario", text: instruction }]);
    try {
      const r = await fetch("/api/construir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          respuestas: answers,
          compromisosAceptados: true,
          detalles: details,
          instruccion: instruction,
          codigoActual: fresh ? "" : current?.code || "",
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setFindings(data.hallazgos || []);
      const notes: string[] = [];
      if (data.enmascarados) notes.push(`Se han enmascarado ${data.enmascarados} dato(s) personal(es) antes de enviar tu texto a la IA.`);
      if (!data.codigo) notes.push("La revisión de seguridad ha encontrado problemas graves y no se muestra esta versión. Prueba a reformular la petición.");
      setMessages((m) => [
        ...m,
        { role: "asistente", text: data.resumen, findings: data.hallazgos, suggestions: data.sugerencias },
        ...notes.map((text) => ({ role: "sistema" as const, text })),
      ]);
      if (data.codigo) setVersions([...versions, { code: data.codigo, preview: data.vistaPrevia, constraintsKey }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "sistema", text: e.message || "Error inesperado" }]);
    } finally {
      setBusy(false);
    }
  }

  // Primera versión automática al entrar (una sola vez, también en StrictMode).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (versions.length === 0) build("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Puente con los servicios de la plataforma (IA y base de datos de pruebas).
  useEffect(() => {
    async function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data || {};
      if (d.tipo !== "plataforma" || typeof d.id !== "string") return;
      const reply = (msg: object) => (e.source as Window).postMessage({ tipo: "plataforma-respuesta", id: d.id, ...msg }, "*");
      try {
        const args: unknown[] = Array.isArray(d.args) ? d.args : [];
        // Doble protección para la IA: se enmascara aquí y otra vez en el servidor.
        if (d.servicio === "ia") args[0] = maskPii(String(args[0] || "")).text;
        const r = await fetch("/api/plataforma-prueba", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ respuestas: answers, servicio: d.servicio, op: d.op, args }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        reply({ resultado: data.resultado });
      } catch (err: any) {
        reply({ error: err.message || "Error de la plataforma" });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [answers, assessment]);

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    build(text);
  };

  const lastFindings = [...messages].reverse().find((m) => m.findings)?.findings || [];
  const blockers = lastFindings.filter((f) => f.severity === "bloqueante");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex min-h-[28rem] flex-col rounded-xl border bg-card">
        <div className="border-b p-3 text-sm font-semibold">Conversación</div>
        <div className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
          {messages.length === 0 && busy && <p className="text-sm text-muted-foreground">Construyendo la primera versión…</p>}
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg p-3 text-sm",
                m.role === "usuario" && "ml-6 bg-blue-600 text-white",
                m.role === "asistente" && "mr-6 bg-muted",
                m.role === "sistema" && "border border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
              )}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.suggestions && m.suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.suggestions.map((s, j) => (
                    <button
                      key={j}
                      type="button"
                      onClick={() => setInput(s)}
                      className="rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-accent"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && messages.length > 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Trabajando…
            </p>
          )}
        </div>
        <div className="space-y-2 border-t p-3">
          <Textarea
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Pide cambios: «añade un campo de fecha», «pon los botones más grandes», «que se pueda exportar a CSV»…"
            aria-label="Petición de cambios"
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={send} disabled={busy || !input.trim()}>
              <Send /> Enviar
            </Button>
            <Button
              variant="outline"
              disabled={busy || versions.length < 2}
              onClick={() => setVersions(versions.slice(0, -1))}
              title="Volver a la versión anterior"
            >
              <Undo2 /> Deshacer
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => build("", true)}>
              <RefreshCw /> Empezar de nuevo
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {stale && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <TriangleAlert className="size-4" />
            <span className="flex-1">Has cambiado las respuestas y las reglas de seguridad son otras. Adapta la aplicación antes de descargarla.</span>
            <Button size="sm" disabled={busy} onClick={() => build("Adapta la aplicación a las reglas obligatorias actuales.")}>
              Adaptar
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {blockers.length === 0 && lastFindings.length === 0 && current && (
            <Badge className="bg-emerald-600 text-white">
              <ShieldCheck /> Revisión de seguridad superada
            </Badge>
          )}
          {lastFindings.length > 0 && (
            <Badge variant={blockers.length ? "destructive" : "secondary"}>
              {blockers.length ? <ShieldX /> : <TriangleAlert />}
              {blockers.length ? `${blockers.length} problema(s) grave(s)` : `${lastFindings.length} aviso(s)`}
            </Badge>
          )}
          {current && <span className="text-xs text-muted-foreground">Versión {versions.length}</span>}
          <div className="flex-1" />
          <Button
            variant="outline"
            disabled={!current || stale || busy}
            onClick={() => download(`${slug(answers.appName)}.html`, current!.code, "text/html")}
          >
            <Download /> Descargar app
          </Button>
        </div>
        {lastFindings.length > 0 && (
          <ul className="space-y-1 rounded-lg border p-3 text-xs">
            {lastFindings.map((f, i) => (
              <li key={i} className={f.severity === "bloqueante" ? "text-destructive" : "text-muted-foreground"}>
                {f.severity === "bloqueante" ? "✖" : "⚠"} {f.message}
              </li>
            ))}
          </ul>
        )}
        <div className="relative min-h-[32rem] flex-1 overflow-hidden rounded-xl border bg-white">
          {current ? (
            <iframe
              ref={iframeRef}
              key={current.preview}
              src={current.preview}
              title="Vista previa de la aplicación"
              sandbox="allow-scripts allow-forms allow-modals"
              referrerPolicy="no-referrer"
              className="absolute inset-0 size-full"
            />
          ) : (
            <div className="flex size-full min-h-[32rem] items-center justify-center text-sm text-muted-foreground">
              {busy ? <Loader2 className="size-6 animate-spin" /> : "Aquí aparecerá tu aplicación"}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          La vista previa funciona aislada: no puede acceder a internet, a la plataforma ni a tus otros datos.{" "}
          {assessment.constraints.storage === "bd"
            ? "Usa una base de datos de pruebas, separada de los datos reales, que se vacía sola al día siguiente."
            : "Lo que guardes aquí se pierde al recargar."}
        </p>
      </div>
    </div>
  );
}
