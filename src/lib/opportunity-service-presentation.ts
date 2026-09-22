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
        item.service_type_id === occurrence.service_type_id &&
        item.billing_cycle === occurrence.billing_cycle,
    )
    .sort((a, b) => Number(a.sequence_number) - Number(b.sequence_number));
  if (matching.length < 2) return name;
  const position = matching.findIndex((item) => item.id === occurrence.id) + 1;
  return `${name} ${position > 0 ? position : 1}/${matching.length}`;
}
