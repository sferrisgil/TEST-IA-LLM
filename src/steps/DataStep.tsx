import { useEffect, useMemo, useState } from "react";
import { Lock, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Choice, Section } from "@/components/fields";
import { categoriesFromFindings, detectPii } from "@/shared/pii";
import { DATA_CATEGORIES, ORIGINS, VOLUMES, type Answers, type DataCategory } from "@/shared/policy";

export function DataStep({ answers, update }: { answers: Answers; update: (p: Partial<Answers>) => void }) {
  // El ejemplo vive solo en este componente: no se guarda ni se envía a ningún sitio.
  const [sample, setSample] = useState("");
  const findings = useMemo(() => detectPii(sample), [sample]);
  const suggested = categoriesFromFindings(findings);

  // Lo detectado se tiene en cuenta en la evaluación aunque no se marque.
  const suggestedKey = suggested.join(",");
  useEffect(() => {
    if (sample.trim()) update({ detectedCategories: suggested });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedKey]);

  function setData(data: DataCategory[]) {
    // "No usa datos" es incompatible con el resto de opciones.
    const last = data[data.length - 1];
    update({ data: last === "ninguno" ? ["ninguno"] : data.filter((d) => d !== "ninguno") });
  }

  function applyFindings() {
    update({ data: [...new Set([...answers.data.filter((d) => d !== "ninguno"), ...suggested])] });
  }

  return (
    <div className="space-y-4">
      <Section title="¿Qué información va a manejar la aplicación?" description="Marca todo lo que aplique. Si dudas, marca la opción más protegida.">
        <Choice options={DATA_CATEGORIES} value={answers.data} onChange={setData} multiple highlight={answers.detectedCategories} />
      </Section>

      <Section
        title="Comprueba con un ejemplo"
        description="Pega unas líneas de ejemplo de los datos (una fila de la hoja de cálculo, un escrito tipo, los nombres de las columnas…)."
      >
        <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>
            Este análisis se hace <strong>solo en tu navegador</strong>: el texto no se envía a ningún servidor ni a la IA, y se borra al salir de este paso.
            Si puedes, usa datos inventados con el mismo formato.
          </span>
        </div>
        <Textarea
          rows={5}
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          placeholder={"nombre;dni;teléfono;motivo\nAna Ejemplo;12345678Z;600111222;Solicitud de ayuda de emergencia"}
          aria-label="Ejemplo de datos"
        />
        {sample.trim() && findings.length === 0 && (
          <p className="text-sm text-muted-foreground">No se han detectado datos personales evidentes. Revisa igualmente las categorías de arriba.</p>
        )}
        {findings.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ScanSearch className="size-4" /> Hemos detectado:
            </p>
            <ul className="space-y-1 text-sm">
              {findings.map((f, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <Badge variant={["especiales", "penales", "menores", "vulnerables", "credenciales"].includes(f.category) ? "destructive" : "secondary"}>
                    {DATA_CATEGORIES.find((c) => c.id === f.category)?.label}
                  </Badge>
                  <span>
                    {f.label} ({f.count}) — <span className="font-mono text-xs text-muted-foreground">{f.sample}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Estos datos ya se tienen en cuenta en la evaluación de riesgo.</p>
            <Button size="sm" onClick={applyFindings}>
              Añadir lo detectado a mi respuesta
            </Button>
          </div>
        )}
      </Section>

      <Section title="¿De dónde salen los datos?">
        <Choice options={ORIGINS} value={answers.origin} onChange={(origin) => update({ origin })} multiple />
      </Section>

      <Section title="¿Cuántos registros, aproximadamente?">
        <Choice options={VOLUMES} value={answers.volume} onChange={(volume) => update({ volume })} columns={3} />
      </Section>
    </div>
  );
}
