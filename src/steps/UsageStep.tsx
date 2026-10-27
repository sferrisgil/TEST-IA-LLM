import { Choice, Section } from "@/components/fields";
import { AI_USES, AUDIENCES, DECISIONS, INTEGRATIONS, RETENTIONS, STORAGES, type Answers } from "@/shared/policy";

export function UsageStep({ answers, update }: { answers: Answers; update: (p: Partial<Answers>) => void }) {
  return (
    <div className="space-y-4">
      <Section title="¿Quién va a usar la aplicación?">
        <Choice options={AUDIENCES} value={answers.audience} onChange={(audience) => update({ audience })} />
      </Section>
      <Section title="¿Dónde se guardarán los datos?">
        <Choice options={STORAGES} value={answers.storage} onChange={(storage) => update({ storage })} />
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
        </Section>
      </div>
    </div>
  );
}
