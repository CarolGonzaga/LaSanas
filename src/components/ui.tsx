import { cn } from "@/lib/utils";
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}
export function StatCard({
  label,
  value,
  tone = "purple",
}: {
  label: string;
  value: string | number;
  tone?: "purple" | "orange" | "green" | "red";
}) {
  return (
    <section className={cn("stat", tone)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}
export function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <p>{title}</p>
      {children}
    </div>
  );
}
