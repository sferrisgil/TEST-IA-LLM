import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
      <legend className="sr-only">{title}</legend>
      <div>
        <h3 className="font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}

interface Option<T extends string> {
  id: T;
  label: string;
  help?: string;
  examples?: string;
}

/** Grupo de opciones en forma de tarjetas (una o varias). */
export function Choice<T extends string>({
  options,
  value,
  onChange,
  multiple = false,
  highlight = [],
  columns = 2,
}: {
  options: Option<T>[];
  value: T | T[];
  onChange: (v: any) => void;
  multiple?: boolean;
  highlight?: T[];
  columns?: 1 | 2 | 3;
}) {
  const selected = (id: T) => (multiple ? (value as T[]).includes(id) : value === id);
  const toggle = (id: T) => {
    if (!multiple) return onChange(id);
    const arr = value as T[];
    onChange(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  };
  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}
    >
      {options.map((o) => {
        const on = selected(o.id);
        const warn = highlight.includes(o.id) && !on;
        return (
          <button
            type="button"
            key={o.id}
            role={multiple ? "checkbox" : "radio"}
            aria-checked={on}
            onClick={() => toggle(o.id)}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              on ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40" : "hover:bg-muted",
              warn && "border-amber-500 bg-amber-50 dark:bg-amber-950/30",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center border",
                multiple ? "rounded" : "rounded-full",
                on ? "border-blue-600 bg-blue-600 text-white" : "border-muted-foreground/40",
              )}
            >
              {on && <Check className="size-3" />}
            </span>
            <span className="space-y-0.5">
              <span className="block font-medium">{o.label}</span>
              {o.help && <span className="block text-xs text-muted-foreground">{o.help}</span>}
              {o.examples && <span className="block text-xs text-muted-foreground italic">Ej.: {o.examples}</span>}
              {warn && <span className="block text-xs font-medium text-amber-700 dark:text-amber-400">Detectado en tus ejemplos</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
