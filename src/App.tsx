import { useEffect, useState } from "react";
import { Building2, FlaskConical, Loader2, UserRound } from "lucide-react";
import { Builder, type Status } from "@/src/views/Builder";
import { Catalog, MyApps, Review } from "@/src/views/Portal";
import { MyRequests, ReviewRequests } from "@/src/views/Requests";
import { api, type Me } from "@/src/api";
import { cn } from "@/lib/utils";

type View = "crear" | "catalogo" | "mis-apps" | "revision";

function currentView(): View {
  const h = location.hash.replace("#", "");
  return (["crear", "catalogo", "mis-apps", "revision"] as View[]).includes(h as View) ? (h as View) : "crear";
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState("");
  const [status, setStatus] = useState<Status>({ modoDemo: false, correoDpd: "" });
  const [view, setView] = useState<View>(currentView);
  const [editId, setEditId] = useState<{ id: string; n: number } | null>(null);
  const [reviewTab, setReviewTab] = useState<"solicitudes" | "publicaciones">("solicitudes");

  useEffect(() => {
    api<Status>("/api/estado").then(setStatus).catch(() => {});
    api<Me>("/api/yo").then(setMe).catch((e) => setMeError(e.message));
    const onHash = () => setView(currentView());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (v: View) => {
    location.hash = v;
    setView(v);
  };

  async function switchProfile(perfil: string) {
    await api("/api/dev/perfil", { perfil });
    location.reload();
  }

  if (meError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <p>No se ha podido identificar tu usuario. Accede a través de la intranet municipal o la VPN.</p>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const tabs: { id: View; label: string; show: boolean }[] = [
    { id: "crear", label: "Crear app", show: me.esPlantilla },
    { id: "catalogo", label: "Catálogo", show: true },
    { id: "mis-apps", label: "Mis apps", show: me.esPlantilla },
    { id: "revision", label: "Revisión", show: me.esRevisor },
  ];
  const visible = tabs.filter((t) => t.show);
  const active = visible.some((t) => t.id === view) ? view : visible[0].id;

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-[#1f4e79] text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Building2 className="size-7" />
          <div className="flex-1">
            <h1 className="text-lg leading-tight font-semibold">Taller de Apps IA</h1>
            <p className="text-xs text-white/80">Herramientas creadas por y para el personal municipal · Intranet</p>
          </div>
          {status.modoDemo && (
            <span className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs" title="No hay clave de IA configurada">
              <FlaskConical className="size-3.5" /> Modo demostración
            </span>
          )}
          <span className="flex items-center gap-1.5 text-xs">
            <UserRound className="size-4" />
            {me.perfilesPrueba.length > 0 ? (
              <select
                aria-label="Perfil de prueba"
                className="rounded bg-white/15 px-1 py-0.5 text-white [&>option]:text-black"
                value={me.perfilActual ?? ""}
                onChange={(e) => switchProfile(e.target.value)}
              >
                {me.perfilesPrueba.map((p) => (
                  <option key={p.id} value={p.id}>
                    Perfil de prueba: {p.etiqueta}
                  </option>
                ))}
              </select>
            ) : (
              me.nombre
            )}
          </span>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4" aria-label="Secciones">
          {visible.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => go(t.id)}
              aria-current={active === t.id ? "page" : undefined}
              className={cn(
                "rounded-t-lg px-3 py-2 text-sm",
                active === t.id ? "bg-muted/95 font-medium text-foreground" : "text-white/85 hover:bg-white/10",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* El asistente se mantiene montado para no perder el trabajo al cambiar de pestaña. */}
        {me.esPlantilla && (
          <div hidden={active !== "crear"}>
            <Builder me={me} status={status} editId={editId} />
          </div>
        )}
        {active === "catalogo" && <Catalog me={me} />}
        {active === "mis-apps" && (
          <div className="space-y-8">
            <MyRequests />
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Mis aplicaciones publicadas</h2>
              <MyApps
                onEdit={(id) => {
                  setEditId({ id, n: Date.now() });
                  go("crear");
                }}
              />
            </section>
          </div>
        )}
        {active === "revision" && (
          <div className="space-y-4">
            <div className="flex gap-1 border-b">
              {(
                [
                  ["solicitudes", "Propuestas derivadas"],
                  ["publicaciones", "Publicaciones"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setReviewTab(id)}
                  className={cn("-mb-px border-b-2 px-3 py-2 text-sm", reviewTab === id ? "border-blue-600 font-medium" : "border-transparent text-muted-foreground")}
                >
                  {label}
                </button>
              ))}
            </div>
            {reviewTab === "solicitudes" ? <ReviewRequests me={me} /> : <Review me={me} />}
          </div>
        )}
      </div>
    </div>
  );
}
