import type { WorkItem } from "@/lib/work-items";

export function calendarDays(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const last = new Date(Date.UTC(year, monthNumber, 0));
  const count = Math.ceil((first.getUTCDay() + last.getUTCDate()) / 7) * 7;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, monthNumber - 1, 1 - first.getUTCDay() + index));
    return date.toISOString().slice(0, 10);
  });
}

export function calendarExecutions(items: WorkItem[], userId: string) {
  const days = new Map<string, WorkItem[]>();
  for (const item of items) {
    if (item.source !== "service_occurrences" || item.assignedTo !== userId || !item.released || !item.dueDate) continue;
    days.set(item.dueDate, [...(days.get(item.dueDate) ?? []), item]);
  }
  for (const entries of days.values()) entries.sort((a, b) => a.dueTime.localeCompare(b.dueTime) || Number(a.row.sequence_number) - Number(b.row.sequence_number));
  return days;
}
