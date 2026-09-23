import type { Row } from "@/lib/modules";
import type { Dataset } from "@/lib/workspace";
import { compareExecutionOrder, occurrenceLabel } from "@/lib/opportunity-service-presentation";

export type WorkItem = { id: string; source: "tasks" | "service_occurrences"; row: Row; title: string; subtitle: string; dueDate: string; dueTime: string; assignedTo: string; status: string; priority: string; opportunityId: string; opportunityServiceId: string; authorId: string; authorName: string; bookId: string; bookTitle: string; paymentPlan: string; paymentMethod: string; paymentStatus: string; totalValue: number; scheduleStatus: string; released: boolean; billingCycle: number | null };
const dayOf = (value: unknown) => String(value ?? "").slice(0, 10);
export function buildWorkItems(data: Dataset): WorkItem[] {
  return [
    ...(data.service_occurrences ?? []).map((occurrence) => {
      const service = data.opportunity_services?.find((item) => item.id === occurrence.opportunity_service_id);
      const opportunity = data.opportunities?.find((item) => item.id === service?.opportunity_id);
      const book = data.books?.find((item) => item.id === opportunity?.book_id);
      const author = data.authors?.find((item) => item.id === (opportunity?.author_id ?? book?.author_id));
      const payments = (data.payments ?? []).filter((item) => item.opportunity_service_id === service?.id && item.status === "paid").sort((a, b) => Number(a.billing_cycle) - Number(b.billing_cycle));
      const paid = service?.payment_terms === "monthly_full"
        ? payments.slice(Number(occurrence.billing_cycle) - 1, Number(occurrence.billing_cycle))
        : payments;
      return { id: occurrence.id, source: "service_occurrences" as const, row: occurrence, title: occurrenceLabel(occurrence, data), subtitle: [book?.title, author?.name].filter(Boolean).join(" · ") || String(opportunity?.name ?? "Oportunidade"), dueDate: dayOf(occurrence.scheduled_date), dueTime: String(occurrence.scheduled_time ?? ""), assignedTo: String(occurrence.assigned_to ?? ""), status: String(occurrence.status), priority: "medium", opportunityId: String(opportunity?.id ?? ""), opportunityServiceId: String(service?.id ?? ""), authorId: String(author?.id ?? ""), authorName: String(author?.name ?? ""), bookId: String(book?.id ?? ""), bookTitle: String(book?.title ?? ""), paymentPlan: String(service?.payment_terms ?? ""), paymentMethod: String(paid[0]?.payment_method ?? ""), paymentStatus: paid.length ? "paid" : "pending", totalValue: Number(service?.unit_price ?? 0) * Number(service?.item_kind === "package" ? service?.duration_months ?? 1 : service?.quantity ?? 1), scheduleStatus: String(occurrence.schedule_status ?? "to_confirm"), released: !!occurrence.released_at, billingCycle: occurrence.billing_cycle ? Number(occurrence.billing_cycle) : null };
    }),
    ...(data.tasks ?? []).map((task) => ({ id: task.id, source: "tasks" as const, row: task, title: String(task.title), subtitle: "Tarefa interna", dueDate: dayOf(task.due_date), dueTime: String(task.due_time ?? ""), assignedTo: String(task.assigned_to ?? ""), status: String(task.status), priority: String(task.priority ?? "medium"), opportunityId: String(task.related_opportunity_id ?? ""), opportunityServiceId: "", authorId: "", authorName: "", bookId: "", bookTitle: "", paymentPlan: "", paymentMethod: "", paymentStatus: "", totalValue: 0, scheduleStatus: "scheduled", released: true, billingCycle: null })),
  ].sort((a, b) => compareExecutionOrder(a.row, b.row));
}
export function getTodayWorkItems(data: Dataset, userId: string, currentDay: string) {
  return buildWorkItems(data).filter((item) => item.assignedTo === userId && item.released && ((item.status === "completed" && dayOf(item.row.completed_at) === currentDay) || (!['completed','cancelled'].includes(item.status) && !!item.dueDate && item.dueDate <= currentDay))).sort((a,b) => a.dueDate.localeCompare(b.dueDate) || a.dueTime.localeCompare(b.dueTime));
}
