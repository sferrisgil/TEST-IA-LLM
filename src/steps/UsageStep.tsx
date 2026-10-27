import { Input } from "@/components/ui/input";
import { Choice, Field, Section } from "@/components/fields";
import { AI_USES, AUDIENCES, DB_SCOPES, DECISIONS, INTEGRATIONS, RETENTIONS, STORAGES, type Answers } from "@/shared/policy";

const COMPARISON: [string, string, string][] = [
  ["Desde otro ordenador o navegador", "No", "Sí"],
  ["Compartir datos con compañeros", "No", "Sí (o cada persona los suyos)"],
  ["Búsquedas y filtros", "Básicos, en la propia app", "Sí, sobre todos los registros"],
  ["Si se borra el navegador", "Se pierden los datos", "No se pierden"],
  ["Copias de seguridad", "No", "Sí, las de TI"],
  ["Borrado automático por plazo", "No", "Sí, según la conservación indicada"],
];

export function UsageStep({ answers, update }: { answers: Answers; update: (p: Partial<Answers>) => void }) {
  const db = answers.storage === "base_datos";
  return (
    <div className="space-y-4">
      <Section title="¿Quién va a usar la aplicación?">
        <Choice options={AUDIENCES} value={answers.audience} onChange={(audience) => update({ audience })} />
      </Section>

      <Section title="¿Dónde se guardarán los datos?" description="Elige según necesites conservar los datos, compartirlos o buscarlos.">
        <Choice options={STORAGES} value={answers.storage} onChange={(storage) => update({ storage })} />
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Navegador o base de datos: ¿cuál me conviene?</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b">
                  <th className="py-1 pr-2" />
                  <th className="py-1 pr-2">En el navegador</th>
                  <th className="py-1">Base de datos municipal</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([q, a, b]) => (
                  <tr key={q} className="border-b last:border-0">
                    <td className="py-1 pr-2 font-medium">{q}</td>
                    <td className="py-1 pr-2">{a}</td>
                    <td className="py-1">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              Con datos personales, la base de datos es la opción más segura para compartir: el acceso se controla por usuario y queda registrado.
            </p>
          </div>
        </details>
        {db && (
          <div className="space-y-2 rounded-lg bg-muted/60 p-3">
            <p className="text-sm font-medium">¿Quién ve los registros guardados?</p>
            <Choice options={DB_SCOPES} value={answers.dbScope} onChange={(dbScope) => update({ dbScope })} />
          </div>
        )}
      </Section>

      <Section title="¿Usará inteligencia artificial mientras se usa?" description="Por ejemplo, para resumir, redactar o clasificar textos.">
        <Choice options={AI_USES} value={answers.aiUse} onChange={(aiUse) => update({ aiUse })} columns={3} />
      </Section>
      <Section title="¿Qué papel tiene en las decisiones?">
        <Choice options={DECISIONS} value={answers.decisions} onChange={(decisions) => update({ decisions })} />
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="¿Se conecta con otras aplicaciones?">
          <Choice options={INTEGRATIONS} value={answers.integrations} onChange={(integrations) => update({ integrations })} columns={1} />
        </Section>
        <Section title="¿Cuánto tiempo se guardan los datos?">
          <Choice options={RETENTIONS} value={answers.retention} onChange={(retention) => update({ retention })} columns={1} />
          {answers.retention === "limitada" && (
            <Field label="Plazo de conservación (días)" htmlFor="dias" hint={db ? "Los registros sin cambios durante este plazo se borrarán automáticamente." : undefined}>
              <Input
                id="dias"
                type="number"
                min={1}
                max={3650}
                value={answers.retentionDays}
                onChange={(e) => update({ retentionDays: Math.min(3650, Math.max(1, Number(e.target.value) || 1)) })}
                className="max-w-32"
              />
            </Field>
          )}
          {db && answers.retention === "sesion" && (
            <p className="text-xs text-muted-foreground">Con base de datos, «solo mientras se usa» significa que los registros se borran al día siguiente.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
