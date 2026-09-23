"use client";
import Link from "next/link";
import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  ArrowUpRight,
  BookOpen,
  Copy,
  FileText,
  Archive,
  Trash2,
  Pencil,
  CalendarDays,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import {
  businessAction,
  removeRecord,
  assetUrl,
  saveRecord,
  saveMyProfile,
  saveWorkspaceSettings,
} from "@/actions/business";
import {
  modules,
  moduleByTable,
  moduleByRoute,
  options,
  labelOf,
  memberLabel,
  type Row,
  type Module,
} from "@/lib/modules";
import type { Dataset } from "@/lib/workspace";
import { date, money, today } from "@/lib/format";
import { compareExecutionOrder, occurrenceLabel, opportunityServiceContext, opportunityServiceLabel } from "@/lib/opportunity-service-presentation";
import { RecordForm } from "./record-form";
import { AuthorServiceForm } from "./author-service-form";
import { Dialog, DialogContent } from "./ui/dialog";
import { ConfirmDialog } from "./ui/confirm-dialog";
import {
  OperationalDashboard,
  ProductionDashboard,
  ServicesHub,
  UnifiedAgenda,
} from "./operational";
import { ThemeSelect } from "./theme-toggle";

import { StatusBadge } from "./status-badge";
import { ActionDialog } from "./action-dialog";
import { OpportunityConversation } from "./opportunity-conversation";
import { AvatarEditor } from "./avatar-editor";
export function Workbench({
  route,
  id,
  data,
  workspace,
  email,
  userId,
  readOnly = false,
  homeView = "management",
}: {
  route: string;
  id?: string;
  data: Dataset;
  workspace: { id: string; name: string; role: string } | null;
  email: string;
  userId: string;
  readOnly?: boolean;
  homeView?: string;
}) {
  const router = useRouter();
  const prefix = readOnly ? "/preview" : "";
  const [editor, setEditor] = useState<{
    table: string;
    row?: Partial<Row>;
  } | null>(null);
  const [authorServiceAuthor, setAuthorServiceAuthor] = useState<Row | null>(
    null,
  );
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [tab, setTab] = useState("overview");
  const [exportAuthors, setExportAuthors] = useState(true);
  const [exportPublishers, setExportPublishers] = useState(true);
  const [exportFormat, setExportFormat] = useState("csv");
  const [year, setYear] = useState(Number(today().slice(0, 4)));
  const [confirm, setConfirm] = useState<{
    table: string;
    row: Row;
    archive?: boolean;
    campaignDelete?: boolean;
    returnOpportunity?: boolean;
  } | null>(null);
  const [operation, setOperation] = useState<{
    action: string;
    row: Row;
  } | null>(null);
  const [preview, setPreview] = useState<{
    url: string;
    title: string;
    image: boolean;
  } | null>(null);
  const [busy, start] = useTransition();
  const mod = moduleByRoute(route);
  const record =
    mod && id ? data[mod.table]?.find((r) => r.id === id) : undefined;
  const edit = (table: string, row?: Partial<Row>) => setEditor({ table, row });
  const href = (table: string, id?: string) =>
    prefix + "/" + moduleByTable(table)!.route + (id ? "/" + id : "");
  const relatedLabel = (table: string, id: unknown) => {
    const r = data[table]?.find((r) => r.id === id);
    return r
      ? table === "opportunity_services"
        ? opportunityServiceLabel(r, data)
        : labelOf(r, table)
      : "—";
  };
  const serviceLabel = (service: Row) => {
    const type = data.service_types?.find(
      (item) => item.id === service.service_type_id,
    );
    return String(type?.name || service.custom_name || "Serviço");
  };
  const presentationLabel = (row: Row, table: string) =>
    table === "opportunity_services"
      ? opportunityServiceLabel(row, data)
      : table === "service_occurrences"
        ? occurrenceLabel(row, data)
        : labelOf(row, table);
  const coverUrl = (row: Row) => {
    const url = row.preview_url ?? row.cover_external_url;
    return typeof url === "string" && /^https?:\/\//.test(url) ? url : null;
  };
  const run = (action: string, row: Row, args: Record<string, string> = {}) =>
    start(async () => {
      if (readOnly) {
        toast.info("Entre com sua conta para salvar dados reais.");
        return;
      }
      const result = await businessAction(action, row.id, args);
      if (result.ok) {
        toast.success(result.message);
        setOperation(null);
        setConfirm(null);
        router.refresh();
      } else toast.error(result.message);
    });
  const updateProductionStatus = async (
    itemId: string,
    source: "tasks" | "service_occurrences",
    status: string,
  ) => {
    if (readOnly) {
      toast.info("Entre com sua conta para salvar dados reais.");
      return false;
    }
    const result = await businessAction(
      "update-work-status",
      itemId,
      { source, status },
    );
    if (result.ok) {
      toast.success(result.message);
      router.refresh();
      return true;
    }
    toast.error(result.message);
    return false;
  };
  async function openAsset(table: string, row: Row, copy = false) {
    const result = await assetUrl(table, row.id);
    if (!result.ok || !result.url) {
      toast.error(result.message);
      return;
    }
    if (copy) {
      await navigator.clipboard.writeText(result.url);
      toast.success("Link copiado. " + result.message);
    } else
      setPreview({
        url: result.url,
        title: labelOf(row, table),
        image: row.asset_type === "image" || table === "books",
      });
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Texto copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }
  function exportEmails() {
    const rows = [
      ...(exportAuthors
        ? (data.authors ?? [])
            .filter((author) => author.email && !author.archived_at)
            .map((author) => ({
              tipo: "Autora",
              nome: String(author.name),
              contato: "",
              email: String(author.email),
            }))
        : []),
      ...(exportPublishers
        ? (data.publisher_contacts ?? [])
            .filter((contact) => contact.email && !contact.archived_at)
            .map((contact) => ({
              tipo: "Editora",
              nome: String(
                data.publishers?.find(
                  (publisher) => publisher.id === contact.publisher_id,
                )?.name ?? "Editora",
              ),
              contato: String(contact.name),
              email: String(contact.email),
            }))
        : []),
    ];
    if (!rows.length) {
      toast.info("Não há e-mails para os filtros selecionados.");
      return;
    }
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const content =
      exportFormat === "json"
        ? JSON.stringify(rows, null, 2)
        : exportFormat === "text"
          ? rows
              .map(
                (row) =>
                  `${row.tipo} | ${row.nome}${row.contato ? ` — ${row.contato}` : ""} <${row.email}>`,
              )
              .join("\n")
          : [
              "Tipo,Nome,Contato,E-mail",
              ...rows.map((row) =>
                [row.tipo, row.nome, row.contato, row.email]
                  .map(escapeCsv)
                  .join(","),
              ),
            ].join("\n");
    const extension = exportFormat === "text" ? "txt" : exportFormat;
    const blob = new Blob([content], {
      type:
        exportFormat === "json"
          ? "application/json"
          : "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `emails-lasanas.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function announceMonth(row: Row | undefined, month: number) {
    if (row) {
      setOperation({ action: "announcement", row });
      return;
    }
    if (readOnly) {
      setOperation({
        action: "announcement",
        row: { id: "", workspace_id: "", year, month, status: "available" },
      });
      return;
    }
    const result = await saveRecord("collective_reading_slots", null, {
      year,
      month: String(month),
      status: "available",
    });
    if (!result.ok || !result.id) {
      toast.error(result.message);
      return;
    }
    router.refresh();
    setOperation({
      action: "announcement",
      row: {
        id: result.id,
        workspace_id: workspace!.id,
        year,
        month,
        status: "available",
      },
    });
  }
  function actions(table: string, row: Row) {
    return (
      <div className="record-actions">
        <button
          className="icon-button"
          title="Editar"
          aria-label={"Editar " + labelOf(row, table)}
          onClick={() => edit(table, row)}
        >
          <Pencil size={15} />
        </button>
        {["tasks", "service_occurrences"].includes(table) && (
          <button
            className="small-button"
            disabled={busy}
            onClick={() =>
              run(
                table === "tasks" ? "complete-task" : "complete-occurrence",
                row,
                { undo: String(row.status === "completed") },
              )
            }
          >
            {row.status === "completed" ? "Desfazer" : "Concluir"}
          </button>
        )}
        {table === "response_templates" && (
          <button
            className="small-button"
            onClick={() => setOperation({ action: "template", row })}
          >
            <Copy size={14} /> Copiar
          </button>
        )}
        {["client_assets", "media_kits"].includes(table) && (
          <>
            <button
              className="small-button"
              onClick={() => openAsset(table, row)}
            >
              Abrir
            </button>
            <button
              className="icon-button"
              aria-label="Copiar link"
              onClick={() => openAsset(table, row, true)}
            >
              <Copy size={14} />
            </button>
          </>
        )}
        {table === "media_kits" && !row.active && (
          <button
            className="small-button"
            onClick={() => run("activate-kit", row)}
          >
            Ativar
          </button>
        )}
        {table === "campaign_services" && (
          <button
            className="small-button"
            onClick={() => setOperation({ action: "resize", row })}
          >
            Alterar quantidade
          </button>
        )}
        {table === "opportunities" && (
          <>
            <button
              className="small-button"
              onClick={() =>
                edit("communication_logs", {
                  opportunity_id: row.id,
                  author_id: row.author_id,
                  publisher_id: row.publisher_id,
                  publisher_contact_id: row.publisher_contact_id,
                  channel: row.source_channel,
                  responsible_user_id: userId,
                })
              }
            >
              Contato realizado
            </button>
            <button
              className="small-button"
              onClick={() => setOperation({ action: "kit", row })}
            >
              Media kit enviado
            </button>
            {row.status === "approved" && (
              <button
                className="button small"
                onClick={() => run("approve-opportunity", row)}
              >
                Aprovar oportunidade
              </button>
            )}
          </>
        )}
        {table === "campaigns" &&
          row.status !== "active" &&
          row.status !== "completed" && (
            <button
              className="small-button"
              onClick={() => run("production", row)}
            >
              Iniciar produção
            </button>
          )}
        {table === "campaigns" && workspace?.role === "admin" && (
          <button
            className="small-button"
            onClick={() => setOperation({ action: "override", row })}
          >
            Exceção de pagamento
          </button>
        )}
        {table === "campaigns" && (
          <button
            className="small-button danger-button"
            onClick={() =>
              setConfirm({
                table,
                row,
                campaignDelete: true,
                returnOpportunity: false,
              })
            }
          >
            Excluir campanha
          </button>
        )}
        {table === "book_club_slots" && row.publisher_contact_id && (
          <button
            className="small-button"
            onClick={() =>
              edit("communication_logs", {
                publisher_contact_id: row.publisher_contact_id,
                responsible_user_id: userId,
                channel: "email",
                summary:
                  "Clube presencial • " +
                  options.month[String(row.month)] +
                  " " +
                  row.year,
              })
            }
          >
            Registrar contato
          </button>
        )}
        {[
          "authors",
          "publishers",
          "books",
          "opportunities",
          "campaigns",
        ].includes(table) ? (
          <>
            <button
              className="icon-button"
              aria-label="Arquivar ou reativar"
              onClick={() => setConfirm({ table, row, archive: true })}
            >
              <Archive size={15} />
            </button>
            { ["authors", "publishers", "opportunities"].includes(table) && (
              <button className="icon-button delete-button" aria-label="Excluir" onClick={() => setConfirm({ table, row })}>
                <Trash2 size={15} />
              </button>
            )}
          </>
        ) : (
          <button
            className="icon-button delete-button"
            aria-label="Excluir"
            onClick={() => setConfirm({ table, row })}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    );
  }
  function display(mod: Module, row: Row, name: string) {
    const f = mod.fields.find((f) => f.name === name);
    const value = row[name];
    if (value === null || value === undefined || value === "") return "—";
    if (f?.type === "relation") return relatedLabel(f.source!, value);
    if (f?.type === "member") {
      const p = data.profiles?.find((p) => p.id === value);
      return memberLabel(p);
    }
    if (f?.type === "select")
      return options[f.source!]?.[String(value)] ?? String(value);
    if (f?.type === "money") return money(String(value));
    if (f?.type === "checkbox") return value ? "Sim" : "Não";
    if (f?.type === "date") return date(String(value));
    if (f?.type === "datetime-local")
      return new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(String(value)));
    return String(value);
  }
  function cards(table: string, rows: Row[], compact = false, className = "") {
    const m = moduleByTable(table)!;
    if (table === "service_occurrences") rows = [...rows].sort(compareExecutionOrder);
    return rows.length ? (
      <div
        className={
          compact
            ? "record-list " + className
            : "record-grid" + (table === "books" ? " book-record-grid" : "")
        }
      >
        {rows.map((row) => {
          const pending =
            row.status === "pending" &&
            String(row.due_date ?? row.scheduled_date ?? "9999") < today();
          const ref = m.fields.filter((f) => f.type === "relation").slice(0, 2);
          const amount =
            row.amount ??
            row.total_value ??
            row.default_price ??
            row.package_price;
          const bookCover = table === "books" ? coverUrl(row) : null;
          const serviceCampaign =
            table === "campaign_services"
              ? data.campaigns?.find(
                  (campaign) => campaign.id === row.campaign_id,
                )
              : null;
          const serviceBook = serviceCampaign?.book_id
            ? data.books?.find((book) => book.id === serviceCampaign.book_id)
            : null;
          return (
            <article
              className={"record-card " + (row.archived_at ? "archived" : "")}
              key={row.id}
            >
              {bookCover ? (
                <div className="book-card-cover">
                  <Image
                    src={bookCover}
                    alt={"Capa de " + labelOf(row, table)}
                    width={180}
                    height={270}
                    unoptimized
                  />
                </div>
              ) : row.preview_url ? (
                <button
                  className="thumbnail-button"
                  onClick={() => openAsset(table, row)}
                  aria-label={"Abrir " + labelOf(row, table)}
                >
                  <Image
                    src={String(row.preview_url)}
                    alt={labelOf(row, table)}
                    width={400}
                    height={260}
                    unoptimized
                    className="asset-thumbnail"
                  />
                </button>
              ) : null}
              <div className="record-top">
                <div className="record-icon">
                  {table === "books" ? (
                    <BookOpen size={19} />
                  ) : table === "response_templates" ? (
                    <FileText size={19} />
                  ) : (
                    <Layers size={19} />
                  )}
                </div>
                {row.status ? (
                  <StatusBadge value={pending ? "overdue" : row.status} />
                ) : row.active !== undefined ? (
                  <StatusBadge value={row.active ? "active" : "cancelled"} />
                ) : row.archived_at ? (
                  <span className="badge">Arquivado</span>
                ) : null}
                {table === "service_occurrences" &&
                  row.schedule_status === "to_confirm" && (
                    <span className="badge warning">Data a confirmar</span>
                  )}
              </div>
              <Link className="record-title" href={href(table, row.id)}>
                {table === "campaign_services" ? serviceLabel(row) : presentationLabel(row, table)}
                <ArrowUpRight size={16} />
              </Link>
              <p className="record-meta">
                {table === "service_occurrences"
                  ? (() => {
                      const service = data.opportunity_services?.find((item) => item.id === row.opportunity_service_id);
                      const context = service ? opportunityServiceContext(service, data) : null;
                      return context ? `${context.author} · ${context.book}` : "Livro não informado";
                    })()
                  : table === "opportunity_services"
                  ? (() => { const context = opportunityServiceContext(row, data); return `${context.author} · ${context.book}`; })()
                  : table === "campaign_services"
                  ? String(serviceBook?.title ?? "Livro não vinculado")
                  : table === "books" && className === "author-book-list"
                    ? [
                        row.release_year ? String(row.release_year) : "",
                        row.publisher_id ? display(m, row, "publisher_id") : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : table === "client_assets" &&
                        className === "author-material-list"
                      ? [
                          row.author_id ? display(m, row, "author_id") : "",
                          row.book_id ? display(m, row, "book_id") : "",
                        ]
                          .filter(Boolean)
                          .join(" · ") ||
                        String(row.description ?? "")
                    : ref.map((f) => display(m, row, f.name)).join(" · ") ||
                      String(
                        row.email ?? row.description ?? row.category ?? "",
                      )}
              </p>
              {table === "opportunities" && (
                <div className="opportunity-item-chips">
                  {(data.opportunity_services ?? [])
                    .filter((item) => item.opportunity_id === row.id)
                    .map((item) => {
                      return <span className="badge" key={item.id}>{opportunityServiceLabel(item, data)}{item.item_kind === "package" ? ` · ${item.duration_months} meses` : ""}</span>;
                    })}
                </div>
              )}
              {table === "books" && <StatusBadge value={row.cover_ai_status} />}
              {amount !== undefined && (
                <div className="record-amount">{money(String(amount))}</div>
              )}
              {table === "service_occurrences" &&
              row.schedule_status === "to_confirm" ? (
                <p className="record-meta open-date">
                  <CalendarDays size={13} /> Data em aberto
                </p>
              ) : (
                (row.due_date ||
                  row.scheduled_date ||
                  row.next_follow_up_at) && (
                  <p className="record-meta">
                    <CalendarDays size={13} />
                    {date(
                      String(
                        row.due_date ??
                          row.scheduled_date ??
                          row.next_follow_up_at,
                      ).slice(0, 10),
                    )}
                  </p>
                )
              )}
              {table === "campaign_services" && progress(row)}
              {table === "communication_logs" && (
                <p className="record-meta">
                  {display(m, row, "contacted_at")} ·{" "}
                  {display(m, row, "channel")} · {display(m, row, "direction")}
                </p>
              )}
              {table === "response_templates" && (
                <p className="template-excerpt">{String(row.content)}</p>
              )}
              {actions(table, row)}
            </article>
          );
        })}
      </div>
    ) : (
      <div className="empty-state">
        <h3>Nenhum registro</h3>
        <p>Ainda não há registros em {m.title.toLowerCase()}.</p>
      </div>
    );
  }
  function progress(service: Row) {
    const occ = (data.service_occurrences ?? []).filter(
      (o) => o.campaign_service_id === service.id && o.status !== "cancelled",
    );
    const done = occ.filter((o) => o.status === "completed").length;
    const openDate = occ.some(
      (o) => o.status === "pending" && o.schedule_status === "to_confirm",
    );
    return (
      <div className="service-progress">
        <div>
          <span>
            {done} de {occ.length} realizados
          </span>
          <span>{occ.length - done} restantes</span>
        </div>
        <div className="progress">
          <i
            style={{
              width: (occ.length ? (done / occ.length) * 100 : 0) + "%",
            }}
          />
        </div>
        {openDate && <span className="badge warning">Data a confirmar</span>}
      </div>
    );
  }
  function mediaKitCards(rows: Row[]) {
    const groups = new Map<string, Row[]>();
    for (const kit of [...rows].sort((a, b) => {
      const yearDifference = Number(b.year ?? 0) - Number(a.year ?? 0);
      return (
        yearDifference ||
        labelOf(a, "media_kits").localeCompare(
          labelOf(b, "media_kits"),
          "pt-BR",
        )
      );
    })) {
      const year = String(kit.year ?? "Sem ano");
      groups.set(year, [...(groups.get(year) ?? []), kit]);
    }
    return rows.length ? (
      <div className="media-kit-groups">
        {[...groups.entries()].map(([year, kits]) => (
          <section className="media-kit-year" key={year}>
            <h3>{year}</h3>
            {cards("media_kits", kits)}
          </section>
        ))}
      </div>
    ) : (
      cards("media_kits", rows)
    );
  }
  function detail(m: Module, r: Row) {
    const rel: { title: string; table: string; field: string; rows: Row[] }[] =
      [];
    for (const other of modules) {
      for (const f of other.fields.filter(
        (f) => f.source === m.table && f.type === "relation",
      )) {
        const rows = (data[other.table] ?? []).filter(
          (x) => x[f.name] === r.id,
        );
        rel.push({
          title: other.title,
          table: other.table,
          field: f.name,
          rows,
        });
      }
    }
    if (m.table === "opportunities") {
      rel.length = 0;
      rel.push(
        { title: "Livro", table: "books", field: "", rows: (data.books ?? []).filter((book) => book.id === r.book_id) },
        { title: "Comunicações", table: "communication_logs", field: "opportunity_id", rows: (data.communication_logs ?? []).filter((log) => log.opportunity_id === r.id) },
        { title: "Serviços", table: "opportunity_services", field: "opportunity_id", rows: (data.opportunity_services ?? []).filter((item) => item.opportunity_id === r.id) },
        { title: "Financeiro", table: "payments", field: "", rows: (data.payments ?? []).filter((payment) => (data.opportunity_services ?? []).some((service) => service.id === payment.opportunity_service_id && service.opportunity_id === r.id)) },
      );
    }
    if (["authors", "publishers"].includes(m.table)) {
      const field = m.table === "authors" ? "author_id" : "publisher_id";
      const opportunityIds =
        m.table === "authors"
          ? (data.opportunities ?? [])
              .filter((opportunity) => opportunity.author_id === r.id)
              .map((opportunity) => opportunity.id)
          : (data.opportunities ?? []).filter((opportunity) => opportunity.publisher_id === r.id).map((opportunity) => opportunity.id);
      const services = (data.opportunity_services ?? []).filter((service) => opportunityIds.includes(String(service.opportunity_id)));
      const serviceIds = services.map((service) => service.id);
      rel.push({
        title: "Financeiro",
        table: "payments",
        field: "",
        rows: (data.payments ?? []).filter((p) => serviceIds.includes(String(p.opportunity_service_id))),
      });
      rel.push({
        title: "Serviços",
        table: "opportunity_services",
        field: "",
        rows: services,
      });
      for (const table of ["client_assets", "communication_logs"]) {
        const group = rel.find((x) => x.table === table);
        if (group) {
          group.rows = (data[table] ?? []).filter(
            (p) =>
              p[field] === r.id ||
              (table === "communication_logs" &&
                opportunityIds.includes(String(p.opportunity_id))),
          );
        }
      }
    }
    const relatedTab = rel.find((x) => x.table === tab);
    const campPayments = m.table === "opportunities" ? (data.payments ?? []).filter((p) => (data.opportunity_services ?? []).some((service) => service.id === p.opportunity_service_id && service.opportunity_id === r.id)) : [];
    const paid = campPayments
      .filter((p) => p.status === "paid")
      .reduce((s, p) => s + Number(p.amount), 0);
    return (
      <>
        <div className="page-header">
          <div>
            <Link className="eyebrow" href={href(m.table)}>
              ← {m.title}
            </Link>
            <h1>{presentationLabel(r, m.table)}</h1>
            <p>{m.description}</p>
          </div>
          <button className="button" onClick={() => edit(m.table, r)}>
            <Pencil size={15} />
            {m.table === "campaigns" ? "Editar campanha" : "Editar"}
          </button>
        </div>
        {m.table === "books" && r.cover_ai_status === "confirmed_ai" && (
          <div className="notice danger-notice">
            Este livro não pode seguir para produção enquanto utilizar uma capa
            produzida por IA.
          </div>
        )}
        {m.table === "books" && (
          <section className="book-summary" aria-label="Resumo do livro">
            <div className="book-summary-cover">
              {coverUrl(r) ? (
                <Image
                  src={coverUrl(r)!}
                  alt={"Capa de " + labelOf(r, m.table)}
                  width={88}
                  height={132}
                  unoptimized
                />
              ) : (
                <BookOpen size={26} aria-hidden="true" />
              )}
            </div>
            <dl className="book-summary-data">
              <div>
                <dt>Autora</dt>
                <dd>{display(m, r, "author_id")}</dd>
              </div>
              <div>
                <dt>Editora</dt>
                <dd>{display(m, r, "publisher_id")}</dd>
              </div>
              <div>
                <dt>Lançamento</dt>
                <dd>{display(m, r, "release_year")}</dd>
              </div>
            </dl>
          </section>
        )}
        {["authors", "publishers"].includes(m.table) && (
          <div className="summary-grid">
            <div className="summary-card">
              <span>Trabalhos fechados</span>
              <strong>
                {rel.find((x) => x.table === "opportunity_services")?.rows.length ?? 0}
              </strong>
            </div>
            <div className="summary-card">
              <span>Total contratado</span>
              <strong>
                {money(
                  (rel.find((x) => x.table === "opportunity_services")?.rows ?? []).reduce(
                    (sum, c) => sum + Number(c.unit_price) * Number(c.item_kind === "package" ? c.duration_months : c.quantity),
                    0,
                  ),
                )}
              </strong>
            </div>
            <div className="summary-card">
              <span>Último contato</span>
              <strong>
                {date(
                  String(
                    (
                      rel.find((x) => x.table === "communication_logs")?.rows ??
                      []
                    )
                      .map((c) => c.contacted_at)
                      .filter(Boolean)
                      .sort()
                      .at(-1) ?? "",
                  ).slice(0, 10) || null,
                )}
              </strong>
            </div>
          </div>
        )}
        {m.table === "campaigns" && (
          <div className="summary-grid">
            <div className="summary-card">
              <span>Valor contratado</span>
              <strong>{money(String(r.total_value))}</strong>
            </div>
            <div className="summary-card green">
              <span>Pago</span>
              <strong>{money(paid)}</strong>
            </div>
            <div className="summary-card orange">
              <span>Saldo</span>
              <strong>{money(Number(r.total_value) - paid)}</strong>
            </div>
          </div>
        )}
        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "overview"}
            className={tab === "overview" ? "selected" : ""}
            onClick={() => setTab("overview")}
          >
            Visão geral
          </button>
          {rel.map((x) => (
            <button
              role="tab"
              aria-selected={tab === x.table}
              className={tab === x.table ? "selected" : ""}
              key={x.table + x.field}
              onClick={() => setTab(x.table)}
            >
              {x.title} <span>{x.rows.length}</span>
            </button>
          ))}
        </div>
        {tab === "overview" ? (
          <>
            <section className="panel detail-panel">
              {actions(m.table, r)}
              <dl className="detail-grid">
                {m.fields
                  .filter(
                    (f) =>
                      f.persist !== false &&
                      !(
                        m.table === "opportunities" &&
                        ["media_kit_version_id", "media_kit_sent_at"].includes(
                          f.name,
                        )
                      ),
                  )
                  .map((f) => (
                    <div
                      key={f.name}
                      className={f.type === "textarea" ? "full" : ""}
                    >
                      <dt>{f.label}</dt>
                      <dd>{display(m, r, f.name)}</dd>
                    </div>
                  ))}
              </dl>
              {m.table === "campaign_services" && progress(r)}
              {["client_assets", "media_kits", "books"].includes(m.table) &&
                (r.storage_path ||
                  r.cover_storage_path ||
                  r.external_url ||
                  r.cover_external_url) && (
                  <button
                    className="button secondary"
                    onClick={() => openAsset(m.table, r)}
                  >
                    Abrir arquivo / capa
                  </button>
                )}
            </section>
            {m.table === "campaigns" && (
              <section className="panel campaign-flow">
                <div><span className="eyebrow">Fluxo da campanha</span><h2>Configure o contrato por etapas</h2><p className="muted">Livro e serviços definem o contratado; financeiro registra as cobranças; o Hub de Serviços controla as entregas.</p></div>
                <div className="campaign-flow-actions">
                  <button className="small-button" onClick={() => edit("campaigns", r)}>1. Associar livro</button>
                  <button className="small-button" onClick={() => edit("campaign_services", { campaign_id: r.id })}>2. Adicionar serviços</button>
                  <button className="small-button" onClick={() => setTab("payments")}>3. Financeiro</button>
                  <Link className="small-button" href={href("campaign_services")}>4. Datas e entregas</Link>
                </div>
              </section>
            )}
            {m.table === "campaigns" && (
              <section className="panel">
                <div className="section-heading">
                  <h2>Serviços</h2>
                  <button
                    className="small-button"
                    onClick={() =>
                      edit("campaign_services", { campaign_id: r.id })
                    }
                  >
                    Adicionar serviço
                  </button>
                </div>
                {(data.campaign_services ?? [])
                  .filter((s) => s.campaign_id === r.id)
                  .map((s) => (
                    <div key={s.id} className="production-item">
                      <Link href={href("campaign_services", s.id)}>
                        {s.custom_name ||
                          relatedLabel("service_types", s.service_type_id)}
                      </Link>
                      {progress(s)}
                      <div className="monthly-progress">
                        {Array.from(
                          new Set(
                            (data.service_occurrences ?? [])
                              .filter(
                                (o) =>
                                  o.campaign_service_id === s.id &&
                                  o.scheduled_date,
                              )
                              .map((o) => String(o.scheduled_date).slice(0, 7)),
                          ),
                        )
                          .sort()
                          .map((month) => {
                            const items = data.service_occurrences.filter(
                              (o) =>
                                o.campaign_service_id === s.id &&
                                String(o.scheduled_date).startsWith(month) &&
                                o.status !== "cancelled",
                            );
                            return (
                              <span key={month}>
                                {month.split("-").reverse().join("/")} •{" "}
                                {
                                  items.filter((o) => o.status === "completed")
                                    .length
                                }
                                /{items.length}
                              </span>
                            );
                          })}
                      </div>
                    </div>
                  ))}
              </section>
            )}
          </>
        ) : relatedTab?.table === "communication_logs" &&
          m.table === "opportunities" ? (
          <OpportunityConversation
            opportunity={r}
            data={data}
            readOnly={readOnly}
          />
        ) : relatedTab?.table === "communication_logs" &&
          m.table === "authors" ? (
          <section className="author-communications">
            <div className="section-heading">
              <div>
                <h2>Comunicações</h2>
                <p className="muted">Histórico completo por oportunidade.</p>
              </div>
            </div>
            <div className="opportunity-conversation-list">
              {(data.opportunities ?? [])
                .filter(
                  (opportunity) =>
                    opportunity.author_id === r.id && !opportunity.archived_at,
                )
                .sort((a, b) =>
                  String(b.created_at).localeCompare(String(a.created_at)),
                )
                .map((opportunity) => (
                  <OpportunityConversation
                    key={opportunity.id}
                    opportunity={opportunity}
                    data={data}
                    readOnly={readOnly}
                  />
                ))}
            </div>
            {!(data.opportunities ?? []).some(
              (opportunity) =>
                opportunity.author_id === r.id && !opportunity.archived_at,
            ) && (
              <p className="quiet-empty">
                Nenhuma oportunidade cadastrada para esta autora.
              </p>
            )}
          </section>
        ) : relatedTab?.table === "opportunity_services" && m.table === "opportunities" ? (
          <section>
            <div className="section-heading"><div><h2>Serviços contratados</h2><p className="muted">As cobranças e execuções são criadas automaticamente. A produção só é liberada pelo pagamento aplicável.</p></div><button className="button small" onClick={() => edit("opportunity_services", { opportunity_id: r.id, item_kind: "service", quantity: 1, unit_price: 0, payment_terms: "full_upfront" })}><Plus size={16} /> Adicionar serviço</button></div>
            {relatedTab.rows.length ? <div className="record-list">{relatedTab.rows.map((item) => {
              const isPlan = item.item_kind === "package";
              const source = isPlan ? data.service_packages?.find((p) => p.id === item.service_package_id) : data.service_types?.find((s) => s.id === item.service_type_id);
              const total = isPlan ? Number(item.unit_price) * Number(item.duration_months) : Number(item.unit_price) * Number(item.quantity);
              const occurrences = (data.service_occurrences ?? []).filter((occurrence) => occurrence.opportunity_service_id === item.id); const payments = (data.payments ?? []).filter((payment) => payment.opportunity_service_id === item.id); const paid = payments.filter((payment) => payment.status === "paid").reduce((sum,payment) => sum + Number(payment.amount),0); return <article className="production-item" key={item.id}><div><strong>{String(source?.name ?? "Item")}</strong><p className="muted">{isPlan ? `${money(String(item.unit_price))}/mês · ${item.duration_months} meses · total ${money(total)}` : `Quantidade: ${item.quantity} · ${money(String(item.unit_price))} cada`}</p><small>Recebido {money(paid)} · saldo {money(total-paid)} · {occurrences.filter((occurrence) => occurrence.status === "completed").length}/{occurrences.length} concluído</small></div><div className="record-actions"><button className="icon-button" onClick={() => edit("opportunity_services", item)} aria-label="Editar item"><Pencil size={15}/></button><button className="icon-button delete-button" onClick={() => setConfirm({table:"opportunity_services",row:item})} aria-label="Excluir item"><Trash2 size={15}/></button></div></article>;
            })}</div> : <p className="quiet-empty">Adicione os serviços ou planos negociados.</p>}
          </section>
        ) : relatedTab ? (
          <section>
            <div className="section-heading">
              <h2>{relatedTab.title}</h2>
              {relatedTab.field && (
                <button
                  className="button small"
                  onClick={() =>
                    edit(relatedTab.table, {
                      [relatedTab.field]: r.id,
                      ...(["authors", "publishers"].includes(m.table) &&
                      relatedTab.table === "communication_logs"
                        ? { responsible_user_id: userId }
                        : {}),
                    })
                  }
                >
                  <Plus size={16} /> Adicionar
                </button>
              )}
              {relatedTab.table === "campaign_services" &&
                m.table === "authors" && (
                  <button
                    className="button small"
                    onClick={() => setAuthorServiceAuthor(r)}
                  >
                    <Plus size={16} /> Adicionar serviço
                  </button>
                )}
            </div>
            {relatedTab.table === "campaign_services" &&
              m.table === "authors" && (
                <p className="section-help">
                  Registre o serviço e deixe a execução como “Data a confirmar”
                  quando a data ainda depender do recebimento ou da leitura.
                </p>
              )}
            {cards(
              relatedTab.table,
              relatedTab.rows,
              true,
              relatedTab.table === "books" && ["authors", "opportunities"].includes(m.table)
                ? "author-book-list"
                : m.table === "authors" && relatedTab.table === "client_assets"
                  ? "author-material-list"
                  : "",
            )}
          </section>
        ) : null}
      </>
    );
  }
  function calendar(m: Module) {
    const rows = (data[m.table] ?? []).filter((r) => Number(r.year) === year);
    return (
      <>
        <div className="calendar-toolbar">
          <label>
            Ano{" "}
            <input
              aria-label="Ano"
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <span>
            {
              rows.filter((r) =>
                ["confirmed", "completed", "reserved"].includes(
                  String(r.status),
                ),
              ).length
            }{" "}
            meses ocupados
          </span>
        </div>
        <div className="calendar-grid">
          {Object.entries(options.month).map(([month, label]) => {
            const row = rows.find((r) => Number(r.month) === Number(month));
            const available = !row || row.status === "available";
            return (
              <article
                className={"month-card " + (available ? "available" : "")}
                key={month}
              >
                <div className="month-title">
                  <span>{String(month).padStart(2, "0")}</span>
                  <h2>{label}</h2>
                </div>
                <StatusBadge
                  value={
                    row?.status ??
                    (m.table === "collective_reading_slots"
                      ? "available"
                      : "planning")
                  }
                />
                <p>
                  {row?.book_id
                    ? relatedLabel("books", row.book_id)
                    : m.table === "collective_reading_slots"
                      ? "Nenhum livro reservado."
                      : "Escolha o livro deste encontro."}
                </p>
                <button
                  className="small-button"
                  onClick={() =>
                    edit(m.table, row ?? { year, month: Number(month) })
                  }
                >
                  {row ? "Gerenciar mês" : "Planejar mês"}
                </button>
                {m.table === "collective_reading_slots" && available && (
                  <button
                    className="small-button"
                    onClick={() => announceMonth(row, Number(month))}
                  >
                    Divulgar vaga
                  </button>
                )}
                {row?.announcement_published_at && (
                  <small>
                    Anúncio publicado em{" "}
                    {date(String(row.announcement_published_at).slice(0, 10))}
                  </small>
                )}
                {row && m.table === "book_club_slots" && (
                  <Link className="text-link" href={href(m.table, row.id)}>
                    Abrir negociação <ArrowUpRight size={13} />
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      </>
    );
  }
  function settings() {
    const defaultProductionUserId = String(
      data.workspace_settings?.[0]?.default_production_user_id ?? "",
    );
    const currentProfile = data.profiles?.find(
      (profile) => profile.id === userId,
    );
    const avatarUrl = String(
      currentProfile?.avatar_preview_url ?? currentProfile?.avatar_url ?? "",
    );
    const updateSettings = (input: {
      defaultProductionUserId: string | null;
      memberId?: string;
      homeView?: string;
    }) =>
      start(async () => {
        if (readOnly) {
          toast.info("Entre com sua conta para salvar dados reais.");
          return;
        }
        const result = await saveWorkspaceSettings(input);
        if (result.ok) {
          toast.success(result.message);
          router.refresh();
        } else toast.error(result.message);
      });
    const updateProfile = (form: HTMLFormElement) =>
      start(async () => {
        if (readOnly) {
          toast.info("Entre com sua conta para salvar dados reais.");
          return;
        }
        const dataForm = new FormData(form);
        if (avatarFile) dataForm.set("avatar", avatarFile);
        const result = await saveMyProfile(
          { username: String(dataForm.get("username") ?? "") },
          dataForm,
        );
        if (result.ok) {
          toast.success(result.message);
          router.refresh();
        } else toast.error(result.message);
      });
    return (
      <>
        <div className="page-header">
          <div>
            <h1>Configurações</h1>
            <p>Conta, equipe e preferências do negócio.</p>
          </div>
        </div>
        <div className="settings-grid">
          <section className="panel settings-account">
            <h2>Conta</h2>
            <form
              className="profile-form"
              onSubmit={(event) => {
                event.preventDefault();
                updateProfile(event.currentTarget);
              }}
            >
              <div className="profile-summary">
                <div
                  className={
                    "avatar profile-avatar" + (avatarUrl ? " has-image" : "")
                  }
                  style={
                    avatarUrl
                      ? { backgroundImage: `url("${avatarUrl}")` }
                      : undefined
                  }
                >
                  {!avatarUrl &&
                    memberLabel(currentProfile).slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <strong>
                    {memberLabel(currentProfile) || "Prévia local"}
                  </strong>
                  <small>
                    {email || workspace?.name || "Workspace não configurado"}
                  </small>
                </div>
              </div>
              <div className="profile-fields">
                <label>
                  Nome de usuário
                  <input
                    name="username"
                    defaultValue={String(currentProfile?.username ?? "")}
                    placeholder="ana.organiza"
                    minLength={2}
                    maxLength={40}
                    required
                  />
                </label>
                <div className="avatar-upload-field">
                  <span>Imagem do avatar</span>
                  <button
                    className="small-button"
                    type="button"
                    onClick={() => setAvatarEditorOpen(true)}
                  >
                    {avatarFile ? "Foto ajustada" : "Escolher e ajustar"}
                  </button>
                </div>
              </div>
              <button className="small-button" disabled={busy}>
                Salvar perfil
              </button>
            </form>
            <div className="settings-appearance">
              <h2>Aparência</h2>
              <ThemeSelect />
            </div>
          </section>
          <section className="panel settings-team">
            <h2>Equipe</h2>
            <label className="settings-select">
              Responsável padrão pela produção
              <select
                value={defaultProductionUserId}
                disabled={workspace?.role !== "admin" || busy}
                onChange={(event) =>
                  updateSettings({
                    defaultProductionUserId: event.target.value || null,
                  })
                }
              >
                <option value="">Nenhuma responsável definida</option>
                {(data.profiles ?? [])
                  .filter((profile) => profile.active)
                  .map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {memberLabel(profile)}
                    </option>
                  ))}
              </select>
            </label>
            {data.profiles?.map((p) => (
              <div className="team-row" key={p.id}>
                <span className="avatar">{memberLabel(p).slice(0, 1)}</span>
                <div>
                  <strong>{memberLabel(p)}</strong>
                  <small>{String(p.email)}</small>
                </div>
                <span className="badge">
                  {p.active ? "Ativa" : "Inativa"} ·{" "}
                  {p.role === "admin" ? "Admin" : "Integrante"}
                </span>
                <label className="settings-select compact">
                  Página inicial
                  <select
                    value={String(p.home_view ?? "management")}
                    disabled={workspace?.role !== "admin" || busy}
                    onChange={(event) =>
                      updateSettings({
                        defaultProductionUserId:
                          defaultProductionUserId || null,
                        memberId: p.id,
                        homeView: event.target.value,
                      })
                    }
                  >
                    <option value="management">Gestão</option>
                    <option value="production">Meu dia / Produção</option>
                  </select>
                </label>
              </div>
            ))}
            {!data.profiles?.length && (
              <p className="muted">
                As integrantes aparecerão após a configuração do workspace.
              </p>
            )}
          </section>
        </div>
        <section className="panel settings-catalog">
          <div>
            <h2>Serviços e planos</h2>
            <p className="muted">Gerencie o catálogo e os modelos de planos sem misturá-los à operação diária.</p>
          </div>
          <div className="settings-catalog-links">
            <Link className="small-button" href={href("service_types")}>Catálogo de serviços</Link>
            <Link className="small-button" href={href("service_packages")}>Planos mensais</Link>
            <Link className="small-button" href={href("service_package_items")}>Itens dos planos</Link>
          </div>
        </section>
        <section className="panel export-panel">
          <div>
            <h2>Exportar e-mails</h2>
            <p className="muted">
              Baixe uma lista apenas com os e-mails dos contatos selecionados.
            </p>
          </div>
          <div className="export-controls">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={exportAuthors}
                onChange={(event) => setExportAuthors(event.target.checked)}
              />{" "}
              Autoras
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={exportPublishers}
                onChange={(event) => setExportPublishers(event.target.checked)}
              />{" "}
              Editoras
            </label>
            <label>
              Formato
              <select
                value={exportFormat}
                onChange={(event) => setExportFormat(event.target.value)}
              >
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
                <option value="text">Texto</option>
              </select>
            </label>
            <button
              className="button small"
              type="button"
              onClick={exportEmails}
            >
              Exportar
            </button>
          </div>
        </section>
        <AvatarEditor
          open={avatarEditorOpen}
          onOpenChange={setAvatarEditorOpen}
          onSave={setAvatarFile}
        />
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Canais de atendimento</h2>
              <p className="muted">
                Defina quem recebe os novos contatos de cada canal.
              </p>
            </div>
            <button
              className="button small"
              onClick={() => edit("channel_assignments")}
            >
              Configurar canal
            </button>
          </div>
          {cards("channel_assignments", data.channel_assignments ?? [], true)}
        </section>
        <section>
          <div className="section-heading">
            <h2>Media kit</h2>
            <button className="button small" onClick={() => edit("media_kits")}>
              Adicionar versão
            </button>
          </div>
          {mediaKitCards(data.media_kits ?? [])}
        </section>
      </>
    );
  }
  let content;
  if (route === "dashboard")
    content =
      homeView === "production" ? (
        <ProductionDashboard
          data={data}
          userId={userId}
          onStatus={updateProductionStatus}
        />
      ) : (
        <OperationalDashboard
          data={data}
          edit={edit}
          prefix={prefix}
          onComplete={(t, r) =>
            run(t === "tasks" ? "complete-task" : "complete-occurrence", r)
          }
        />
      );
  else if (route === "finalizados")
    content = <ProductionDashboard data={data} userId={userId} onStatus={updateProductionStatus} completedOnly />;
  else if (route === "agenda")
    content = <UnifiedAgenda data={data} edit={edit} />;
  else if (route === "servicos-contratados")
    content = <ServicesHub data={data} edit={edit} />;
  else if (route === "configuracoes") content = settings();
  else if (mod && record) content = detail(mod, record);
  else if (mod && id)
    content = (
      <div className="empty-state">
        <h1>Registro não encontrado</h1>
        <Link href={href(mod.table)}>Voltar à listagem</Link>
      </div>
    );
  else if (mod) {
    let rows = (data[mod.table] ?? []).filter(
      (r) =>
        !query ||
        JSON.stringify(r).toLowerCase().includes(query.toLowerCase()) ||
        mod.fields.some(
          (f) =>
            f.type === "relation" &&
            relatedLabel(f.source!, r[f.name])
              .toLowerCase()
              .includes(query.toLowerCase()),
        ),
    );
    if (mod.table === "service_occurrences") {
      rows = rows.filter((row) => {
        const service = data.opportunity_services?.find((item) => item.id === row.opportunity_service_id);
        return service?.item_kind !== "package" || !!row.released_at;
      });
    }
    rows = rows.filter((r) =>
      filter === "archived"
        ? !!r.archived_at
        : !r.archived_at &&
          (!filter || String(r.status ?? r.active) === filter),
    );
    const statuses = mod.fields.find((f) => f.name === "status")?.source;
    content = (
      <>
        <div className="page-header">
          <div>
            <h1>{mod.title}</h1>
            <p>{mod.description}</p>
          </div>
          <button className="button" onClick={() => edit(mod.table)}>
            <Plus size={17} /> Adicionar
          </button>
        </div>
        {mod.table === "service_types" && (
          <Link className="inline-link" href={href("service_packages")}>
            Ver pacotes de fidelização <ArrowUpRight size={15} />
          </Link>
        )}
        {mod.table === "payments" && (
          <div className="summary-grid">
            {[
              ["A receber", rows.filter((r) => r.status === "pending")],
              [
                "Recebido no mês",
                rows.filter(
                  (r) =>
                    r.status === "paid" &&
                    String(r.paid_at).startsWith(today().slice(0, 7)),
                ),
              ],
              [
                "Atrasado",
                rows.filter(
                  (r) => r.status === "pending" && String(r.due_date) < today(),
                ),
              ],
            ].map(([label, items]) => (
              <div className="summary-card" key={String(label)}>
                <span>{String(label)}</span>
                <strong>
                  {money(
                    (items as Row[]).reduce((s, r) => s + Number(r.amount), 0),
                  )}
                </strong>
              </div>
            ))}
          </div>
        )}
        {mod.table.includes("_slots") ? (
          calendar(mod)
        ) : (
          <>
            <div className="list-toolbar">
              <div className="search-input">
                <Search size={17} />
                <input
                  aria-label="Buscar registros"
                  placeholder={"Buscar em " + mod.title.toLowerCase() + "…"}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <select
                aria-label="Filtrar status"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">Todos os atuais</option>
                {statuses &&
                  Object.entries(options[statuses]).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                <option value="archived">Arquivados</option>
              </select>
              <span className="muted">{rows.length} registros</span>
            </div>
            {cards(mod.table, rows)}
          </>
        )}
      </>
    );
  } else content = <div className="empty-state">Página não encontrada.</div>;
  return (
    <div className="page">
      {readOnly && (
        <div className="preview-banner">
          Prévia local da interface • sem dados fictícios.{" "}
          <Link href="/login">Entrar para usar o sistema</Link>
        </div>
      )}
      {content}
      {editor && (
        <RecordForm
          key={editor.table + (editor.row?.id ?? "new")}
          table={editor.table}
          row={editor.row}
          data={data}
          open
          onClose={() => setEditor(null)}
          readOnly={readOnly}
        />
      )}
      {authorServiceAuthor && (
        <AuthorServiceForm
          author={authorServiceAuthor}
          data={data}
          open
          onClose={() => setAuthorServiceAuthor(null)}
          readOnly={readOnly}
        />
      )}
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v) setConfirm(null);
        }}
        title={
          confirm?.campaignDelete
            ? "Excluir campanha?"
            : confirm?.archive
              ? "Arquivar ou reativar registro?"
              : "Excluir registro?"
        }
        description={
          confirm?.campaignDelete
            ? (() => {
                const services = (data.campaign_services ?? []).filter(
                  (service) => service.campaign_id === confirm.row.id,
                );
                const serviceIds = services.map((service) => service.id);
                const occurrences = (data.service_occurrences ?? []).filter(
                  (occurrence) =>
                    serviceIds.includes(String(occurrence.campaign_service_id)),
                );
                const payments = (data.payments ?? []).filter(
                  (payment) => payment.campaign_id === confirm.row.id,
                );
                const assets = (data.client_assets ?? []).filter(
                  (asset) => asset.campaign_id === confirm.row.id,
                );
                return `Esta campanha possui ${services.length} serviços, ${occurrences.length} execuções, ${payments.length} pagamentos e ${assets.length} materiais. Serviços, execuções e pagamentos serão removidos. Os materiais e seus arquivos serão preservados, sem o vínculo à campanha.`;
              })()
            : confirm?.archive
              ? "O histórico será preservado e o registro poderá ser reativado."
              : confirm?.table === "campaign_services"
                ? (() => {
                    const occurrences = (data.service_occurrences ?? []).filter(
                      (occurrence) =>
                        occurrence.campaign_service_id === confirm.row.id,
                    );
                    const completed = occurrences.filter(
                      (occurrence) => occurrence.status === "completed",
                    ).length;
                    return `Este serviço possui ${occurrences.length} execuções${completed ? `, incluindo ${completed} concluída(s)` : ""}. Todas as execuções associadas serão removidas; materiais produzidos serão preservados.`;
                  })()
                : confirm?.table === "payments" && confirm.row.status === "paid"
                  ? "Este pagamento está marcado como recebido. Tem certeza de que deseja excluí-lo?"
                  : "Esta ação remove o registro e, se houver, seu arquivo. Registros com vínculos precisam ser desvinculados antes."
        }
        busy={busy}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.archive) {
            run("archive", confirm.row, {
              table: confirm.table,
              undo: String(!!confirm.row.archived_at),
            });
            return;
          }
          if (confirm.campaignDelete) {
            start(async () => {
              const result = await businessAction(
                "delete-campaign",
                confirm.row.id,
                {
                  returnOpportunity: String(!!confirm.returnOpportunity),
                },
              );
              if (result.ok) {
                toast.success("Campanha excluída com segurança.");
                setConfirm(null);
                router.push(href("campaigns"));
                router.refresh();
              } else toast.error(result.message);
            });
            return;
          }
          start(async () => {
            if (readOnly) {
              toast.info("Entre para editar.");
              return;
            }
            const result = await removeRecord(confirm.table, confirm.row.id);
            if (result.ok) {
              toast.success(result.message);
              setConfirm(null);
              router.push(href(confirm.table));
              router.refresh();
            } else toast.error(result.message);
          });
        }}
      >
        {confirm?.campaignDelete && confirm.row.opportunity_id && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={!!confirm.returnOpportunity}
              onChange={(event) =>
                setConfirm((current) =>
                  current
                    ? { ...current, returnOpportunity: event.target.checked }
                    : current,
                )
              }
            />
            Retornar a oportunidade convertida para “Aprovada”
          </label>
        )}
      </ConfirmDialog>
      {operation && (
        <ActionDialog
          operation={operation}
          data={data}
          busy={busy}
          close={() => setOperation(null)}
          run={run}
          copy={copy}
        />
      )}
      <Dialog
        open={!!preview}
        onOpenChange={(v) => {
          if (!v) setPreview(null);
        }}
      >
        <DialogContent
          title={preview?.title ?? "Material"}
          description="Acesso privado e temporário ao arquivo."
        >
          {preview?.image && (
            <Image
              src={preview.url}
              alt={preview.title}
              width={900}
              height={700}
              unoptimized
              className="asset-preview"
            />
          )}
          {preview && (
            <a
              className="button"
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir em nova aba
            </a>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
