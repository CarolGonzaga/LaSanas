import { Suspense } from "react";
import { loadWorkspace } from "@/lib/workspace";
import { WorkspaceProvider } from "@/components/workspace-provider";
import Loading from "./loading";

async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const result = await loadWorkspace();
  return (
    <WorkspaceProvider
      key={`${result.userId}:${result.workspace?.id ?? ""}`}
      value={result}
      loadedAt={result.loadedAt}
    >
      {children}
    </WorkspaceProvider>
  );
}

export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<Loading />}>
      <WorkspaceLayout>{children}</WorkspaceLayout>
    </Suspense>
  );
}
