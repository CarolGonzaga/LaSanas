"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Plus,
  Inbox,
  CalendarDays,
  Wallet,
  CheckCircle2,
  Clock,
  ArrowRight,
  BookOpen,
  MessageCircle,
} from "lucide-react";
import type { Dataset } from "@/lib/workspace";
import { moduleByTable, options, type Row } from "@/lib/modules";
import { money, date, today } from "@/lib/format";
import { StatusBadge } from "./status-badge";

type Event = {
  id: string;
  table: string;
  row: Row;
  title: string;
  subtitle: string;
  date: string;
  group: string;
  done: boolean;
  assigned: string;
  client: string;
};
function dayOf(value: unknown) {
  if (!value) return "";
  const v = String(value);
  return v.includes("T")
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date(v))
    : v.slice(0, 10);
}
export function eventsFor(data: Dataset): Event[] {
  const result: Event[] = [];
  const campaign = (id: unknown) => data.campaigns?.find((c) => c.id === id);
  for (const r of data.service_occurrences ?? []) {
    const service = data.campaign_services?.find(
        (s) => s.id === r.campaign_service_id,
      ),
      camp = campaign(service?.campaign_id),
      type = data.service_types?.find((t) => t.id === service?.service_type_id);
    result.push({
      id: r.id,
      table: "service_occurrences",
      row: r,
      title:
        String(service?.custom_name || type?.name || "Serviço") +
        " • " +
        r.sequence_number +
        "/" +
        (service?.quantity ?? "?"),
      subtitle: String(camp?.name ?? "Campanha"),
      date: dayOf(r.scheduled_date),
      group: "Produção",
      done: r.status !== "pending",
      assigned: String(camp?.responsible_user_id ?? ""),
      client: String(camp?.author_id ?? camp?.publisher_id ?? ""),
    });
  }
  for (const r of data.tasks ?? [])
    result.push({
      id: r.id,
      table: "tasks",
      row: r,
      title: String(r.title),
      subtitle: "Tarefa interna",
      date: dayOf(r.due_date),
      group: "Tarefas",
      done: r.status === "completed",
      assigned: String(r.assigned_to ?? ""),
      client: "",
    });
  for (const r of data.opportunities ?? [])
    if (!r.archived_at && !["lost", "converted"].includes(String(r.status)))
      result.push({
        id: r.id,
        table: "opportunities",
        row: r,
        title: String(r.name),
        subtitle:
          options.channel[String(r.source_channel)] +
          " • " +
          options.opportunity[String(r.status)],
        date: dayOf(r.next_follow_up_at) || (r.status === "new" ? today() : ""),
        group: "Comercial",
        done: false,
        assigned: String(r.responsible_user_id ?? ""),
        client: String(r.author_id ?? r.publisher_id ?? ""),
      });
  for (const r of data.payments ?? []) {
    const c = campaign(r.campaign_id);
    result.push({
      id: r.id,
      table: "payments",
      row: r,
      title: String(r.description),
      subtitle: money(String(r.amount)) + " • " + String(c?.name ?? ""),
      date: dayOf(r.due_date),
      group: "Financeiro",
      done: r.status !== "pending",
      assigned: String(c?.responsible_user_id ?? ""),
      client: String(c?.author_id ?? c?.publisher_id ?? ""),
    });
  }
  for (const table of ["collective_reading_slots", "book_club_slots"])
    for (const r of data[table] ?? []) {
      const book = data.books?.find((b) => b.id === r.book_id);
      if (!["available", "planning", "cancelled"].includes(String(r.status)))
        result.push({
          id: r.id,
          table,
          row: r,
          title:
            table === "book_club_slots"
              ? "Clube presencial"
              : "Leitura coletiva",
          subtitle: String(book?.title ?? "Livro a confirmar"),
          date: r.year + "-" + String(r.month).padStart(2, "0") + "-01",
          group: "Encontros",
          done: r.status === "completed",
          assigned: String(r.responsible_user_id ?? ""),
          client: String(r.author_id ?? r.publisher_id ?? ""),
        });
    }
  return result.sort((a, b) =>
    (a.date || "9999").localeCompare(b.date || "9999"),
  );
}
export function OperationalDashboard({
  data,
  edit,
  prefix,
  onComplete,
}: {
  data: Dataset;
  edit: (table: string, row?: Partial<Row>) => void;
  prefix: string;
  onComplete: (table: string, row: Row) => void;
}) {
  const now = today(),
    events = eventsFor(data),
    pending = events.filter((e) => !e.done);
  const openDates = (data.service_occurrences ?? []).filter(
    (occurrence) =>
      occurrence.status === "pending" &&
      occurrence.schedule_status === "to_confirm",
  );
  const opp = data.opportunities ?? [],
    payments = data.payments ?? [];
  const overdue = payments.filter(
    (p) => p.status === "pending" && String(p.due_date) < now,
  );
  const sum = (rows: Row[]) => rows.reduce((s, r) => s + Number(r.amount), 0);
  const cards = [
    {
      label: "Novas oportunidades",
      value: String(
        opp.filter((o) => o.status === "new" && !o.archived_at).length,
      ),
      note: "Aguardando primeiro atendimento",
      icon: MessageCircle,
      tone: "purple",
      link: "oportunidades",
    },
    {
      label: "Follow-ups",
      value: String(
        opp.filter(
          (o) =>
            dayOf(o.next_follow_up_at) === now &&
            !["lost", "converted"].includes(String(o.status)),
        ).length,
      ),
      note: "Retornos para hoje",
      icon: Clock,
      tone: "orange",
      link: "oportunidades",
    },
    {
      label: "Serviços hoje",
      value: String(
        pending.filter((e) => e.group === "Produção" && e.date === now).length,
      ),
      note:
        pending.filter((e) => e.group === "Produção" && e.date && e.date < now)
          .length + " atrasados",
      icon: CalendarDays,
      tone: "purple",
      link: "agenda",
    },
    {
      label: "Datas a confirmar",
      value: String(openDates.length),
      note: "Serviços que ainda dependem de agendamento",
      icon: Clock,
      tone: "orange",
      link: "execucoes",
    },
    {
      label: "A receber",
      value: money(sum(payments.filter((p) => p.status === "pending"))),
      note: "Em cobranças pendentes",
      icon: Wallet,
      tone: "orange",
      link: "financeiro",
    },
    {
      label: "Recebido no mês",
      value: money(
        sum(
          payments.filter(
            (p) =>
              p.status === "paid" &&
              dayOf(p.paid_at).startsWith(now.slice(0, 7)),
          ),
        ),
      ),
      note: "Recebimentos confirmados",
      icon: CheckCircle2,
      tone: "green",
      link: "financeiro",
    },
    {
      label: "Pagamentos atrasados",
      value: money(sum(overdue)),
      note: overdue.length + " cobranças para acompanhar",
      icon: Clock,
      tone: "red",
      link: "financeiro",
    },
  ];
  const upcoming = pending.filter((e) => e.date > now).slice(0, 5);
  const availableMonth = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(
      Number(now.slice(0, 4)),
      Number(now.slice(5, 7)) - 1 + i,
      1,
    );
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }).find(
    (m) =>
      !(data.collective_reading_slots ?? []).some(
        (r) =>
          Number(r.year) === m.year &&
          Number(r.month) === m.month &&
          !["available", "cancelled"].includes(String(r.status)),
      ),
  );
  const club = (data.book_club_slots ?? [])
    .filter(
      (r) =>
        r.year + "-" + String(r.month).padStart(2, "0") >= now.slice(0, 7) &&
        r.status !== "cancelled",
    )
    .sort(
      (a, b) =>
        Number(a.year) * 12 +
        Number(a.month) -
        (Number(b.year) * 12 + Number(b.month)),
    )[0];
  return (
    <>
      <div className="page-header">
        <div>
          <span className="eyebrow">
            {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "full",
              timeZone: "America/Sao_Paulo",
            }).format(new Date())}
          </span>
          <h1>Visão geral</h1>
        </div>
        <button className="button" onClick={() => edit("opportunities")}>
          <Plus size={17} /> Nova oportunidade
        </button>
      </div>
      <div className="dashboard-stats">
        {cards.map((c) => (
          <Link
            className={"stat-card " + c.tone}
            href={prefix + "/" + c.link}
            key={c.label}
          >
            <div className="stat-top">
              <span>{c.label}</span>
              <c.icon size={17} />
            </div>
            <strong>{c.value}</strong>
            <small>{c.note}</small>
          </Link>
        ))}
      </div>
      <div className="dashboard-columns">
        <div>
          <section className="panel today-panel">
            <div className="section-heading">
              <div>
                <h2>Pendências</h2>
              </div>
              <span className="pill">
                {pending.filter((e) => e.date && e.date <= now).length +
                  openDates.length}{" "}
                pendências
              </span>
            </div>
            <div className="today-groups">
              {["Comercial", "Produção", "Financeiro", "Tarefas"].map(
                (group) => {
                  const entries = pending.filter(
                    (e) => e.group === group && e.date && e.date <= now,
                  );
                  return (
                    <div className="today-group" key={group}>
                      <h3>
                        <span className={"group-dot " + group} />
                        {group}
                        <small>{entries.length}</small>
                      </h3>
                      {entries.length ? (
                        entries.slice(0, 8).map((e) => (
                          <div className="event-row" key={e.id}>
                            <div>
                              <Link
                                href={
                                  prefix +
                                  "/" +
                                  moduleByTable(e.table)!.route +
                                  "/" +
                                  e.id
                                }
                              >
                                {e.title}
                              </Link>
                              <small>{e.subtitle}</small>
                            </div>
                            {e.date < now ? (
                              <StatusBadge value="overdue" />
                            ) : null}
                            {["tasks", "service_occurrences"].includes(
                              e.table,
                            ) ? (
                              <button
                                className="complete-button"
                                aria-label={"Concluir " + e.title}
                                onClick={() => onComplete(e.table, e.row)}
                              >
                                <CheckCircle2 size={19} />
                              </button>
                            ) : (
                              <button
                                className="icon-button"
                                aria-label={"Abrir " + e.title}
                                onClick={() => edit(e.table, e.row)}
                              >
                                <ArrowUpRight size={16} />
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="quiet-empty">
                          <CheckCircle2 size={15} /> Nenhuma pendência.
                        </p>
                      )}
                    </div>
                  );
                },
              )}
            </div>
            {openDates.length ? (
              <div className="today-group open-date-group">
                <h3>
                  <span className="group-dot Produção" />
                  Datas a confirmar
                  <small>{openDates.length}</small>
                </h3>
                {openDates.slice(0, 8).map((occurrence) => {
                  const service = data.campaign_services?.find(
                    (item) => item.id === occurrence.campaign_service_id,
                  );
                  const camp = data.campaigns?.find(
                    (item) => item.id === service?.campaign_id,
                  );
                  const type = data.service_types?.find(
                    (item) => item.id === service?.service_type_id,
                  );
                  const title =
                    String(service?.custom_name || type?.name || "Serviço") +
                    " • " +
                    occurrence.sequence_number +
                    "/" +
                    (service?.quantity ?? "?");
                  return (
                    <div className="event-row" key={occurrence.id}>
                      <div>
                        <Link href={prefix + "/execucoes/" + occurrence.id}>
                          {title}
                        </Link>
                        <small>{String(camp?.name ?? "Campanha")}</small>
                      </div>
                      <span className="badge warning">Data em aberto</span>
                      <button
                        className="icon-button"
                        aria-label={"Definir data de " + title}
                        onClick={() => edit("service_occurrences", occurrence)}
                      >
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>Oportunidades em andamento</h2>
              <Link href={prefix + "/oportunidades"}>
                Ver oportunidades <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="pipeline-summary">
              <div>
                <strong>
                  {opp.filter((o) => o.status === "waiting_book_data").length}
                </strong>
                <span>Aguardando dados do livro</span>
              </div>
              <div>
                <strong>
                  {
                    opp.filter((o) =>
                      ["proposal_sent", "negotiating"].includes(
                        String(o.status),
                      ),
                    ).length
                  }
                </strong>
                <span>Propostas em andamento</span>
              </div>
            </div>
          </section>
        </div>
        <aside>
          <section className="panel quick-actions">
            <h2>Novo cadastro</h2>
            {[
              ["authors", "Autora"],
              ["campaigns", "Campanha"],
              ["payments", "Pagamento"],
              ["tasks", "Tarefa"],
            ].map(([t, l]) => (
              <button key={t} onClick={() => edit(t)}>
                <span>
                  <Plus size={16} />
                  {l}
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>Próximos compromissos</h2>
              <CalendarDays size={17} />
            </div>
            {upcoming.length ? (
              upcoming.map((e) => (
                <div className="upcoming-row" key={e.id}>
                  <span className="date-square">
                    {e.date.slice(8, 10)}
                    <small>{e.date.slice(5, 7)}</small>
                  </span>
                  <div>
                    <strong>{e.title}</strong>
                    <small>{e.subtitle}</small>
                  </div>
                </div>
              ))
            ) : (
              <div className="aside-empty">
                <p>Nenhum compromisso agendado.</p>
              </div>
            )}
          </section>
          <Link className="feature-card" href={prefix + "/leitura-coletiva"}>
            <BookOpen size={22} />
            <span>LEITURA COLETIVA</span>
            <h3>
              {availableMonth
                ? options.month[String(availableMonth.month)] +
                  " " +
                  availableMonth.year
                : "Agenda preenchida"}
            </h3>
            <p>
              Próximo mês disponível <ArrowUpRight size={15} />
            </p>
          </Link>
          <Link
            className="feature-card club"
            href={prefix + "/clube-presencial"}
          >
            <span>CLUBE PRESENCIAL</span>
            <h3>
              {club
                ? options.month[String(club.month)] + " " + club.year
                : "Nenhum encontro agendado"}
            </h3>
            <p>
              {club
                ? options.club[String(club.status)]
                : "Defina o livro, a editora e a data."}
            </p>
          </Link>
        </aside>
      </div>
    </>
  );
}
export function UnifiedAgenda({
  data,
  edit,
}: {
  data: Dataset;
  edit: (table: string, row?: Partial<Row>) => void;
}) {
  const [range, setRange] = useState("7"),
    [kind, setKind] = useState(""),
    [assigned, setAssigned] = useState(""),
    [client, setClient] = useState("");
  const now = today();
  const end = new Date(now + "T12:00:00");
  end.setDate(end.getDate() + Number(range));
  const through = end.toISOString().slice(0, 10);
  const rows = eventsFor(data).filter(
    (e) =>
      (range === "all" || !e.done) &&
      (range === "all" || range === "late"
        ? range === "all" || (!!e.date && e.date < now)
        : range === "today"
          ? e.date === now
          : e.date >= now && e.date <= through) &&
      (!kind || e.group === kind) &&
      (!assigned || e.assigned === assigned) &&
      (!client || e.client === client),
  );
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Agenda</h1>
          <p>Comercial, produção, encontros e finanças no mesmo lugar.</p>
        </div>
      </div>
      <div className="tabs">
        {[
          ["today", "Hoje"],
          ["7", "7 dias"],
          ["30", "30 dias"],
          ["late", "Atrasados"],
          ["all", "Todos"],
        ].map(([v, l]) => (
          <button
            className={range === v ? "selected" : ""}
            key={v}
            onClick={() => setRange(v)}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="list-toolbar">
        <select
          aria-label="Tipo"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">Todos os tipos</option>
          {["Comercial", "Produção", "Financeiro", "Tarefas", "Encontros"].map(
            (v) => (
              <option key={v}>{v}</option>
            ),
          )}
        </select>
        <select
          aria-label="Responsável"
          value={assigned}
          onChange={(e) => setAssigned(e.target.value)}
        >
          <option value="">Todas as responsáveis</option>
          {data.profiles?.map((p) => (
            <option key={p.id} value={p.id}>
              {String(p.full_name || p.email)}
            </option>
          ))}
        </select>
        <select
          aria-label="Cliente"
          value={client}
          onChange={(e) => setClient(e.target.value)}
        >
          <option value="">Todos os clientes</option>
          {[...(data.authors ?? []), ...(data.publishers ?? [])].map((p) => (
            <option key={p.id} value={p.id}>
              {String(p.name)}
            </option>
          ))}
        </select>
      </div>
      <section className="panel">
        {rows.length ? (
          rows.map((e) => (
            <div className="event-row" key={e.id}>
              <span className="agenda-date">{date(e.date || null)}</span>
              <div className="grow">
                <strong>{e.title}</strong>
                <small>{e.subtitle}</small>
              </div>
              <span className="badge">{e.group}</span>
              <StatusBadge
                value={
                  e.done
                    ? "completed"
                    : e.date && e.date < now
                      ? "overdue"
                      : "pending"
                }
              />
              <button
                className="small-button"
                onClick={() => edit(e.table, e.row)}
              >
                Abrir
              </button>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Inbox size={28} />
            <h3>Nenhuma atividade neste período</h3>
            <p>Novos compromissos aparecerão aqui automaticamente.</p>
          </div>
        )}
      </section>
    </>
  );
}
