"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Handshake,
  Feather,
  Building2,
  BookOpen,
  CalendarDays,
  Wallet,
  CheckSquare,
  CheckCircle2,
  MessageSquare,
  Settings,
  LogOut,
  Search,
  Menu,
  ArrowUpRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { modules, primaryModules, labelOf, memberLabel } from "@/lib/modules";
import type { Dataset } from "@/lib/workspace";
import { toast } from "sonner";
import { selectWorkspace } from "@/actions/business";
const groups = [
  { label: "", links: [["dashboard", "Visão geral", LayoutDashboard]] },
  {
    label: "COMERCIAL",
    links: [
      ["oportunidades", "Oportunidades", Handshake],
      ["autoras", "Autoras", Feather],
      ["editoras", "Editoras", Building2],
      ["livros", "Livros", BookOpen],
    ],
  },
  {
    label: "OPERAÇÃO",
    links: [
      ["agenda", "Agenda", CalendarDays],
      ["tarefas", "Tarefas", CheckSquare],
      ["leitura-coletiva", "Leitura coletiva", BookOpen],
      ["clube-presencial", "Clube presencial", Users],
    ],
  },
  {
    label: "GESTÃO",
    links: [
      ["financeiro", "Financeiro", Wallet],
      ["respostas", "Respostas", MessageSquare],
      ["configuracoes", "Configurações", Settings],
    ],
  },
] as const;
export function AppShell({
  children,
  email,
  data = {},
  preview = false,
  homeView = "management",
  userId,
}: {
  children: React.ReactNode;
  email: string;
  workspace?: string;
  data?: Dataset;
  preview?: boolean;
  homeView?: string;
  userId?: string;
}) {
  const path = usePathname(),
    router = useRouter();
  const [open, setOpen] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [query, setQuery] = useState("");
  const prefix = preview ? "/preview" : "";
  const navigationGroups =
    homeView === "production"
      ? ([
          {
            label: "PRINCIPAL",
            links: [
              ["dashboard", "Meu dia", LayoutDashboard],
              ["agenda", "Agenda", CalendarDays],
              ["finalizados", "Finalizados", CheckCircle2],
              ["configuracoes", "Configurações", Settings],
            ],
          },
        ] as const)
      : groups;
  const currentProfile = data.profiles?.find(
    (profile) => profile.id === userId,
  );
  const avatarUrl = String(
    currentProfile?.avatar_preview_url ?? currentProfile?.avatar_url ?? "",
  );
  const avatarInitial = (
    currentProfile ? memberLabel(currentProfile) : email || "L"
  )
    .slice(0, 1)
    .toUpperCase();
  const results = useMemo(
    () =>
      searchOpen
        ? primaryModules
            .flatMap((table) =>
              (data[table] ?? [])
                .filter((r) =>
                  JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
                )
                .map((row) => ({ table, row })),
            )
            .slice(0, 30)
        : [],
    [data, query, searchOpen],
  );
  async function logout() {
    const { error } = await createClient().auth.signOut();
    if (error) {
      toast.error("Não foi possível sair.");
      return;
    }
    router.replace("/login");
    router.refresh();
  }
  const sidebar = (
    <>
      <Link className="brand" href={prefix + "/dashboard"}>
        <Image
          className="brand-logo"
          src="/lasanas-logo.png"
          alt="LaSanas"
          width={44}
          height={44}
          unoptimized
          priority
        />
        <span>LaSanas</span>
      </Link>
      {(data.workspace_choices?.length ?? 0) > 1 && (
        <div className="workspace-chip">
          <select
            aria-label="Workspace"
            value={data.profiles?.[0]?.workspace_id ?? ""}
            onChange={async (e) => {
              const result = await selectWorkspace(e.target.value);
              if (result.ok) router.refresh();
              else toast.error(result.message);
            }}
          >
            {data.workspace_choices.map((w) => (
              <option key={w.id} value={w.id}>
                {String(w.name)}
              </option>
            ))}
          </select>
        </div>
      )}
      <nav>
        {navigationGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            {group.label && <p>{group.label}</p>}
            {group.links.map(([route, label, Icon]) => (
              <Link
                key={route}
                className={
                  "nav-link " +
                  (path === prefix + "/" + route ||
                  (route === "dashboard" && path === "/preview") ||
                  path.startsWith(prefix + "/" + route + "/")
                    ? "nav-active"
                    : "")
                }
                href={prefix + "/" + route}
                onClick={() => setOpen(false)}
              >
                <Icon size={17} />
                <span>
                  {route === "dashboard" && homeView === "production"
                    ? "Meu dia"
                    : label}
                </span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <span
          className={"avatar" + (avatarUrl ? " has-image" : "")}
          style={
            avatarUrl ? { backgroundImage: `url("${avatarUrl}")` } : undefined
          }
        >
          {!avatarUrl && avatarInitial}
        </span>
        <div>
          <strong>
            {currentProfile
              ? memberLabel(currentProfile)
              : email?.split("@")[0] || "Prévia local"}
          </strong>
          <small>{preview ? "Modo de demonstração" : email}</small>
        </div>
        {!preview && (
          <button className="icon-button" onClick={logout} aria-label="Sair">
            <LogOut size={16} />
          </button>
        )}
      </div>
    </>
  );
  return (
    <div className="app-root">
      <aside className="sidebar desktop-sidebar">{sidebar}</aside>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Navegação" description="Áreas do seu negócio.">
          <div className="mobile-navigation">{sidebar}</div>
        </DialogContent>
      </Dialog>
      <main className="main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumb">
            <strong>
              {path.includes("dashboard") || path === "/preview"
                ? homeView === "production"
                  ? "Meu dia"
                  : "Visão geral"
                : (modules.find((m) => path.includes("/" + m.route))?.title ??
                  "Configurações")}
            </strong>
          </div>
          <div className="topbar-actions">
            <button
              aria-label="Buscar no workspace"
              className="global-search"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={16} />
              <span>Buscar no workspace</span>
            </button>
            <ThemeToggle />
            <span
              className={
                "avatar small-avatar" + (avatarUrl ? " has-image" : "")
              }
              style={
                avatarUrl
                  ? { backgroundImage: `url("${avatarUrl}")` }
                  : undefined
              }
            >
              {!avatarUrl && avatarInitial}
            </span>
          </div>
        </header>
        {children}
      </main>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent
          title="Buscar no workspace"
          description="Autoras, editoras, livros, campanhas e oportunidades."
        >
          <div className="search-input">
            <Search size={18} />
            <input
              autoFocus
              placeholder="Buscar por nome ou título"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="search-results">
            {query ? (
              results.length ? (
                results.map(({ table, row }) => (
                  <Link
                    key={table + row.id}
                    href={
                      prefix +
                      "/" +
                      modules.find((m) => m.table === table)!.route +
                      "/" +
                      row.id
                    }
                    onClick={() => setSearchOpen(false)}
                  >
                    <span>
                      <strong>{labelOf(row, table)}</strong>
                      <small>
                        {modules.find((m) => m.table === table)!.title}
                      </small>
                    </span>
                    <ArrowUpRight size={17} />
                  </Link>
                ))
              ) : (
                <p className="quiet-empty">Nenhum resultado encontrado.</p>
              )
            ) : (
              <p className="quiet-empty">Digite para pesquisar.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
