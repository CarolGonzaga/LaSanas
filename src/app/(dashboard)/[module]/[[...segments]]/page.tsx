import { notFound, redirect } from "next/navigation";

import { WorkspacePage } from "@/components/workspace-provider";
import { moduleByRoute } from "@/lib/modules";

export default async function ModulePage({
  params,
}: {
  params: Promise<{ module: string; segments?: string[] }>;
}) {
  const { module: route, segments } = await params;
  if (route === "clientes") redirect("/campanhas");
  if (
    !moduleByRoute(route) &&
    ![
      "dashboard",
      "agenda",
      "configuracoes",
      "finalizados",
      "servicos-contratados",
    ].includes(route)
  )
    notFound();
  if (segments && segments.length > 1) notFound();
  return <WorkspacePage route={route} id={segments?.[0]} />;
}
