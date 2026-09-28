import type { Row } from "@/lib/modules";
import type { Dataset } from "@/lib/workspace";
import { compareExecutionOrder, createOccurrenceLabels } from "@/lib/opportunity-service-presentation";

export type WorkItem = { id: string; source: "tasks" | "service_occurrences"; row: Row; title: string; subtitle: string; dueDate: string; dueTime: string; assignedTo: string; status: string; priority: string; opportunityId: string; opportunityServiceId: string; authorId: string; authorName: string; bookId: string; bookTitle: string; paymentPlan: string; paymentMethod: string; paymentStatus: string; totalValue: number; scheduleStatus: string; released: boolean; billingCycle: number | null };
const dayOf = (value: unknown) => String(value ?? "").slice(0, 10);
export function buildWorkItems(data: Dataset): WorkItem[] {
  const labels = createOccurrenceLabels(data);
  const services = new Map((data.opportunity_services ?? []).map(item => [item.id, item]));
  const opportunities = new Map((data.opportunities ?? []).map(item => [item.id, item]));
  const books = new Map((data.books ?? []).map(item => [item.id, item]));
  const authors = new Map((data.authors ?? []).map(item => [item.id, item]));
  const paidByService = new Map<string, Row[]>();
  for (const payment of data.payments ?? []) {
    if (payment.status !== "paid") continue;
    const key = String(payment.opportunity_service_id);
    const entries = paidByService.get(key) ?? [];
    entries.push(payment);
    paidByService.set(key, entries);
  }
  for (const entries of paidByService.values()) entries.sort((a,b) => Number(a.billing_cycle) - Number(b.billing_cycle));
  return [
    ...(data.service_occurrences ?? []).map((occurrence) => {
      const service = services.get(String(occurrence.opportunity_service_id));
      const opportunity = opportunities.get(String(service?.opportunity_id));
      const book = books.get(String(opportunity?.book_id));
      const author = authors.get(String(opportunity?.author_id ?? book?.author_id));
      const payments = paidByService.get(String(service?.id)) ?? [];
      const paid = service?.payment_terms === "monthly_full"
        ? payments.slice(Number(occurrence.billing_cycle) - 1, Number(occurrence.billing_cycle))
        : payments;
      return { id: occurrence.id, source: "service_occurrences" as const, row: occurrence, title: labels.get(occurrence.id) ?? "Serviço", subtitle: [book?.title, author?.name].filter(Boolean).join(" · ") || String(opportunity?.name ?? "Oportunidade"), dueDate: dayOf(occurrence.scheduled_date), dueTime: String(occurrence.scheduled_time ?? ""), assignedTo: String(occurrence.assigned_to ?? ""), status: String(occurrence.status), priority: "medium", opportunityId: String(opportunity?.id ?? ""), opportunityServiceId: String(service?.id ?? ""), authorId: String(author?.id ?? ""), authorName: String(author?.name ?? ""), bookId: String(book?.id ?? ""), bookTitle: String(book?.title ?? ""), paymentPlan: String(service?.payment_terms ?? ""), paymentMethod: String(paid[0]?.payment_method ?? ""), paymentStatus: paid.length ? "paid" : "pending", totalValue: Number(service?.unit_price ?? 0) * Number(service?.item_kind === "package" ? service?.duration_months ?? 1 : service?.quantity ?? 1), scheduleStatus: String(occurrence.schedule_status ?? "to_confirm"), released: !!occurrence.released_at, billingCycle: occurrence.billing_cycle ? Number(occurrence.billing_cycle) : null };
    }),
    ...(data.tasks ?? []).map((task) => ({ id: task.id, source: "tasks" as const, row: task, title: String(task.title), subtitle: "Tarefa interna", dueDate: dayOf(task.due_date), dueTime: String(task.due_time ?? ""), assignedTo: String(task.assigned_to ?? ""), status: String(task.status), priority: String(task.priority ?? "medium"), opportunityId: String(task.related_opportunity_id ?? ""), opportunityServiceId: "", authorId: "", authorName: "", bookId: "", bookTitle: "", paymentPlan: "", paymentMethod: "", paymentStatus: "", totalValue: 0, scheduleStatus: "scheduled", released: true, billingCycle: null })),
  ].sort((a, b) => compareExecutionOrder(a.row, b.row));
}
export function getTodayWorkItems(data: Dataset, userId: string, currentDay: string) {
  return selectTodayWorkItems(buildWorkItems(data), userId, currentDay);
}

export function selectTodayWorkItems(items: WorkItem[], userId: string, currentDay: string, statusOverrides: Record<string, string> = {}) {
  const status = (item: WorkItem) => statusOverrides[item.id] ?? item.status;
  const groupKey = (item: WorkItem) => item.source === "tasks" ? "internal-tasks" : item.bookId || item.opportunityServiceId;
  const eligible = items.filter((item) => item.assignedTo === userId && item.released);
  const openDue = (item: WorkItem) => !["completed", "cancelled"].includes(status(item)) && !!item.dueDate && item.dueDate <= currentDay;
  const activeGroups = new Set(eligible.filter(openDue).map(groupKey));
  return eligible.filter((item) => activeGroups.has(groupKey(item)) && (
    openDue(item) || (status(item) === "completed" && dayOf(item.row.completed_at) === currentDay)
  )).sort((a, b) => compareExecutionOrder(a.row, b.row));
}

export function selectFutureWorkItems(items: WorkItem[], userId: string, currentDay: string, statusOverrides: Record<string, string> = {}) {
  const status = (item: WorkItem) => statusOverrides[item.id] ?? item.status;
  const groupKey = (item: WorkItem) => item.bookId || item.opportunityServiceId;
  const eligible = items.filter((item) => item.source === "service_occurrences" && item.assignedTo === userId && item.released);
  const future = (item: WorkItem) => !!item.dueDate && item.dueDate > currentDay && item.scheduleStatus === "scheduled" && !["completed", "cancelled"].includes(status(item));
  const futureGroups = new Set(eligible.filter(future).map(groupKey));
  return eligible.filter((item) => futureGroups.has(groupKey(item)) && (
    future(item) || ["completed", "cancelled"].includes(status(item))
  )).sort((a, b) => compareExecutionOrder(a.row, b.row));
}
