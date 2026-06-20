import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Table2, LogOut, Users, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard, end: true },
  { to: "/activities", label: "Activités", icon: Table2 },
  { to: "/users", label: "Utilisateurs", icon: Users, adminOrSuperviseurOnly: true },
];

const roleLabel: Record<string, string> = {
  admin: "Administrateur",
  superviseur: "Superviseur",
  operateur: "Consultant",
};

export const AppLayout = () => {
  const { user, signOut, isAdmin, isSuperviseur, roles } = useAuth();
  const nav = useNavigate();

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar desktop ── */}
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-60 flex-col bg-[hsl(var(--sidebar-background))] md:flex">

        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-5 border-b border-[hsl(var(--sidebar-border))]">
          <div className="flex items-center gap-2.5">
            {/* Logomark Amaris-style : carré bleu + lettre */}
            <div className="flex h-8 w-8 items-center justify-center rounded gradient-primary shadow-glow shrink-0">
              <span className="text-[16px]">📡</span>
            </div>
            <div className="leading-none">
              <p className="text-[15px] font-extrabold text-white tracking-wide">FTTH</p>
              <p className="text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--sidebar-foreground)/0.45)] mt-0.5">
                Suivi opérationnel
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-0.5">
          <p className="px-3 mb-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--sidebar-foreground)/0.35)]">
            Navigation
          </p>
          {navItems
            .filter((i) => (i.adminOrSuperviseurOnly ? isAdmin || isSuperviseur : true))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                    isActive
                      ? "bg-[hsl(var(--sidebar-primary)/0.15)] text-white border border-[hsl(var(--sidebar-primary)/0.25)]"
                      : "text-[hsl(var(--sidebar-foreground)/0.65)] hover:bg-[hsl(var(--sidebar-accent))] hover:text-white border border-transparent"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-[hsl(var(--sidebar-primary))]" : "text-[hsl(var(--sidebar-foreground)/0.50)]")} />
                    <span className="flex-1">{item.label}</span>
                    {isActive && <ChevronRight className="h-3 w-3 text-[hsl(var(--sidebar-primary))]" />}
                  </>
                )}
              </NavLink>
            ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-[hsl(var(--sidebar-border))] p-4">
          <div className="mb-3 flex items-center gap-2.5 min-w-0">
            {/* Avatar initiales */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full gradient-primary text-[11px] font-bold text-white">
              {(user?.email?.[0] ?? "?").toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-[hsl(var(--sidebar-foreground))] truncate">{user?.email}</p>
              <p className="text-[10px] text-[hsl(var(--sidebar-foreground)/0.45)]">
                {roleLabel[roles[0]] ?? roles[0] ?? "—"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-start text-[12px] text-[hsl(var(--sidebar-foreground)/0.55)] hover:bg-[hsl(var(--sidebar-accent))] hover:text-white h-8"
            onClick={async () => { await signOut(); nav("/auth"); }}
          >
            <LogOut className="mr-2 h-3.5 w-3.5" /> Déconnexion
          </Button>
        </div>
      </aside>

      {/* ── Mobile header ── */}
      <header className="fixed top-0 left-0 right-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded gradient-primary shadow-glow">
            <span className="text-[16px]">📡</span>
          </div>
          <span className="text-[15px] font-extrabold tracking-wide">FTTH</span>
        </div>
        <Button size="sm" variant="ghost" onClick={async () => { await signOut(); nav("/auth"); }}>
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-3 border-t border-border bg-card md:hidden">
        {navItems.filter((i) => !i.adminOrSuperviseurOnly).slice(0, 3).map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}
            className={({ isActive }) => cn(
              "flex flex-col items-center gap-0.5 py-2 text-[10px]",
              isActive ? "text-primary" : "text-muted-foreground"
            )}>
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 md:ml-60 pt-14 pb-16 md:pt-0 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
};
