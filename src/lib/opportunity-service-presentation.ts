import type { Row } from "@/lib/modules";
import type { Dataset } from "@/lib/workspace";

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

export function occurrenceLabel(occurrence: Row, data: Dataset) {
  const name = String(
    data.service_types?.find((item) => item.id === occurrence.service_type_id)
      ?.name ?? "Serviço",
  );
  const matching = (data.service_occurrences ?? [])
    .filter(
      (item) =>
        item.opportunity_service_id === occurrence.opportunity_service_id &&
        item.service_type_id === occurrence.service_type_id,
    )
    .sort((a, b) => Number(a.sequence_number) - Number(b.sequence_number));
  const service = data.opportunity_services?.find(
    (item) => item.id === occurrence.opportunity_service_id,
  );
  const month = Number(occurrence.billing_cycle);
  const duration = Number(service?.duration_months);
  if (service?.item_kind === "package" && month > 0 && duration > 0) {
    // Count each service within its month: sequence_number also includes the
    // other services in the package. The denominator covers the whole contract,
    // even when the caller only has the occurrences of one billing cycle.
    const byMonth = new Map<number, Row[]>();
    for (const item of matching) {
      const cycle = Number(item.billing_cycle);
      byMonth.set(cycle, [...(byMonth.get(cycle) ?? []), item]);
    }
    const currentMonth = byMonth.get(month) ?? [];
    const monthlyQuantity = Math.max(1, ...Array.from(byMonth.values(), (items) => items.length));
    const monthlyPosition = currentMonth.findIndex((item) => item.id === occurrence.id) + 1;
    const position = (month - 1) * monthlyQuantity + Math.max(1, monthlyPosition);
    const total = Math.max(matching.length, monthlyQuantity * duration);
    return `${name} ${position}/${total} · Mês ${month}`;
  }
  if (matching.length < 2) return name;
  const position = matching.findIndex((item) => item.id === occurrence.id) + 1;
  return `${name} ${position > 0 ? position : 1}/${matching.length}`;
}
