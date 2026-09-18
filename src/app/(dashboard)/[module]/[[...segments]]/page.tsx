import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { loadWorkspace } from "@/lib/workspace";
import { moduleByRoute } from "@/lib/modules";
import { AppShell } from "@/components/layout/app-shell";
import { Workbench } from "@/components/workbench";
export default async function ModulePage({
  params,
}: {
  params: Promise<{ module: string; segments?: string[] }>;
}) {
  const { module: route, segments } = await params;
  if (route === "clientes") redirect("/campanhas");
  if (
    !moduleByRoute(route) &&
    !["dashboard", "agenda", "configuracoes"].includes(route)
  )
    notFound();
  if (segments && segments.length > 1) notFound();
  const result = await loadWorkspace();
  return (
    <AppShell
      email={result.email}
      workspace={result.workspace?.name}
      data={result.data}
    >
      {result.error ? (
        <div className="page">
          <div className="setup-card">
            <h1>Vamos preparar seu espaço</h1>
            <p>{result.error}</p>
            <p>
              O administrador precisa executar as migrations do projeto e
              vincular sua conta ao workspace. Depois, recarregue esta página.
            </p>
            <Link className="button" href="/dashboard">
              Verificar novamente
            </Link>
          </div>
        </div>
      ) : (
        <Workbench
          key={route + (segments?.[0] ?? "")}
          route={route}
          id={segments?.[0]}
          {...result}
        />
      )}
    </AppShell>
  );
}
