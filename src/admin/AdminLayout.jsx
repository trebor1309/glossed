import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Banknote,
  BookOpenCheck,
  ChevronRight,
  ClipboardList,
  FileWarning,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  ShieldAlert,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useAdminAuth } from "./AdminAuthContext";
import AdminGlobalSearch from "./AdminGlobalSearch";

const navigation = [
  { to: "/", label: "Vue d’ensemble", icon: LayoutDashboard, permission: "admin.access", end: true },
  { to: "/utilisateurs", label: "Utilisateurs", icon: Users, permission: "users.read" },
  { to: "/verifications", label: "Vérifications", icon: BadgeCheck, permission: "verification.read" },
  { to: "/missions", label: "Missions", icon: ClipboardList, permission: "missions.read" },
  { to: "/litiges", label: "Litiges", icon: FileWarning, permission: "disputes.read" },
  { to: "/finance", label: "Finance", icon: Banknote, permission: "finance.read" },
  { to: "/risque", label: "Chargebacks / risque", icon: ShieldAlert, permission: "risk.read" },
  { to: "/incidents", label: "Incidents", icon: AlertTriangle, permission: "incidents.read" },
  { to: "/audit", label: "Audit", icon: BookOpenCheck, permission: "audit.read" },
  { to: "/configuration", label: "Configuration / conformité", icon: Settings2, permission: "configuration.read" },
  { to: "/administrateurs", label: "Administrateurs", icon: UserCog, permission: "administrators.read" },
];

export default function AdminLayout() {
  const { access, session, hasPermission, logout } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const visibleNavigation = navigation.filter((item) => hasPermission(item.permission));

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 text-white lg:hidden">
        <span className="font-bold">Glossed Admin</span>
        <button type="button" aria-label="Ouvrir la navigation" onClick={() => setOpen(true)}><Menu /></button>
      </header>

      {open && <button type="button" aria-label="Fermer la navigation" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-black/50 lg:hidden" />}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-800 bg-slate-950 text-slate-200 transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-20 items-center justify-between border-b border-slate-800 px-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">Glossed</p>
            <p className="text-xl font-bold text-white">Administration</p>
          </div>
          <button type="button" aria-label="Fermer" onClick={() => setOpen(false)} className="lg:hidden"><X /></button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
          {visibleNavigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-rose-600 text-white" : "text-slate-300 hover:bg-slate-900 hover:text-white"}`}>
              <Icon size={18} /><span className="flex-1">{label}</span><ChevronRight size={14} />
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div className="mb-3 rounded-xl bg-slate-900 p-3 text-xs text-slate-400">
            <p className="truncate font-semibold text-slate-200">{access.display_name || session.user.email}</p>
            <p className="mt-1">{(access.roles || []).join(" · ")}</p>
            <p className="mt-2 flex items-center gap-1 text-emerald-400"><Activity size={13} /> MFA active</p>
          </div>
          <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-slate-900 hover:text-white">
            <LogOut size={17} /> Déconnexion
          </button>
        </div>
      </aside>

      <main className="min-w-0 p-4 sm:p-6 lg:ml-72 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6"><AdminGlobalSearch /></div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
