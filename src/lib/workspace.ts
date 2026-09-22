import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { modules, type Row } from "@/lib/modules";

export const getContext = cache(async function getContext() {
  const db = await createClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: memberships, error: membershipError } = await db
    .from("workspace_members")
    .select(
      "workspace_id,role,home_view,workspaces(name,default_production_user_id)",
    )
    .eq("user_id", user.id)
    .eq("active", true);
  if (membershipError)
    return {
      db,
      user,
      workspace: null,
      error: "O banco ainda precisa receber as migrations da atualização.",
      memberships: [],
    };
  const preferred = (await cookies()).get("workspace")?.value;
  const membership =
    memberships?.find((m) => m.workspace_id === preferred) ?? memberships?.[0];
  return {
    db,
    user,
    workspace: membership
      ? {
          id: String(membership.workspace_id),
          role: String(membership.role),
          defaultProductionUserId:
            (
              membership.workspaces as unknown as {
                default_production_user_id?: string | null;
              }
            )?.default_production_user_id ?? null,
          // A home é uma regra do workspace, não uma decisão baseada em e-mail
          // nem uma preferência isolada de cada componente.
          homeView:
            (
              membership.workspaces as unknown as {
                default_production_user_id?: string | null;
              }
            )?.default_production_user_id === user.id
              ? "production"
              : "management",
          name: String(
            (membership.workspaces as unknown as { name: string })?.name ??
              "Meu negócio",
          ),
        }
      : null,
    error: membership
      ? null
      : "Sua conta ainda não está vinculada a um workspace.",
    memberships: memberships ?? [],
  };
});
export async function requireContext() {
  const c = await getContext();
  if (!c.workspace) throw new Error(c.error ?? "Workspace indisponível.");
  return { ...c, workspace: c.workspace };
}
export type Dataset = Record<string, Row[]>;
export async function loadWorkspace() {
  const ctx = await getContext();
  if (!ctx.workspace)
    return {
      workspace: null,
      email: ctx.user.email ?? "",
      data: {} as Dataset,
      error: ctx.error,
      userId: ctx.user.id,
    };
  const [results, membersResult, updatesResult] = await Promise.all([
    Promise.all(
      modules.map(async (m) => {
        const rows: Row[] = [];
        let from = 0;
        while (true) {
          const { data, error } = await ctx.db
            .from(m.table)
            .select("*")
            .eq("workspace_id", ctx.workspace!.id)
            .order("created_at", { ascending: false })
            .order("id")
            .range(from, from + 999);
          if (error)
            throw new Error(
              "Não foi possível carregar " + m.title + ". " + error.message,
            );
          rows.push(...(data as Row[]));
          if (data.length < 1000) break;
          from += 1000;
        }
        return [m.table, rows] as const;
      }),
    ),
    ctx.db
      .from("workspace_members")
      .select(
        "user_id,role,active,home_view,profiles(id,full_name,email,username,avatar_url)",
      )
      .eq("workspace_id", ctx.workspace.id),
    ctx.db
      .from("production_updates")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .eq("recipient_user_id", ctx.user.id)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  const { data: members, error } = membersResult;
  if (error) throw new Error(error.message);
  const team = (members ?? []).map((m) => ({
    ...(m.profiles as unknown as Row),
    workspace_id: ctx.workspace!.id,
    role: m.role,
    active: m.active,
    home_view: m.home_view,
  }));
  const choices = ctx.memberships.map((m) => ({
    id: String(m.workspace_id),
    workspace_id: String(m.workspace_id),
    name: String(
      (m.workspaces as unknown as { name: string })?.name ?? "Workspace",
    ),
  }));
  const dataset = {
    ...Object.fromEntries(results),
    profiles: team,
    workspace_choices: choices,
    workspace_settings: ctx.workspace
      ? [
          {
            id: ctx.workspace.id,
            workspace_id: ctx.workspace.id,
            default_production_user_id:
              ctx.workspace.defaultProductionUserId ?? null,
          },
        ]
      : [],
  } as Dataset;
  const { data: productionUpdates } = updatesResult;
  dataset.production_updates = (productionUpdates ?? []) as Row[];
  const avatars = (dataset.profiles ?? []).filter(
    (profile) =>
      profile.avatar_url && !/^https?:\/\//i.test(String(profile.avatar_url)),
  );
  const imageRequests: Promise<void>[] = [];
  if (avatars.length)
    imageRequests.push(
      (async () => {
        const { data: signed } = await ctx.db.storage
          .from("business-assets")
          .createSignedUrls(
            avatars.map((profile) => String(profile.avatar_url)),
            600,
          );
        signed?.forEach((url, index) => {
          if (url.signedUrl) avatars[index].avatar_preview_url = url.signedUrl;
        });
      })(),
    );
  for (const table of ["books", "client_assets"]) {
    for (const bucket of ["business-assets", "client-assets"]) {
      const images = dataset[table].filter(
        (r) =>
          (table === "books" || r.asset_type === "image") &&
          (r.cover_storage_path || r.storage_path) &&
          String(r.storage_bucket ?? "business-assets") === bucket,
      );
      if (!images.length) continue;
      imageRequests.push(
        (async () => {
          const { data: signed } = await ctx.db.storage
            .from(bucket)
            .createSignedUrls(
              images.map((r) => String(r.cover_storage_path ?? r.storage_path)),
              600,
            );
          signed?.forEach((url, i) => {
            if (url.signedUrl) images[i].preview_url = url.signedUrl;
          });
        })(),
      );
    }
  }
  await Promise.all(imageRequests);
  return {
    workspace: ctx.workspace,
    email: ctx.user.email ?? "",
    userId: ctx.user.id,
    data: dataset,
    error: null,
  };
}
