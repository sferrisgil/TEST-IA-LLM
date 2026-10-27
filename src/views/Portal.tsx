import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ExternalLink, Loader2, Pencil, RefreshCw, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AUDIENCES, DATA_CATEGORIES, LEVEL_INFO } from "@/shared/policy";
import { AI_ACT_LABEL, CAPABILITY_LABEL } from "@/shared/aiAct";
import { api, fmtDate, STATUS_LABEL, type Me, type PublicationSummary } from "@/src/api";
import { LEVEL_STYLE } from "@/src/steps/AssessmentStep";
import { cn } from "@/lib/utils";

const audienceLabel = (id: string) => AUDIENCES.find((a) => a.id === id)?.label ?? id;

function useList(url: string) {
  const [items, setItems] = useState<PublicationSummary[] | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    api<PublicationSummary[]>(url)
      .then((x) => {
        setItems(x);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [url]);
  useEffect(reload, [reload]);
  return { items, error, reload, setItems };
}

function LevelBadge({ level }: { level: PublicationSummary["nivel"] }) {
  return <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", LEVEL_STYLE[level].box)}>{LEVEL_INFO[level].label}</span>;
}

function StatusBadge({ p }: { p: PublicationSummary }) {
  const variant = p.estado === "publicada" ? "secondary" : p.estado === "pendiente" ? "outline" : "destructive";
  return (
    <>
      <Badge variant={variant}>{STATUS_LABEL[p.estado]}</Badge>
      {p.caducada && p.estado === "publicada" && <Badge variant="destructive">Revisión anual vencida</Badge>}
    </>
  );
}

function Card({ p, children }: { p: PublicationSummary; children?: ReactNode }) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start gap-2">
        <h3 className="flex-1 font-semibold">{p.nombre}</h3>
        <LevelBadge level={p.nivel} />
      </div>
      {p.finalidad && <p className="text-sm text-muted-foreground">{p.finalidad}</p>}
      <p className="text-xs text-muted-foreground">
        {p.departamento} · {p.responsable} · v{p.version} · {audienceLabel(p.audiencia)}
      </p>
      {children}
    </article>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{children}</p>
);

// --- Catálogo -----------------------------------------------------------------

export function Catalog({ me }: { me: Me }) {
  const { items, error } = useList("/api/publicaciones/catalogo");
  const [q, setQ] = useState("");
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shown = (items || []).filter((p) => norm(`${p.nombre} ${p.finalidad} ${p.departamento}`).includes(norm(q)));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {me.esContrata && !me.esPlantilla
          ? "Aplicaciones municipales disponibles para tu empresa a través de la VPN."
          : "Aplicaciones creadas por el personal municipal a las que tienes acceso."}
      </p>
      <div className="relative max-w-md">
        <Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Buscar por nombre, finalidad o departamento" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!items ? (
        <Loader2 className="animate-spin" />
      ) : shown.length === 0 ? (
        <Empty>No hay aplicaciones disponibles{q ? " con ese criterio" : " todavía"}.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <Card key={p.id} p={p}>
              <a className={cn(buttonVariants(), "mt-auto self-start")} href={p.url} target="_blank" rel="noreferrer">
                Abrir <ExternalLink />
              </a>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Mis aplicaciones -----------------------------------------------------------

export function MyApps({ onEdit }: { onEdit: (id: string) => void }) {
  const { items, error, reload } = useList("/api/publicaciones/mias");
  const [busy, setBusy] = useState("");

  async function act(id: string, action: "retirar" | "renovar" | "datos/borrar") {
    if (action === "retirar" && !confirm("¿Retirar la aplicación? Dejará de estar disponible. Sus datos se conservan hasta que los borres.")) return;
    if (action === "datos/borrar" && !confirm("¿Borrar TODOS los registros guardados por esta aplicación? No se puede deshacer.")) return;
    setBusy(id);
    try {
      await api(`/api/publicaciones/${id}/${action}`, {});
      reload();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy("");
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!items) return <Loader2 className="animate-spin" />;
  if (items.length === 0) return <Empty>Aún no has publicado ninguna aplicación. Créala en «Crear app» y publícala en el último paso.</Empty>;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {items.map((p) => {
        const last = p.historial?.[p.historial.length - 1];
        return (
          <Card key={p.id} p={p}>
            <div className="flex flex-wrap gap-2">
              <StatusBadge p={p} />
            </div>
            {last?.comment && (
              <p className="rounded-md bg-muted p-2 text-xs">
                <strong>{last.action}</strong> ({fmtDate(last.date)}): {last.comment}
              </p>
            )}
            {p.accesoExterno === "solicitado" && (
              <p className="text-xs text-muted-foreground">Acceso desde internet solicitado: se estudiará en la fase de publicación externa.</p>
            )}
            <p className="text-xs text-muted-foreground">Revisión anual: antes del {fmtDate(p.revisarAntesDe)}</p>
            {p.almacenamiento === "bd" && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs">
                <span className="flex-1">
                  Base de datos municipal: <strong>{p.registros ?? 0}</strong> registro(s)
                </span>
                <a className={buttonVariants({ variant: "outline", size: "xs" })} href={`/api/publicaciones/${p.id}/datos`} download>
                  Exportar datos
                </a>
                <Button size="xs" variant="destructive" disabled={busy === p.id || !p.registros} onClick={() => act(p.id, "datos/borrar")}>
                  Borrar datos
                </Button>
              </div>
            )}
            <div className="mt-auto flex flex-wrap gap-2">
              <a className={buttonVariants({ variant: "outline", size: "sm" })} href={p.url} target="_blank" rel="noreferrer">
                Abrir <ExternalLink />
              </a>
              <Button size="sm" variant="outline" onClick={() => onEdit(p.id)}>
                <Pencil /> Nueva versión
              </Button>
              {(p.estado === "publicada" || p.estado === "pendiente") && (
                <>
                  <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => act(p.id, "renovar")}>
                    <RefreshCw /> Sigue siendo necesaria
                  </Button>
                  <Button size="sm" variant="destructive" disabled={busy === p.id} onClick={() => act(p.id, "retirar")}>
                    Retirar
                  </Button>
                </>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// --- Revisión (TI / DPD) --------------------------------------------------------

export function Review({ me }: { me: Me }) {
  const { items, error, reload } = useList("/api/publicaciones/revision");
  const [filter, setFilter] = useState<"pendiente" | "todas">("pendiente");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [confirmHigh, setConfirmHigh] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");

  async function decide(p: PublicationSummary, decision: "aprobar" | "rechazar") {
    setBusy(p.id);
    try {
      await api(`/api/publicaciones/${p.id}/revision`, {
        decision,
        comentario: comments[p.id] || "",
        confirmacionRiesgoAlto: !!confirmHigh[p.id],
      });
      reload();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy("");
    }
  }

  async function retire(p: PublicationSummary) {
    if (!confirm(`¿Retirar «${p.nombre}»?`)) return;
    await api(`/api/publicaciones/${p.id}/retirar`, { comentario: comments[p.id] || "Retirada por TI/DPD" }).catch((e) => alert(e.message));
    reload();
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!items) return <Loader2 className="animate-spin" />;
  const shown = items.filter((p) => filter === "todas" || p.estado === "pendiente");
  const label = (id: string) => DATA_CATEGORIES.find((c) => c.id === id)?.label ?? id;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant={filter === "pendiente" ? "default" : "outline"} onClick={() => setFilter("pendiente")}>
          Pendientes ({items.filter((p) => p.estado === "pendiente").length})
        </Button>
        <Button size="sm" variant={filter === "todas" ? "default" : "outline"} onClick={() => setFilter("todas")}>
          Inventario completo ({items.length})
        </Button>
      </div>
      {shown.length === 0 ? (
        <Empty>No hay publicaciones {filter === "pendiente" ? "pendientes de revisión" : ""}.</Empty>
      ) : (
        <div className="space-y-3">
          {shown.map((p) => {
            const e = p.ficha!.evaluacion;
            const r = p.ficha!.respuestas;
            const own = p.propia;
            return (
              <Card key={p.id} p={p}>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge p={p} />
                  {p.miembros && p.miembros.length > 0 && <Badge variant="outline">Accesos: {p.miembros.join(", ")}</Badge>}
                </div>
                <details className="rounded-md border p-2 text-sm">
                  <summary className="cursor-pointer font-medium">Ficha y evaluación</summary>
                  <div className="mt-2 space-y-2">
                    <p className="whitespace-pre-wrap">{r.description}</p>
                    <p>
                      <strong>Datos:</strong> {[...new Set([...r.data, ...r.detectedCategories])].map(label).join(", ") || "—"}
                    </p>
                    {e.ai && (
                      <p>
                        <strong>IA:</strong> {AI_ACT_LABEL[e.ai.category]} · complejidad {CAPABILITY_LABEL[e.ai.complexity]} · modelo{" "}
                        {e.ai.recommended?.name ?? "ninguno"} · supervisión: {r.ai.oversight}
                      </p>
                    )}
                    <ul className="list-disc pl-5">
                      {e.reasons.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">Historial: {p.historial?.map((h) => `${fmtDate(h.date)} ${h.action} (${h.user})`).join(" · ")}</p>
                  </div>
                </details>
                <a className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")} href={p.url} target="_blank" rel="noreferrer">
                  Probar la aplicación <ExternalLink />
                </a>
                {p.estado === "pendiente" && !own && (
                  <div className="space-y-2 border-t pt-2">
                    <Textarea
                      rows={2}
                      placeholder="Comentario para el responsable (obligatorio si se rechaza)"
                      value={comments[p.id] || ""}
                      onChange={(ev) => setComments({ ...comments, [p.id]: ev.target.value })}
                    />
                    {p.nivel === "alto" && (
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4"
                          checked={!!confirmHigh[p.id]}
                          onChange={(ev) => setConfirmHigh({ ...confirmHigh, [p.id]: ev.target.checked })}
                        />
                        Confirmo que se usará solo con datos ficticios o que existe una EIPD aprobada para su uso con datos reales.
                      </label>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy === p.id} onClick={() => decide(p, "aprobar")}>
                        Aprobar y publicar
                      </Button>
                      <Button size="sm" variant="destructive" disabled={busy === p.id} onClick={() => decide(p, "rechazar")}>
                        Rechazar
                      </Button>
                    </div>
                  </div>
                )}
                {p.estado === "pendiente" && own && <p className="text-xs text-muted-foreground">Es tuya: debe revisarla otra persona.</p>}
                {p.estado === "publicada" && (
                  <Button size="sm" variant="destructive" className="self-start" onClick={() => retire(p)}>
                    Retirar
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Sesión de revisión: {me.nombre}</p>
    </div>
  );
}
