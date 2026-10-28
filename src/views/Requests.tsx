import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, MessageSquare } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RECIPIENT_LABEL } from "@/shared/derivation";
import { AI_ACT_LABEL, type AiActCategory } from "@/shared/aiAct";
import { LEVEL_INFO } from "@/shared/policy";
import { api, fmtDate, REQUEST_STATUS_LABEL, type DerivationView, type Me, type RequestStatus } from "@/src/api";
import { LEVEL_STYLE } from "@/src/steps/AssessmentStep";
import { download } from "@/lib/ficha";
import { cn } from "@/lib/utils";

function useRequests(url: string) {
  const [items, setItems] = useState<DerivationView[] | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    api<DerivationView[]>(url)
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [url]);
  useEffect(reload, [reload]);
  const replace = (r: DerivationView) => setItems((xs) => (xs || []).map((x) => (x.id === r.id ? r : x)));
  return { items, error, reload, replace };
}

const statusVariant = (s: RequestStatus) => (s === "aprobada" ? "secondary" : s === "rechazada" ? "destructive" : "outline");

function Thread({ r, onUpdate }: { r: DerivationView; onUpdate: (r: DerivationView) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try {
      onUpdate(await api<DerivationView>(`/api/derivaciones/${r.id}/comentarios`, { texto: text }));
      setText("");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 border-t pt-2">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <MessageSquare className="size-3.5" /> Conversación
      </p>
      {r.comentarios.length === 0 && <p className="text-xs text-muted-foreground">Sin comentarios todavía.</p>}
      {r.comentarios.map((c, i) => (
        <div key={i} className={cn("rounded-md p-2 text-sm", c.role === "revision" ? "mr-8 bg-blue-50 dark:bg-blue-950/30" : "ml-8 bg-muted")}>
          <p className="text-xs text-muted-foreground">
            {c.name} · {fmtDate(c.date)}
          </p>
          <p className="whitespace-pre-wrap">{c.text}</p>
        </div>
      ))}
      <div className="flex gap-2">
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe un comentario…" />
        <Button size="sm" disabled={busy || !text.trim()} onClick={send} className="self-end">
          Enviar
        </Button>
      </div>
    </div>
  );
}

function Header({ r }: { r: DerivationView }) {
  return (
    <>
      <div className="flex flex-wrap items-start gap-2">
        <h3 className="flex-1 font-semibold">{r.aplicacion}</h3>
        <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", LEVEL_STYLE[r.nivel].box)}>{LEVEL_INFO[r.nivel].label}</span>
        <Badge variant={statusVariant(r.estado)}>{REQUEST_STATUS_LABEL[r.estado]}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {r.solicitante} · {r.departamento || "—"} · enviada {fmtDate(r.creada)} · para {r.destinatarios.map((d) => RECIPIENT_LABEL[d]).join(" y ")}
        {r.reglamentoIA ? ` · RIA: ${AI_ACT_LABEL[r.reglamentoIA as AiActCategory]}` : ""}
      </p>
      <ul className="list-disc pl-5 text-sm">
        {r.motivos.map((m, i) => (
          <li key={i}>{m.text}</li>
        ))}
      </ul>
    </>
  );
}

const card = "flex flex-col gap-2 rounded-xl border bg-card p-4";

/** Solicitudes de la persona (en «Mis apps»). */
export function MyRequests() {
  const { items, error, replace } = useRequests("/api/derivaciones/mias");
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!items) return <Loader2 className="animate-spin" />;
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Mis propuestas enviadas a TI / DPD</h2>
      {items.map((r) => (
        <article key={r.id} className={card}>
          <Header r={r} />
          <div className="flex flex-wrap gap-2">
            {r.prototipo && (
              <a className={buttonVariants({ variant: "outline", size: "sm" })} href={r.prototipo} target="_blank" rel="noreferrer">
                Ver prototipo enviado <ExternalLink />
              </a>
            )}
            {r.publicacion && (
              <a className={buttonVariants({ size: "sm" })} href={r.publicacion} target="_blank" rel="noreferrer">
                Abrir la app publicada <ExternalLink />
              </a>
            )}
          </div>
          <Thread r={r} onUpdate={replace} />
        </article>
      ))}
    </section>
  );
}

/** Bandeja de TI / DPD. */
export function ReviewRequests({ me }: { me: Me }) {
  const { items, error, replace } = useRequests("/api/derivaciones");
  const [filter, setFilter] = useState<"abiertas" | "todas">("abiertas");
  const [comment, setComment] = useState<Record<string, string>>({});
  const [confirmHigh, setConfirmHigh] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");

  async function setStatus(r: DerivationView, estado: RequestStatus, publicar = false) {
    setBusy(r.id);
    try {
      replace(
        await api<DerivationView>(`/api/derivaciones/${r.id}/estado`, {
          estado,
          publicar,
          comentario: comment[r.id] || "",
          confirmacionRiesgoAlto: !!confirmHigh[r.id],
        }),
      );
      setComment({ ...comment, [r.id]: "" });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy("");
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!items) return <Loader2 className="animate-spin" />;
  const open = (r: DerivationView) => r.estado === "recibida" || r.estado === "en_estudio";
  const shown = items.filter((r) => filter === "todas" || open(r));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant={filter === "abiertas" ? "default" : "outline"} onClick={() => setFilter("abiertas")}>
          Abiertas ({items.filter(open).length})
        </Button>
        <Button size="sm" variant={filter === "todas" ? "default" : "outline"} onClick={() => setFilter("todas")}>
          Todas ({items.length})
        </Button>
      </div>
      {shown.length === 0 && <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">No hay propuestas.</p>}
      {shown.map((r) => {
        const own = r.solicitante === me.nombre;
        return (
          <article key={r.id} className={card}>
            <Header r={r} />
            {r.mensaje && <p className="rounded-md bg-muted p-2 text-sm whitespace-pre-wrap">«{r.mensaje}»</p>}
            {r.contacto && <p className="text-xs">Contacto: {r.contacto}</p>}
            <details className="rounded-md border p-2 text-sm">
              <summary className="cursor-pointer font-medium">Ficha completa</summary>
              <pre className="mt-2 max-h-96 overflow-auto text-xs whitespace-pre-wrap">{r.ficha}</pre>
            </details>
            <div className="flex flex-wrap gap-2">
              {r.prototipo && (
                <a className={buttonVariants({ variant: "outline", size: "sm" })} href={r.prototipo} target="_blank" rel="noreferrer">
                  Probar el prototipo <ExternalLink />
                </a>
              )}
              <Button size="sm" variant="outline" onClick={() => download(`ficha-${r.id}.md`, r.ficha || "", "text/markdown")}>
                Descargar ficha
              </Button>
              {r.publicacion && (
                <a className={buttonVariants({ size: "sm" })} href={r.publicacion} target="_blank" rel="noreferrer">
                  App publicada <ExternalLink />
                </a>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Avisos automáticos: {r.avisos.length === 0 ? "ninguno" : r.avisos.map((a) => `${a.channel} → ${a.to} ${a.ok ? "✓" : `✗ ${a.detail || ""}`}`).join(" · ")}
            </p>
            {open(r) && !own && (
              <div className="space-y-2 border-t pt-2">
                <Textarea
                  rows={2}
                  placeholder="Respuesta para la persona solicitante (obligatoria si se rechaza o pasa a proyecto)"
                  value={comment[r.id] || ""}
                  onChange={(e) => setComment({ ...comment, [r.id]: e.target.value })}
                />
                {r.nivel === "alto" && r.prototipo && (
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4"
                      checked={!!confirmHigh[r.id]}
                      onChange={(e) => setConfirmHigh({ ...confirmHigh, [r.id]: e.target.checked })}
                    />
                    Para publicar: confirmo que se usará con datos ficticios o que existen EIPD y evaluación de impacto aprobadas.
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  {r.estado === "recibida" && (
                    <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => setStatus(r, "en_estudio")}>
                      Marcar en estudio
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => setStatus(r, "aprobada")}>
                    Aprobar
                  </Button>
                  {r.prototipo && r.nivel !== "no_permitido" && (
                    <Button size="sm" disabled={busy === r.id} onClick={() => setStatus(r, "aprobada", true)}>
                      Aprobar y publicar
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => setStatus(r, "proyecto_ti")}>
                    Pasar a proyecto de TI
                  </Button>
                  <Button size="sm" variant="destructive" disabled={busy === r.id} onClick={() => setStatus(r, "rechazada")}>
                    Rechazar
                  </Button>
                </div>
              </div>
            )}
            <Thread r={r} onUpdate={replace} />
          </article>
        );
      })}
    </div>
  );
}
