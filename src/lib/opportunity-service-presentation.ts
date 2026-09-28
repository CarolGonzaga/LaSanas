import type { Row } from "@/lib/modules";
import type { Dataset } from "@/lib/workspace";

export function compareExecutionOrder(a: Row, b: Row) {
  const aDate = String(a.scheduled_date || a.due_date || "").slice(0, 10);
  const bDate = String(b.scheduled_date || b.due_date || "").slice(0, 10);
  if (aDate !== bDate) {
    if (!aDate) return 1;
    if (!bDate) return -1;
    return aDate.localeCompare(bDate);
  }
  if (aDate) {
    const time = String(a.scheduled_time || a.due_time || "").localeCompare(
      String(b.scheduled_time || b.due_time || ""),
    );
    if (time) return time;
  }
  return Number(a.billing_cycle ?? 0) - Number(b.billing_cycle ?? 0)
    || Number(a.sequence_number ?? 0) - Number(b.sequence_number ?? 0)
    || String(a.id).localeCompare(String(b.id));
}

export function opportunityServiceLabel(service: Row, data: Dataset) {
  if (service.item_kind === "package")
    return String(
      data.service_packages?.find((item) => item.id === service.service_package_id)
        ?.name ?? "Plano mensal",
    );
  return String(
    data.service_types?.find((item) => item.id === service.service_type_id)
      ?.name ?? "Serviço",
  );
}

export function opportunityServiceContext(service: Row, data: Dataset) {
  const opportunity = data.opportunities?.find(
    (item) => item.id === service.opportunity_id,
  );
  const book = data.books?.find((item) => item.id === opportunity?.book_id);
  const author = data.authors?.find(
    (item) => item.id === (opportunity?.author_id ?? book?.author_id),
  );
  return {
    author: String(author?.name ?? "Autora não informada"),
    book: String(book?.title ?? "Livro não informado"),
  };
}

export function createOccurrenceLabels(data: Dataset) {
  const names = new Map((data.service_types ?? []).map(item => [item.id, String(item.name)]));
  const services = new Map((data.opportunity_services ?? []).map(item => [item.id, item]));
  const groups = new Map<string, Row[]>();
  const labels = new Map<string, string>();
  for (const item of data.service_occurrences ?? []) {
    const key = JSON.stringify([item.opportunity_service_id, item.service_type_id]);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.sort((a,b) => Number(a.sequence_number) - Number(b.sequence_number));
    const counts = new Map<number, number>();
    for (const item of group) {
      const month = Number(item.billing_cycle);
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }
    const monthlyQuantity = Math.max(1, ...counts.values());
    const positions = new Map<number, number>();
    group.forEach((item, index) => {
      const name = names.get(String(item.service_type_id)) ?? "Serviço";
      const service = services.get(String(item.opportunity_service_id));
      const month = Number(item.billing_cycle);
      const duration = Number(service?.duration_months);
      const position = (positions.get(month) ?? 0) + 1;
      positions.set(month, position);
      labels.set(item.id, service?.item_kind === "package" && month > 0 && duration > 0
        ? `${name} ${(month - 1) * monthlyQuantity + position}/${Math.max(group.length, monthlyQuantity * duration)} · Mês ${month}`
        : group.length > 1 ? `${name} ${index + 1}/${group.length}` : name);
    });
  }
  return labels;
}

export function occurrenceLabel(occurrence: Row, data: Dataset) {
  return createOccurrenceLabels(data).get(occurrence.id)
    ?? String(data.service_types?.find(item => item.id === occurrence.service_type_id)?.name ?? "Serviço");
}