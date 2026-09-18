import { z } from "zod";
import { moduleByTable, options } from "./modules";
z.config(z.locales.pt());
export function parseRecord(table: string, input: unknown) {
  const mod = moduleByTable(table);
  if (!mod) throw new Error("Tipo de registro inválido.");
  const shape: Record<string, z.ZodType> = {};
  for (const f of mod.fields.filter((f) => f.persist !== false)) {
    let validator: z.ZodType = z
      .string()
      .trim()
      .max(f.type === "textarea" ? 20000 : 1000);
    if (f.type === "email") validator = z.email("E-mail inválido.");
    if (f.type === "url")
      validator = z
        .url("URL inválida.")
        .refine(
          (v) => /^https?:\/\//i.test(v),
          "Use um endereço http ou https.",
        );
    if (f.type === "relation" || f.type === "member")
      validator = z.uuid("Selecione um registro válido.");
    if (f.type === "integer")
      validator = z.coerce
        .number()
        .int()
        .min(f.name === "release_year" ? 1000 : 1)
        .max(f.name === "release_year" ? 9999 : 10000);
    if (f.type === "money")
      validator = z
        .string()
        .regex(
          /^\d{1,10}(\.\d{1,2})?$/,
          "Informe um valor positivo com até duas casas decimais.",
        );
    if (f.type === "date") validator = z.iso.date("Data inválida.");
    if (f.type === "datetime-local")
      validator = z
        .string()
        .refine((v) => !Number.isNaN(Date.parse(v)), "Data inválida.")
        .transform((v) => new Date(v).toISOString());
    if (f.type === "time")
      validator = z
        .string()
        .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Horário inválido.");
    if (f.type === "select")
      validator = z
        .string()
        .refine(
          (v) => Object.hasOwn(options[f.source!] ?? {}, v),
          "Selecione uma opção válida.",
        );
    if (f.type === "checkbox") validator = z.boolean();
    else if (f.required)
      validator = validator.refine(
        (v) => v !== "" && v !== null,
        "Campo obrigatório.",
      );
    else
      validator = z.preprocess(
        (v) => (v === "" || v === undefined ? null : v),
        validator.nullable(),
      );
    shape[f.name] = validator;
  }
  return z.object(shape).parse(input);
}
