"use client";

import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";

export interface PartyField {
  name: string;
  required?: boolean;
  multiline?: boolean;
  /** Key of a hint in "Hstt.hints". */
  hint?: string;
  /** Full width on the 2-column grid. */
  wide?: boolean;
  mono?: boolean;
}

/**
 * Text fields of an HSTT party (Bên B company profile, Bên A customer).
 * Labels come from "Hstt.fields.<name>"; values are submitted as-is.
 */
export function PartyFields({
  fields,
  values,
  errors,
}: {
  fields: PartyField[];
  values: Record<string, string> | undefined;
  errors: Record<string, string[]> | undefined;
}) {
  const t = useTranslations("Hstt");
  return (
    <>
      {fields.map((f) => (
        <div key={f.name} className={f.wide ? "sm:col-span-2" : undefined}>
          <Field
            label={t(`fields.${f.name}`)}
            htmlFor={f.name}
            error={errors?.[f.name]?.[0]}
            hint={f.hint ? t(`hints.${f.hint}`) : undefined}
          >
            {f.multiline ? (
              <Textarea id={f.name} name={f.name} rows={2} defaultValue={values?.[f.name] ?? ""} required={f.required} />
            ) : (
              <Input
                id={f.name}
                name={f.name}
                defaultValue={values?.[f.name] ?? ""}
                required={f.required}
                className={f.mono ? "font-mono" : undefined}
              />
            )}
          </Field>
        </div>
      ))}
    </>
  );
}
