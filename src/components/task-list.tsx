"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Circle, CheckCircle2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveRecord, businessAction } from "@/actions/business";
import { memberLabel, type Row } from "@/lib/modules";
import type { Dataset } from "@/lib/workspace";
import { StatusBadge } from "./status-badge";
import { today, date } from "@/lib/format";

export function TaskList({
  data,
  userId,
  edit,
  readOnly,
  onDelete,
}: {
  data: Dataset;
  userId: string;
  edit: (table: string, row?: Partial<Row>) => void;
  readOnly: boolean;
  onDelete: (row: Row) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [view, setView] = useState("open");
  const [query, setQuery] = useState("");
  const [assigned, setAssigned] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(today());
  const now = today();
  const rows = (data.tasks ?? [])
    .filter(
      (row) =>
        !row.archived_at &&
        (!assigned || row.assigned_to === assigned) &&
        `${row.title} ${row.description ?? ""}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()) &&
        (view === "completed"
          ? row.status === "completed"
          : view === "all"
            ? true
            : !["completed", "cancelled"].includes(String(row.status)) &&
              (view === "today"
                ? row.due_date === now
                : view === "important"
                  ? row.priority === "high"
                  : view === "planned"
                    ? !!row.due_date
                    : true)),
    )
    .sort(
      (a, b) =>
        String(a.due_date ?? "9999").localeCompare(
          String(b.due_date ?? "9999"),
        ) ||
        String(a.due_time ?? "").localeCompare(String(b.due_time ?? "")) ||
        String(a.title).localeCompare(String(b.title)),
    );
  function update(row: Row, kind: "status" | "priority") {
    if (readOnly) return;
    start(async () => {
      const result =
        kind === "status"
          ? await businessAction("complete-task", row.id, {
              undo: row.status === "completed" ? "true" : "false",
            })
          : await businessAction("task-priority", row.id, {
              priority: row.priority === "high" ? "medium" : "high",
            });
      if (!result.ok) toast.error(result.message);
      else router.refresh();
    });
  }
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Tarefas</h1>
          <p>Organize o dia, destaque prioridades e acompanhe as conclusões.</p>
        </div>
        <button className="button" onClick={() => edit("tasks")}>
          Nova tarefa com detalhes
        </button>
      </div>
      <div className="tabs">
        {[
          ["open", "A fazer"],
          ["today", "Hoje"],
          ["important", "Importantes"],
          ["planned", "Planejadas"],
          ["completed", "Concluídas"],
          ["all", "Todas"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={view === value ? "selected" : ""}
            onClick={() => setView(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="task-quick-add"
        onSubmit={(event) => {
          event.preventDefault();
          if (readOnly || !title.trim()) return;
          start(async () => {
            const result = await saveRecord("tasks", null, {
              title: title.trim(),
              due_date: due,
              priority: "medium",
              status: "pending",
              assigned_to: userId,
            });
            if (!result.ok) toast.error(result.message);
            else {
              setTitle("");
              router.refresh();
            }
          });
        }}
      >
        <input
          aria-label="Nova tarefa"
          placeholder="Adicionar uma tarefa"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <input
          aria-label="Data da nova tarefa"
          type="date"
          required
          value={due}
          onChange={(event) => setDue(event.target.value)}
        />
        <button className="button" disabled={pending || readOnly}>
          Adicionar
        </button>
      </form>
      <div className="task-quick-add">
        <input
          aria-label="Buscar tarefas"
          placeholder="Buscar tarefas"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="Filtrar responsável"
          value={assigned}
          onChange={(event) => setAssigned(event.target.value)}
        >
          <option value="">Todas as responsáveis</option>
          {(data.profiles ?? []).map((row) => (
            <option key={row.id} value={row.id}>
              {memberLabel(row)}
            </option>
          ))}
        </select>
      </div>
      <div className="record-list">
        {rows.map((row) => (
          <article className="task-list-row" key={row.id}>
            <button
              className="icon-button"
              aria-label={`${row.status === "completed" ? "Reabrir" : "Concluir"} ${row.title}`}
              disabled={pending || readOnly || row.status === "cancelled"}
              onClick={() => update(row, "status")}
            >
              {row.status === "completed" ? (
                <CheckCircle2 size={21} />
              ) : (
                <Circle size={21} />
              )}
            </button>
            <button
              className="task-list-detail"
              onClick={() => edit("tasks", row)}
            >
              <strong
                style={{
                  textDecoration: ["completed", "cancelled"].includes(
                    String(row.status),
                  )
                    ? "line-through"
                    : undefined,
                }}
              >
                {String(row.title)}
              </strong>
              <small>
                {date(String(row.due_date))}
                {row.due_time
                  ? ` · ${String(row.due_time).slice(0, 5)}`
                  : ""} ·{" "}
                {memberLabel(
                  data.profiles?.find(
                    (profile) => profile.id === row.assigned_to,
                  ),
                )}
                {String(row.due_date) < now &&
                !["completed", "cancelled"].includes(String(row.status))
                  ? " · Atrasada"
                  : ""}
              </small>
            </button>
            <StatusBadge value={String(row.status)} />
            <button
              className="icon-button"
              aria-label={`Excluir ${row.title}`}
              disabled={pending || readOnly}
              onClick={() => onDelete(row)}
            >
              <Trash2 size={17} />
            </button>
            <button
              className="icon-button"
              aria-label={`Importante: ${row.title}`}
              aria-pressed={row.priority === "high"}
              disabled={pending || readOnly}
              onClick={() => update(row, "priority")}
            >
              <Star
                size={20}
                fill={row.priority === "high" ? "currentColor" : "none"}
              />
            </button>
          </article>
        ))}
      </div>
      {!rows.length && (
        <p className="quiet-empty">Nenhuma tarefa nesta lista.</p>
      )}
    </>
  );
}
