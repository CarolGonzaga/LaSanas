"use client";

import { createContext, useContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { loadWorkspace } from "@/lib/workspace";
import { AppShell } from "@/components/layout/app-shell";
import { Workbench } from "@/components/workbench";

type WorkspaceSnapshot = Awaited<ReturnType<typeof loadWorkspace>>;
const WorkspaceContext = createContext<WorkspaceSnapshot | null>(null);

export function WorkspaceProvider({
  value,
  loadedAt,
  children,
}: {
  value: WorkspaceSnapshot;
  loadedAt: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    // Keep other team members' changes and signed images fresh in the
    // background, without refetching the workspace on every navigation.
    let lastAttempt = loadedAt;
    const refreshIfExpired = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastAttempt >= 60_000
      ) {
        lastAttempt = Date.now();
        router.refresh();
      }
    };
    const timer = window.setInterval(refreshIfExpired, 30_000);
    document.addEventListener("visibilitychange", refreshIfExpired);
    window.addEventListener("focus", refreshIfExpired);
    refreshIfExpired();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfExpired);
      window.removeEventListener("focus", refreshIfExpired);
    };
  }, [loadedAt, router]);
  return (
    <WorkspaceContext.Provider value={value}>
      <AppShell
        email={value.email}
        workspace={value.workspace?.name}
        data={value.data}
        homeView={value.workspace?.homeView}
        userId={value.userId}
      >
        {value.error ? (
          <div className="page">
            <div className="setup-card">
              <h1>Vamos preparar seu espaço</h1>
              <p>{value.error}</p>
              <button className="button" onClick={() => router.refresh()}>
                Verificar novamente
              </button>
            </div>
          </div>
        ) : (
          children
        )}
      </AppShell>
    </WorkspaceContext.Provider>
  );
}

export function WorkspacePage({ route, id }: { route: string; id?: string }) {
  const result = useContext(WorkspaceContext);
  if (!result) throw new Error("Workspace indisponível.");
  return (
    <Workbench
      key={route + (id ?? "")}
      route={route}
      id={id}
      {...result}
      homeView={result.workspace?.homeView}
    />
  );
}
