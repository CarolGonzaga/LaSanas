import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Workbench } from "@/components/workbench";
import { modules } from "@/lib/modules";
export default async function Preview({
  params,
}: {
  params: Promise<{ segments?: string[] }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { segments } = await params;
  const data = Object.fromEntries(modules.map((m) => [m.table, []]));
  return (
    <AppShell email="" workspace="Seu negócio literário" data={data} preview>
      <Workbench
        key={segments?.join("/") ?? "dashboard"}
        route={segments?.[0] ?? "dashboard"}
        id={segments?.[1]}
        data={data}
        workspace={null}
        email=""
        userId=""
        readOnly
      />
    </AppShell>
  );
}
