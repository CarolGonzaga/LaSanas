"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type DefaultValues } from "react-hook-form";
import { toast } from "sonner";
import { saveRecord } from "@/actions/business";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { options, moduleByTable, labelOf, type Row } from "@/lib/modules";
import type { Dataset } from "@/lib/workspace";
import { today } from "@/lib/format";

type Values = Record<string, string | boolean>;
function defaults(table: string, row?: Partial<Row>): Values {
  const mod = moduleByTable(table)!;
  const values: Values = {};
  for (const f of mod.fields) {
    let value = row?.[f.name];
    if (value === undefined || value === null) {
      value =
        f.type === "checkbox"
          ? f.name === "active"
          : f.type === "select"
            ? Object.keys(options[f.source!] ?? {})[0]
            : f.type === "money"
              ? "0"
              : f.type === "integer"
                ? "1"
                : f.type === "date" && f.required
                  ? today()
                  : f.type === "datetime-local" && f.required
                    ? new Date().toISOString()
                    : "";
      if (f.name === "year") value = Number(today().slice(0, 4));
      if (f.name === "month") value = Number(today().slice(5, 7));
      if (f.name === "duration_months") value = 3;
    }
    if (f.type === "datetime-local" && value) {
      const d = new Date(String(value));
      value = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    }
    values[f.name] = typeof value === "boolean" ? value : String(value);
  }
  return values;
}
export function RecordForm({
  table,
  row,
  open,
  onClose,
  onSaved,
  data,
  readOnly = false,
}: {
  table: string;
  row?: Partial<Row>;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  data: Dataset;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const mod = moduleByTable(table)!;
  const [file, setFile] = useState<File | null>(null);
  const [discard, setDiscard] = useState(false);
  const [relationQueries, setRelationQueries] = useState<
    Record<string, string>
  >({});
  const {
    register,
    handleSubmit,
    setError,
    control,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    defaultValues: defaults(table, row) as DefaultValues<Values>,
  });
  const values = useWatch({ control });
  function close() {
    if (isDirty || file) setDiscard(true);
    else onClose();
  }
  async function submit(input: Values) {
    if (readOnly) {
      toast.info("Entre com sua conta para salvar dados reais.");
      return;
    }
    const payload = { ...input };
    if (row?.id) {
      const locked =
        table === "campaigns"
          ? [
              "total_value",
              "payment_plan",
              "service_package_id",
              "opportunity_id",
            ]
          : table === "campaign_services"
            ? ["quantity"]
            : [];
      for (const key of locked) payload[key] = String(row[key] ?? "");
    }
    for (const f of mod.fields)
      if (f.type === "datetime-local" && payload[f.name])
        payload[f.name] = new Date(String(payload[f.name])).toISOString();
    const upload = new FormData();
    if (file) upload.set("file", file);
    if (table === "campaigns" && row?.book_club_slot_id)
      upload.set("book_club_slot_id", String(row.book_club_slot_id));
    try {
      const result = await saveRecord(table, row?.id ?? null, payload, upload);
      if (!result.ok) {
        Object.entries(result.fields ?? {}).forEach(([name, message]) =>
          setError(name, { message }),
        );
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
      onClose();
      if (result.id) onSaved?.(result.id);
    } catch {
      toast.error("Não foi possível salvar. Verifique a conexão.");
    }
  }
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) close();
        }}
      >
        <DialogContent
          title={(row?.id ? "Editar • " : "Adicionar • ") + mod.title}
          description="Os campos com * são obrigatórios."
        >
          <form onSubmit={handleSubmit(submit)} className="record-form">
            {table === "campaigns" && !row?.id && (
              <div className="notice full">
                As cobranças serão criadas automaticamente. A produção exige
                pagamento inicial e capa confirmada sem IA.
              </div>
            )}
            {mod.fields.map((f) => {
              if (
                table === "media_kits" &&
                f.persist === false &&
                f.name !== "register_sent" &&
                !values.register_sent
              )
                return null;
              if (
                table === "service_occurrences" &&
                f.name === "scheduled_date" &&
                values.schedule_status === "to_confirm"
              )
                return null;
              const immutable =
                !!row?.id &&
                ((table === "campaigns" &&
                  [
                    "total_value",
                    "payment_plan",
                    "service_package_id",
                    "opportunity_id",
                  ].includes(f.name)) ||
                  (table === "campaign_services" && f.name === "quantity"));
              let choices =
                f.type === "member"
                  ? (data.profiles ?? []).filter((p) => p.active)
                  : f.type === "relation"
                    ? (data[f.source!] ?? []).filter((p) => !p.archived_at)
                    : [];
              if (f.name === "publisher_contact_id" && values.publisher_id)
                choices = choices.filter(
                  (p) => p.publisher_id === values.publisher_id,
                );
              if (f.name === "book_id" && values.author_id)
                choices = choices.filter(
                  (p) => p.author_id === values.author_id,
                );
              if (f.name === "service_occurrence_id" && values.campaign_id) {
                const ids = (data.campaign_services ?? [])
                  .filter((s) => s.campaign_id === values.campaign_id)
                  .map((s) => s.id);
                choices = choices.filter((p) =>
                  ids.includes(String(p.campaign_service_id)),
                );
              }
              const searchableRelation =
                f.type === "relation" &&
                ["book_id", "publisher_id"].includes(f.name);
              const selectedChoice = choices.find(
                (choice) => choice.id === values[f.name],
              );
              const relationQuery = Object.hasOwn(relationQueries, f.name)
                ? relationQueries[f.name]
                : selectedChoice
                  ? labelOf(selectedChoice, f.source!)
                  : "";
              const visibleChoices =
                searchableRelation
                  ? (() => {
                      const matches = relationQuery.trim()
                        ? choices.filter((choice) =>
                            labelOf(choice, f.source!)
                              .toLocaleLowerCase("pt-BR")
                              .includes(
                                relationQuery.toLocaleLowerCase("pt-BR"),
                              ),
                          )
                        : choices.slice(0, 50);
                      return selectedChoice &&
                        !matches.some(
                          (choice) => choice.id === selectedChoice.id,
                        )
                        ? [selectedChoice, ...matches]
                        : matches;
                    })()
                  : choices;
              const reg = register(f.name, {
                required: f.required ? "Campo obrigatório." : false,
                onChange: (e) => {
                  if (f.name === "source_channel" && !row?.id) {
                    const assignment = data.channel_assignments?.find(
                      (a) => a.channel === e.target.value,
                    );
                    if (assignment)
                      setValue(
                        "responsible_user_id",
                        String(assignment.responsible_user_id),
                      );
                  }
                  if (f.name === "book_id" && e.target.value) {
                    const book = data.books?.find(
                      (b) => b.id === e.target.value,
                    );
                    if (book) {
                      if (mod.fields.some((x) => x.name === "author_id"))
                        setValue("author_id", String(book.author_id ?? ""));
                      if (mod.fields.some((x) => x.name === "publisher_id"))
                        setValue(
                          "publisher_id",
                          String(book.publisher_id ?? ""),
                        );
                    }
                  }
                  if (f.name === "service_package_id" && e.target.value) {
                    const pack = data.service_packages?.find(
                      (p) => p.id === e.target.value,
                    );
                    if (pack) {
                      setValue("total_value", String(pack.package_price));
                      setValue("proposal_type", "loyalty");
                    }
                  }
                },
              });
              return (
                <label
                  className={f.type === "textarea" ? "full" : ""}
                  key={f.name}
                  htmlFor={f.name}
                >
                  {f.label}
                  {f.required ? " *" : ""}
                  {f.type === "textarea" ? (
                    <textarea id={f.name} rows={4} {...reg} />
                  ) : f.type === "checkbox" ? (
                    <input id={f.name} type="checkbox" {...reg} />
                  ) : searchableRelation ? (
                    <div className="relation-search">
                      <input
                        id={f.name}
                        type="search"
                        aria-label={"Buscar " + f.label.toLocaleLowerCase("pt-BR")}
                        placeholder={
                          "Digite o nome " +
                          (f.name === "book_id" ? "do livro" : "da editora") +
                          " para filtrar"
                        }
                        value={relationQuery}
                        list={f.name + "-options"}
                        onChange={(e) => {
                          const query = e.target.value;
                          const choice = choices.find(
                            (item) =>
                              labelOf(item, f.source!).toLocaleLowerCase("pt-BR") ===
                              query.toLocaleLowerCase("pt-BR"),
                          );
                          setRelationQueries((current) => ({
                            ...current,
                            [f.name]: query,
                          }));
                          setValue(f.name, String(choice?.id ?? ""), {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          if (f.name === "book_id" && choice) {
                            if (mod.fields.some((item) => item.name === "author_id"))
                              setValue("author_id", String(choice.author_id ?? ""));
                            if (
                              mod.fields.some(
                                (item) => item.name === "publisher_id",
                              )
                            )
                              setValue(
                                "publisher_id",
                                String(choice.publisher_id ?? ""),
                              );
                          }
                        }}
                        disabled={immutable}
                      />
                      <input type="hidden" {...reg} />
                      <datalist id={f.name + "-options"}>
                        {visibleChoices.map((choice) => (
                          <option
                            key={choice.id}
                            value={labelOf(choice, f.source!)}
                          >
                            {labelOf(choice, f.source!)}
                          </option>
                        ))}
                      </datalist>
                      {!relationQuery && choices.length > 50 && (
                        <small>
                          Digite para localizar entre {choices.length} {f.name === "book_id" ? "livros" : "editoras"}.
                        </small>
                      )}
                    </div>
                  ) : ["relation", "member", "select"].includes(f.type) ? (
                    <select id={f.name} {...reg} disabled={immutable}>
                      <option value="">Selecione</option>
                      {f.type === "select"
                        ? Object.entries(options[f.source!] ?? {}).map(
                            ([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ),
                          )
                        : visibleChoices.map((c) => (
                            <option key={c.id} value={c.id}>
                              {f.type === "member"
                                ? String(c.full_name || c.email)
                                : labelOf(c, f.source!)}
                            </option>
                          ))}
                    </select>
                  ) : (
                    <input
                      id={f.name}
                      type={
                        f.type === "money" || f.type === "integer"
                          ? "number"
                          : f.type
                      }
                      step={
                        f.type === "money"
                          ? "0.01"
                          : f.type === "integer"
                            ? "1"
                            : undefined
                      }
                      min={
                        f.type === "money"
                          ? "0"
                          : f.type === "integer"
                            ? f.name === "release_year"
                              ? "1000"
                              : "1"
                            : undefined
                      }
                      {...reg}
                      readOnly={immutable}
                    />
                  )}
                  {errors[f.name] && (
                    <span role="alert" className="field-error">
                      {String(errors[f.name]?.message)}
                    </span>
                  )}
                </label>
              );
            })}
            {["books", "client_assets", "media_kits"].includes(table) && (
              <label className="full">
                Arquivo (até 3 MB)
                {row?.storage_path || row?.cover_storage_path
                  ? " • selecione para substituir"
                  : ""}
                <input
                  type="file"
                  accept={
                    table === "media_kits"
                      ? "application/pdf"
                      : table === "books"
                        ? "image/png,image/jpeg,image/webp"
                        : "image/png,image/jpeg,image/webp,application/pdf"
                  }
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
            <div className="dialog-actions full">
              <Button type="button" variant="secondary" onClick={close}>
                Cancelar
              </Button>
              <Button disabled={isSubmitting}>
                {isSubmitting ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discard}
        onOpenChange={setDiscard}
        title="Descartar alterações?"
        description="As alterações ainda não foram salvas."
        onConfirm={() => {
          setDiscard(false);
          onClose();
        }}
      />
    </>
  );
}
