import { FileJson, FileText, Mail } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Section } from "@/components/fields";
import { download, fichaMarkdown, slug, type FichaInput } from "@/lib/ficha";

export function FichaStep({ ficha, dpdEmail }: { ficha: FichaInput; dpdEmail: string }) {
  const md = fichaMarkdown(ficha);
  const name = slug(ficha.answers.appName);
  const subject = encodeURIComponent(`Ficha de aplicación: ${ficha.answers.appName || "sin nombre"}`);
  const body = encodeURIComponent("Adjunto la ficha de la aplicación creada con el Taller de Apps IA para su revisión.\n\n");

  return (
    <div className="space-y-4">
      <Section
        title="Ficha de la aplicación"
        description="Es el registro de lo que has declarado y de las medidas aplicadas. Guárdala junto a la app y remítela al Delegado de Protección de Datos cuando corresponda."
      >
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => download(`ficha-${name}.md`, md, "text/markdown")}>
            <FileText /> Descargar ficha
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              download(
                `ficha-${name}.json`,
                JSON.stringify({ generada: new Date().toISOString(), respuestas: ficha.answers, evaluacion: ficha.assessment, compromisos: ficha.commitments, aceptados: ficha.acceptedAt, versiones: ficha.versions, revision: ficha.findings }, null, 2),
                "application/json",
              )
            }
          >
            <FileJson /> Descargar en JSON
          </Button>
          {dpdEmail && (
            <a className={buttonVariants({ variant: "outline" })} href={`mailto:${dpdEmail}?subject=${subject}&body=${body}`}>
              <Mail /> Escribir al DPD
            </a>
          )}
        </div>
        <pre className="max-h-[32rem] overflow-auto rounded-lg bg-muted p-4 text-xs whitespace-pre-wrap">{md}</pre>
      </Section>
    </div>
  );
}
