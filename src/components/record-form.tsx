"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type DefaultValues } from "react-hook-form";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { savePackageServiceItems, saveRecord } from "@/actions/business";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  options,
  moduleByTable,
  labelOf,
  memberLabel,
  type Row,
} from "@/lib/modules";
import type { Dataset } from "@/lib/workspace";
import { today } from "@/lib/format";

type Values = Record<string, string | boolean | string[]>;
function RelationCombobox({
  id,
  source,
  placeholder,
  emptyLabel,
  clearLabel,
  labelFor,
  choices,
  selectedId,
  onSelect,
  disabled = false,
}: {
  id: string;
  source: string;
  placeholder: string;
  emptyLabel: string;
  clearLabel?: string;
  labelFor?: (choice: Row) => string;
  choices?: Row[];
  selectedId: string | boolean | undefined;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const records = choices ?? [];
  const selected = records.find((choice) => choice.id === selectedId);
  const choiceLabel = (choice: Row) =>
    labelFor?.(choice) ?? labelOf(choice, source);
  const selectedLabel = selected ? choiceLabel(selected) : "";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const typedQuery = query ?? selectedLabel;
  const filtered = typedQuery.trim()
    ? records.filter((choice) =>
        choiceLabel(choice)
          .toLocaleLowerCase("pt-BR")
          .includes(typedQuery.toLocaleLowerCase("pt-BR")),
      )
    : records;
  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setQuery(null);
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);
  function choose(choice: Row) {
    onSelect(choice.id);
    setQuery(null);
    setOpen(false);
  }
  function clearChoice() {
    onSelect("");
    setQuery(null);
    setOpen(false);
  }
  function showAll() {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }
  return (
    <div className="relation-combobox" ref={root}>
      <div className="combobox-input">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={id + "-options"}
          aria-expanded={open}
          aria-activedescendant={
            open && filtered[activeIndex]
              ? id + "-option-" + filtered[activeIndex].id
              : undefined
          }
          placeholder={placeholder}
          value={typedQuery}
          disabled={disabled}
          onClick={() => !open && showAll()}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
            onSelect("");
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (!open) showAll();
              else
                setActiveIndex((index) =>
                  Math.min(index + 1, filtered.length - 1),
                );
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) showAll();
              else setActiveIndex((index) => Math.max(index - 1, 0));
            }
            if (event.key === "Enter" && open) {
              event.preventDefault();
              if (filtered[activeIndex]) choose(filtered[activeIndex]);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setQuery(null);
              setOpen(false);
            }
          }}
        />
        <button
          type="button"
          className="combobox-toggle"
          aria-label={"Abrir opções de " + source}
          onClick={() => {
            if (open) {
              setQuery(null);
              setOpen(false);
            } else showAll();
          }}
          disabled={disabled}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {open && (
        <div className="combobox-options" id={id + "-options"} role="listbox">
          {choices === undefined ? (
            <p>Carregando...</p>
          ) : filtered.length ? (
            <>
              {clearLabel && (
                <button
                  type="button"
                  role="option"
                  aria-selected={!selectedId}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clearChoice}
                >
                  {clearLabel}
                </button>
              )}
              {filtered.map((choice, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={choice.id === selectedId}
                  className={index === activeIndex ? "active" : ""}
                  id={id + "-option-" + choice.id}
                  key={choice.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(choice)}
                >
                  {choiceLabel(choice)}
                </button>
              ))}
            </>
          ) : (
            <p>{emptyLabel}</p>
          )}
        </div>
      )}
    </div>
  );
}
function defaults(table: string, row?: Partial<Row>): Values {
  const mod = moduleByTable(table)!;
  const values: Values = {};
  for (const f of mod.fields) {
    let value = row?.[f.name];
    if (table === "opportunities" && f.name === "media_kit_sent")
      value = row?.media_kit_version_id ? "yes" : "no";
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
    values[f.name] =
      f.type === "package-items"
        ? Array.isArray(value)
          ? value.map(String)
          : []
        : typeof value === "boolean"
          ? value
          : String(value);
  }
  return values;
}
function packageServiceDefaults(
  table: string,
  row: Partial<Row> | undefined,
  data: Dataset,
) {
  if (table !== "service_packages") return {};
  const existing = new Map(
    (data.service_package_items ?? [])
      .filter((item) => item.package_id === row?.id && !item.archived_at)
      .map((item) => [String(item.service_type_id), item]),
  );
  return Object.fromEntries(
    (data.service_types ?? [])
      .filter((service) => service.active && !service.archived_at)
      .map((service) => {
        const item = existing.get(String(service.id));
        return [
          String(service.id),
          {
            selected: !!item,
            quantity: String(item?.quantity_per_month ?? 1),
            choiceGroup: String(item?.choice_group ?? ""),
          },
        ];
      }),
  ) as Record<
    string,
    { selected: boolean; quantity: string; choiceGroup: string }
  >;
}
export function RecordForm({
  table,
  row,
  open,
  onClose,
  data,
  readOnly = false,
}: {
  table: string;
  row?: Partial<Row>;
  open: boolean;
  onClose: () => void;
  data: Dataset;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const mod = moduleByTable(table)!;
  const [file, setFile] = useState<File | null>(null);
  const [discard, setDiscard] = useState(false);
  const [packageServiceItems, setPackageServiceItems] = useState<
    Record<string, { selected: boolean; quantity: string; choiceGroup: string }>
  >(() => packageServiceDefaults(table, row, data));
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
  const packageItems = (data.service_package_items ?? []).filter(
    (item) =>
      item.package_id === values.service_package_id && !item.archived_at,
  );
  const selectedPackageItems = Array.isArray(values.selected_package_item_ids)
    ? values.selected_package_item_ids
    : [];
  function selectPackage(id: string) {
    const pack = data.service_packages?.find((item) => item.id === id);
    if (!pack) return;
    const items = (data.service_package_items ?? []).filter(
      (item) => item.package_id === id && !item.archived_at,
    );
    const seenChoiceGroups = new Set<string>();
    const initiallySelected = items
      .filter((item) => {
        const group = String(item.choice_group ?? "");
        if (!group) return true;
        if (seenChoiceGroups.has(group)) return false;
        seenChoiceGroups.add(group);
        return true;
      })
      .map((item) => item.id);
    const duration = Number(pack.duration_months || 1);
    const monthly = Number(pack.package_price || 0);
    const durationField = table === "opportunity_service_items" ? "duration_months" : "contract_duration_months";
    const priceField = table === "opportunity_service_items" ? "unit_price" : "monthly_value";
    setValue(durationField, String(duration), {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(priceField, String(monthly), {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (table !== "opportunity_service_items") setValue("selected_package_item_ids", initiallySelected, { shouldDirty: true, shouldValidate: true });
    const totalField =
      table === "opportunities" ? "estimated_value" : "total_value";
    setValue(totalField, String(monthly * duration), {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (table === "opportunities") setValue("proposal_type", "loyalty", { shouldDirty: true });
  }
  function updatePlanTotal(
    field: "contract_duration_months" | "monthly_value",
    value: string,
  ) {
    const duration = Number(
      field === "contract_duration_months"
        ? value
        : values.contract_duration_months,
    );
    const monthly = Number(
      field === "monthly_value" ? value : values.monthly_value,
    );
    if (
      Number.isFinite(duration) &&
      duration > 0 &&
      Number.isFinite(monthly) &&
      monthly >= 0
    ) {
      setValue(
        table === "opportunities" ? "estimated_value" : "total_value",
        String(duration * monthly),
        {
          shouldDirty: true,
          shouldValidate: true,
        },
      );
    }
  }
  useEffect(() => {
    if (table === "campaign_services" && !row?.id && !values.assigned_to) {
      const defaultAssignee =
        data.workspace_settings?.[0]?.default_production_user_id;
      if (defaultAssignee) setValue("assigned_to", String(defaultAssignee));
    }
  }, [data.workspace_settings, row?.id, setValue, table, values.assigned_to]);
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
      const locked: string[] = [];
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
      if (table === "service_packages") {
        const packageResult = await savePackageServiceItems({
          packageId: result.id,
          items: Object.entries(packageServiceItems)
            .filter(([, item]) => item.selected)
            .map(([serviceTypeId, item]) => ({
              serviceTypeId,
              quantityPerMonth: item.quantity,
              choiceGroup: item.choiceGroup || null,
            })),
        });
        if (!packageResult.ok) {
          toast.error(packageResult.message);
          return;
        }
      }
      toast.success(result.message);
      router.refresh();
      onClose();
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
          className={
            table === "opportunities" ? "opportunity-dialog" : undefined
          }
        >
          <form
            onSubmit={handleSubmit(submit)}
            className={
              "record-form" +
              (table === "opportunities" ? " opportunity-form" : "")
            }
          >
            {table === "campaigns" && !row?.id && (
              <div className="notice full">
                As cobranças serão criadas automaticamente. A produção exige
                pagamento inicial e capa confirmada sem IA.
              </div>
            )}
            {table === "opportunities" && (
              <div className="notice full">A identificação é criada automaticamente a partir da autora e do livro. A editora é exibida a partir do cadastro do livro.</div>
            )}
            {table === "service_packages" && (
              <section className="package-editor full">
                <div>
                  <strong>Serviços incluídos</strong>
                  <p className="muted">
                    Marque os serviços que o plano entrega por mês. Para uma
                    alternativa, use o mesmo grupo de escolha.
                  </p>
                </div>
                {(data.service_types ?? []).filter(
                  (service) => service.active && !service.archived_at,
                ).length ? (
                  <div className="package-editor-list">
                    {(data.service_types ?? [])
                      .filter((service) => service.active && !service.archived_at)
                      .map((service) => {
                        const item = packageServiceItems[String(service.id)] ?? {
                          selected: false,
                          quantity: "1",
                          choiceGroup: "",
                        };
                        return (
                          <div className="package-editor-row" key={service.id}>
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={(event) =>
                                  setPackageServiceItems((current) => ({
                                    ...current,
                                    [String(service.id)]: {
                                      ...item,
                                      selected: event.target.checked,
                                    },
                                  }))
                                }
                              />
                              <span>{String(service.name)}</span>
                            </label>
                            {item.selected && (
                              <>
                                <label>
                                  Por mês
                                  <input
                                    type="number"
                                    min="1"
                                    max="600"
                                    value={item.quantity}
                                    onChange={(event) =>
                                      setPackageServiceItems((current) => ({
                                        ...current,
                                        [String(service.id)]: {
                                          ...item,
                                          quantity: event.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </label>
                                <label>
                                  Grupo de escolha
                                  <input
                                    type="text"
                                    placeholder="Opcional"
                                    value={item.choiceGroup}
                                    onChange={(event) =>
                                      setPackageServiceItems((current) => ({
                                        ...current,
                                        [String(service.id)]: {
                                          ...item,
                                          choiceGroup: event.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </label>
                              </>
                            )}
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <p className="muted">Cadastre ao menos um serviço antes de montar o plano.</p>
                )}
              </section>
            )}
            {mod.fields.map((f, index) => {
              if (table === "opportunities" && f.name === "name") return null;
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
              if (
                table === "campaigns" &&
                f.name === "payment_plan_action" &&
                !row?.id
              )
                return null;
              if (
                table === "publishers" &&
                row?.id &&
                f.name.startsWith("contact_")
              )
                return null;
              if (
                table === "opportunities" &&
                ["media_kit_version_id", "media_kit_sent_at"].includes(
                  f.name,
                ) &&
                values.media_kit_sent !== "yes"
              )
                return null;
              if (table === "opportunity_service_items" && f.name === "service_type_id" && values.item_kind !== "service") return null;
              if (table === "opportunity_service_items" && ["service_package_id", "duration_months"].includes(f.name) && values.item_kind !== "package") return null;
              if (table === "opportunity_service_items" && f.name === "payment_terms" && values.item_kind === "package") return null;
              const immutable = false;
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
              if (
                table === "communication_logs" &&
                f.name === "opportunity_id" &&
                values.author_id
              )
                choices = choices.filter(
                  (opportunity) =>
                    opportunity.author_id === values.author_id ||
                    opportunity.id === values.opportunity_id,
                );
              if (f.name === "service_occurrence_id" && values.campaign_id) {
                const ids = (data.campaign_services ?? [])
                  .filter((s) => s.campaign_id === values.campaign_id)
                  .map((s) => s.id);
                choices = choices.filter((p) =>
                  ids.includes(String(p.campaign_service_id)),
                );
              }
              if (table === "campaigns" && f.name === "opportunity_id")
                choices = choices.filter(
                  (opportunity) =>
                    opportunity.status === "approved" ||
                    opportunity.id === values.opportunity_id,
                );
              if (table === "campaigns" && f.name === "service_package_id")
                choices = choices.filter(
                  (pack) =>
                    pack.active || pack.id === values.service_package_id,
                );
              const searchableRelation =
                f.type === "relation" &&
                (["book_id", "publisher_id", "media_kit_version_id"].includes(
                  f.name,
                ) ||
                  table === "campaigns");
              const section =
                table === "opportunities"
                  ? (
                      {
                        name: "Contato",
                        contact_type: "Contato",
                        author_id: "Contato",
                        publisher_id: "Contato",
                        publisher_contact_id: "Contato",
                        source_channel: "Contato",
                        responsible_user_id: "Contato",
                        book_id: "Livro",
                        media_kit_sent: "Media kit",
                        media_kit_version_id: "Media kit",
                        media_kit_sent_at: "Media kit",
                        status: "Proposta e negociação",
                        proposal_type: "Proposta e negociação",
                        service_package_id: "Proposta e negociação",
                        contract_duration_months: "Proposta e negociação",
                        monthly_value: "Proposta e negociação",
                        selected_package_item_ids: "Proposta e negociação",
                        estimated_value: "Proposta e negociação",
                        proposal_items: "Proposta e negociação",
                        first_contact_at: "Acompanhamento",
                        last_contact_at: "Acompanhamento",
                        next_follow_up_at: "Acompanhamento",
                        book_data_collected: "Acompanhamento",
                        ai_cover_policy_informed: "Acompanhamento",
                        ai_cover_policy_accepted_at: "Acompanhamento",
                        notes: "Acompanhamento",
                      } as Record<string, string>
                    )[f.name]
                  : undefined;
              const sectionStarted =
                !!section &&
                !mod.fields.slice(0, index).some((previous) => {
                  const previousSection = (
                    {
                      name: "Contato",
                      contact_type: "Contato",
                      author_id: "Contato",
                      publisher_id: "Contato",
                      publisher_contact_id: "Contato",
                      source_channel: "Contato",
                      responsible_user_id: "Contato",
                      book_id: "Livro",
                      media_kit_sent: "Media kit",
                      media_kit_version_id: "Media kit",
                      media_kit_sent_at: "Media kit",
                      status: "Proposta e negociação",
                      proposal_type: "Proposta e negociação",
                      service_package_id: "Proposta e negociação",
                      contract_duration_months: "Proposta e negociação",
                      monthly_value: "Proposta e negociação",
                      selected_package_item_ids: "Proposta e negociação",
                      estimated_value: "Proposta e negociação",
                      proposal_items: "Proposta e negociação",
                      first_contact_at: "Acompanhamento",
                      last_contact_at: "Acompanhamento",
                      next_follow_up_at: "Acompanhamento",
                      book_data_collected: "Acompanhamento",
                      ai_cover_policy_informed: "Acompanhamento",
                      ai_cover_policy_accepted_at: "Acompanhamento",
                      notes: "Acompanhamento",
                    } as Record<string, string>
                  )[previous.name];
                  return previousSection === section;
                });
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
                  if (
                    f.name === "media_kit_sent" &&
                    e.target.value === "yes" &&
                    !values.media_kit_sent_at
                  )
                    setValue("media_kit_sent_at", today(), {
                      shouldDirty: true,
                    });
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
                  if (table === "opportunity_service_items" && f.name === "service_type_id" && e.target.value) {
                    const service = data.service_types?.find((item) => item.id === e.target.value);
                    if (service) setValue("unit_price", String(service.default_price ?? 0), { shouldDirty: true });
                  }
                  if (f.name === "service_package_id" && e.target.value)
                    selectPackage(e.target.value);
                  if (
                    (f.name === "contract_duration_months" ||
                      f.name === "monthly_value") &&
                    values.service_package_id
                  )
                    updatePlanTotal(f.name, e.target.value);
                  if (
                    f.name === "service_type_id" &&
                    e.target.value &&
                    mod.fields.some((item) => item.name === "unit_price")
                  ) {
                    const service = data.service_types?.find(
                      (item) => item.id === e.target.value,
                    );
                    if (service)
                      setValue(
                        "unit_price",
                        String(service.default_price ?? 0),
                        { shouldDirty: true, shouldValidate: true },
                      );
                  }
                },
              });
              return (
                <Fragment key={f.name}>
                  {sectionStarted && (
                    <h3 className="form-section-title">{section}</h3>
                  )}
                  <label
                    className={f.type === "textarea" ? "full" : ""}
                    htmlFor={f.name}
                  >
                    {f.label}
                    {f.required ? " *" : ""}
                    {f.type === "package-items" ? (
                      <div className="package-items-checklist">
                        {!values.service_package_id ? (
                          <p className="muted">
                            Selecione um plano mensal para escolher os serviços
                            incluídos.
                          </p>
                        ) : packageItems.length ? (
                          packageItems.map((item) => {
                            const itemId = String(item.id);
                            const checked =
                              selectedPackageItems.includes(itemId);
                            const service = data.service_types?.find(
                              (type) => type.id === item.service_type_id,
                            );
                            const group = String(item.choice_group ?? "");
                            return (
                              <label className="checkbox-label" key={itemId}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => {
                                    let next = event.target.checked
                                      ? [...selectedPackageItems, itemId]
                                      : selectedPackageItems.filter(
                                          (selected) => selected !== itemId,
                                        );
                                    if (event.target.checked && group)
                                      next = next.filter((selected) => {
                                        if (selected === itemId) return true;
                                        return (
                                          String(
                                            packageItems.find(
                                              (candidate) =>
                                                candidate.id === selected,
                                            )?.choice_group ?? "",
                                          ) !== group
                                        );
                                      });
                                    setValue(
                                      "selected_package_item_ids",
                                      next,
                                      {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                      },
                                    );
                                  }}
                                />
                                <span>
                                  {String(item.quantity_per_month)} por mês ·{" "}
                                  {String(service?.name ?? "Serviço")}
                                  {group ? ` (${group})` : ""}
                                </span>
                              </label>
                            );
                          })
                        ) : (
                          <p className="muted">
                            Este plano ainda não possui serviços cadastrados.
                          </p>
                        )}
                      </div>
                    ) : f.type === "textarea" ? (
                      <textarea id={f.name} rows={4} {...reg} />
                    ) : f.type === "checkbox" ? (
                      <input id={f.name} type="checkbox" {...reg} />
                    ) : searchableRelation ? (
                      <div>
                        <input type="hidden" {...reg} />
                        <RelationCombobox
                          id={f.name}
                          source={f.source!}
                          placeholder={
                            f.name === "book_id"
                              ? "Clique ou digite para buscar um livro"
                              : f.name === "publisher_id"
                                ? "Clique ou digite para buscar uma editora"
                                : f.name === "author_id"
                                  ? "Clique ou digite para buscar uma autora"
                                  : f.name === "opportunity_id"
                                    ? "Clique ou digite para buscar uma oportunidade"
                                    : f.name === "service_package_id"
                                      ? "Clique ou digite para buscar um pacote"
                                      : "Clique ou digite para buscar um media kit"
                          }
                          emptyLabel={
                            f.name === "book_id"
                              ? "Nenhum livro encontrado."
                              : f.name === "publisher_id"
                                ? "Nenhuma editora encontrada."
                                : f.name === "author_id"
                                  ? "Nenhuma autora encontrada."
                                  : f.name === "opportunity_id"
                                    ? "Nenhuma oportunidade aprovada encontrada."
                                    : f.name === "service_package_id"
                                      ? "Nenhum pacote ativo encontrado."
                                      : "Nenhum media kit encontrado."
                          }
                          clearLabel={
                            table === "campaigns" && f.name === "opportunity_id"
                              ? "Nenhuma oportunidade"
                              : table === "campaigns" &&
                                  f.name === "service_package_id"
                                ? "Nenhum pacote"
                                : undefined
                          }
                          labelFor={
                            table === "campaigns" && f.name === "opportunity_id"
                              ? (opportunity: Row) => {
                                  const author = data.authors?.find(
                                    (item) => item.id === opportunity.author_id,
                                  );
                                  return [
                                    String(author?.name ?? opportunity.name),
                                    options.opportunity[
                                      String(opportunity.status)
                                    ] ?? String(opportunity.status),
                                  ]
                                    .filter(Boolean)
                                    .join(" · ");
                                }
                              : table === "campaigns" &&
                                  f.name === "service_package_id"
                                ? (pack: Row) =>
                                    `${String(pack.name)} · ${String(pack.duration_months)} meses · R$ ${String(pack.package_price)}/mês`
                                : undefined
                          }
                          choices={data[f.source!] ? choices : undefined}
                          selectedId={
                            Array.isArray(values[f.name])
                              ? ""
                              : (values[f.name] as string | boolean | undefined)
                          }
                          disabled={immutable}
                          onSelect={(id) => {
                            setValue(f.name, id, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                            if (f.name === "book_id" && id) {
                              const book = data.books?.find(
                                (item) => item.id === id,
                              );
                              if (book) {
                                if (
                                  mod.fields.some(
                                    (item) => item.name === "author_id",
                                  )
                                )
                                  setValue(
                                    "author_id",
                                    String(book.author_id ?? ""),
                                  );
                                if (
                                  mod.fields.some(
                                    (item) => item.name === "publisher_id",
                                  )
                                )
                                  setValue(
                                    "publisher_id",
                                    String(book.publisher_id ?? ""),
                                  );
                              }
                            }
                            if (f.name === "opportunity_id" && id) {
                              const opportunity = data.opportunities?.find(
                                (item) => item.id === id,
                              );
                              if (opportunity) {
                                setValue(
                                  "author_id",
                                  String(opportunity.author_id ?? ""),
                                );
                                setValue(
                                  "publisher_id",
                                  String(opportunity.publisher_id ?? ""),
                                );
                                setValue(
                                  "responsible_user_id",
                                  String(opportunity.responsible_user_id ?? ""),
                                );
                                setValue(
                                  "proposal_type",
                                  String(opportunity.proposal_type ?? "custom"),
                                );
                              }
                            }
                            if (f.name === "service_package_id" && id) {
                              selectPackage(id);
                            }
                          }}
                        />
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
                          : choices.map((c) => (
                              <option key={c.id} value={c.id}>
                                {f.type === "member"
                                  ? memberLabel(c)
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
                              ? ["release_year", "year"].includes(f.name)
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
                </Fragment>
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
                  onChange={(e) => {
                    const selected = e.target.files?.[0] ?? null;
                    if (selected && selected.size > 3 * 1024 * 1024) {
                      e.target.value = "";
                      setFile(null);
                      toast.error("O arquivo deve ter no máximo 3 MB.");
                      return;
                    }
                    setFile(selected);
                  }}
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
