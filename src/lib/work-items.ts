import type { Row } from "@/lib/modules";
import type { Dataset } from "@/lib/workspace";

export type WorkItem = { id: string; source: "tasks" | "service_occurrences"; row: Row; title: string; subtitle: string; dueDate: string; dueTime: string; assignedTo: string; status: string; priority: string; campaignId: string; campaignStatus: string; campaignServiceId: string; authorId: string; authorName: string; bookId: string; bookTitle: string; paymentPlan: string; paymentMethod: string; paymentStatus: string; totalValue: number; scheduleStatus: string; released: boolean };
const dayOf = (value: unknown) => String(value ?? "").slice(0, 10);
export function buildWorkItems(data: Dataset): WorkItem[] {
  return [
    ...(data.service_occurrences ?? []).map((occurrence) => {
      const service = data.campaign_services?.find((item) => item.id === occurrence.campaign_service_id);
      const campaign = data.campaigns?.find((item) => item.id === service?.campaign_id);
      const contract = data.campaign_contract_items?.find((item) => item.id === service?.campaign_contract_item_id);
      const type = data.service_types?.find((item) => item.id === service?.service_type_id);
      const book = data.books?.find((item) => item.id === (service?.book_id ?? campaign?.book_id));
      const author = data.authors?.find((item) => item.id === (campaign?.author_id ?? book?.author_id));
      const payment = (data.payments ?? []).filter((item) => item.campaign_contract_item_id === contract?.id && item.status === "paid").sort((a, b) => Number(a.installment_number) - Number(b.installment_number))[0];
      return { id: occurrence.id, source: "service_occurrences" as const, row: occurrence, title: String(service?.custom_name || type?.name || "Serviço"), subtitle: [book?.title, author?.name].filter(Boolean).join(" · ") || String(campaign?.name ?? "Campanha"), dueDate: dayOf(occurrence.scheduled_date), dueTime: String(occurrence.scheduled_time ?? ""), assignedTo: String(occurrence.assigned_to ?? service?.assigned_to ?? campaign?.responsible_user_id ?? ""), status: String(occurrence.status), priority: String(occurrence.priority ?? service?.default_priority ?? "medium"), campaignId: String(campaign?.id ?? ""), campaignStatus: String(campaign?.status ?? ""), campaignServiceId: String(service?.id ?? ""), authorId: String(author?.id ?? ""), authorName: String(author?.name ?? ""), bookId: String(book?.id ?? ""), bookTitle: String(book?.title ?? ""), paymentPlan: String(contract?.payment_terms ?? ""), paymentMethod: String(payment?.payment_method ?? ""), paymentStatus: String(payment?.status ?? ""), totalValue: Number(contract?.contract_total ?? 0), scheduleStatus: String(occurrence.schedule_status ?? "to_confirm"), released: !!occurrence.released_at };
    }),
    ...(data.tasks ?? []).map((task) => ({ id: task.id, source: "tasks" as const, row: task, title: String(task.title), subtitle: "Tarefa interna", dueDate: dayOf(task.due_date), dueTime: String(task.due_time ?? ""), assignedTo: String(task.assigned_to ?? ""), status: String(task.status), priority: String(task.priority ?? "medium"), campaignId: "", campaignStatus: "", campaignServiceId: "", authorId: "", authorName: "", bookId: "", bookTitle: "", paymentPlan: "", paymentMethod: "", paymentStatus: "", totalValue: 0, scheduleStatus: "scheduled", released: true })),
  ];
}
export function getTodayWorkItems(data: Dataset, userId: string, currentDay: string) {
  return buildWorkItems(data).filter((item) => item.assignedTo === userId && item.released && ((item.status === "completed" && dayOf(item.row.completed_at) === currentDay) || (!["completed", "cancelled"].includes(item.status) && !!item.dueDate && item.dueDate <= currentDay))).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.dueTime.localeCompare(b.dueTime));
}
