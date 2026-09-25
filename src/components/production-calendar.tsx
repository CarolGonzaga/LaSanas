"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, CircleSlash, ClipboardPen, LoaderCircle } from "lucide-react";
import type { Dataset } from "@/lib/workspace";
import { buildWorkItems, type WorkItem } from "@/lib/work-items";
import { calendarDays, calendarExecutions } from "@/lib/production-calendar";
import { date, today } from "@/lib/format";
import { Dialog, DialogContent } from "./ui/dialog";

const statuses = {
  pending: { label: "Pendente", icon: Circle },
  in_progress: { label: "Em produção", icon: LoaderCircle },
  in_revision: { label: "Em alteração", icon: ClipboardPen },
  completed: { label: "Concluído", icon: CheckCircle2 },
  cancelled: { label: "Cancelado", icon: CircleSlash },
};
export function ProductionCalendar({ data, userId }: { data: Dataset; userId: string }) {
  const currentDay = today();
  const [month, setMonth] = useState(currentDay.slice(0, 7));
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const byDay = useMemo(() => calendarExecutions(buildWorkItems(data), userId), [data, userId]);
  const days = calendarDays(month);
  const title = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  function moveMonth(offset: number) {
    const [year, number] = month.split("-").map(Number);
    setMonth(new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7));
  }
  return <>
    <div className="page-header"><div><h1>Agenda</h1><p>Suas execuções programadas, incluindo concluídas e canceladas.</p></div></div>
    <section className="production-calendar" aria-label="Agenda mensal de execuções">
      <div className="production-calendar-toolbar">
        <h2 aria-live="polite">{title}</h2>
        <div><button className="small-button" onClick={() => setMonth(currentDay.slice(0, 7))}>Hoje</button><button className="icon-button" aria-label="Mês anterior" onClick={() => moveMonth(-1)}><ChevronLeft size={20}/></button><button className="icon-button" aria-label="Próximo mês" onClick={() => moveMonth(1)}><ChevronRight size={20}/></button></div>
      </div>
      <div className="production-calendar-legend">{Object.entries(statuses).map(([key, {label, icon: Icon}]) => <span key={key} className={`calendar-status-${key}`}><Icon size={14} aria-hidden="true"/>{label}</span>)}</div>
      <div className="production-calendar-scroll">
        <div className="production-calendar-weekdays">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(day => <span key={day}>{day}</span>)}</div>
        <div className="production-calendar-grid">
          {days.map(day => {
            const entries = byDay.get(day) ?? [];
            return <section key={day} className={`production-calendar-day${day.startsWith(month) ? "" : " outside-month"}`} aria-label={date(day)}>
              <header><time dateTime={day} aria-current={day === currentDay ? "date" : undefined}>{Number(day.slice(8))}</time>{entries.length > 0 && <small>{entries.length}</small>}</header>
              <div className="production-calendar-entries" tabIndex={entries.length ? 0 : undefined} role="region" aria-label={`Execuções de ${date(day)}`}>
                {entries.map(item => {
                  const {label, icon: Icon} = statuses[item.status as keyof typeof statuses] ?? statuses.pending;
                  return <button key={item.id} className={`production-calendar-entry calendar-status-${item.status}`} onClick={() => setSelected(item)} aria-label={`${label}: ${item.title}, ${item.authorName}, ${item.bookTitle}${item.dueTime ? `, ${item.dueTime.slice(0, 5)}` : ""}`}>
                    <Icon size={13} aria-hidden="true"/><span><strong>{item.dueTime && <time>{item.dueTime.slice(0, 5)} · </time>}{item.title}</strong><small>{item.authorName || "Autora não informada"} · {item.bookTitle || "Livro não informado"}</small></span>
                  </button>;
                })}
              </div>
            </section>;
          })}
        </div>
      </div>
    </section>
    <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}><DialogContent title={selected?.title ?? "Execução"} description="Detalhes da execução programada.">{selected && <dl className="detail-grid"><div><dt>Data</dt><dd>{date(selected.dueDate)} {selected.dueTime.slice(0, 5)}</dd></div><div><dt>Status</dt><dd>{statuses[selected.status as keyof typeof statuses]?.label ?? selected.status}</dd></div><div><dt>Autora</dt><dd>{selected.authorName || "Não informada"}</dd></div><div><dt>Livro</dt><dd>{selected.bookTitle || "Não informado"}</dd></div></dl>}<div className="dialog-actions"><button className="button secondary" onClick={() => setSelected(null)}>Fechar</button></div></DialogContent></Dialog>
  </>;
}
