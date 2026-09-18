import { options } from "@/lib/modules";
export function StatusBadge({ value }: { value: unknown }) {
  const v = String(value ?? "");
  const label =
    Object.values(options)
      .map((o) => o[v])
      .find(Boolean) ?? v;
  const tone = [
    "completed",
    "paid",
    "confirmed",
    "confirmed_human",
    "replaced",
  ].includes(v)
    ? "success"
    : ["lost", "confirmed_ai", "overdue"].includes(v)
      ? "danger"
      : [
            "pending",
            "waiting_book_data",
            "awaiting_payment",
            "reserved",
            "publisher_contact_pending",
          ].includes(v)
        ? "warning"
        : v === "active" || v === "approved"
          ? "primary"
          : "";
  return (
    <span className={"badge " + tone}>
      {v === "overdue" ? "Atrasado" : label}
    </span>
  );
}
