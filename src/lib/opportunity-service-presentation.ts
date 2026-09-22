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
