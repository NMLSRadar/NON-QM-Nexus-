"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Command,
  CreditCard,
  Building2,
  Users,
  Tags,
  Settings2,
  Menu,
  X,
} from "lucide-react";

type NavItem = { href: string; label: string };
type NavGroup = { id: string; title: string; icon: typeof Users; items: NavItem[] };

/** Admin navigation, grouped and alphabetized, with collapsible sections.
 * The whole panel collapses too (master toggle). Active page is highlighted. */
const GROUPS: NavGroup[] = [
  {
    id: "overview",
    title: "Overview",
    icon: Command,
    items: [
      { href: "/admin", label: "Overview" },
      { href: "/admin/scenario-volume", label: "Scenario Volume" },
    ],
  },
  {
    id: "revenue",
    title: "Membership & Billing",
    icon: CreditCard,
    items: [
      { href: "/admin/billing", label: "Billing & Retention" },
      { href: "/admin/bulk-memberships", label: "Bulk Memberships" },
      { href: "/admin/discounts", label: "Discounts" },
      { href: "/admin/memberships", label: "Membership Management" },
      { href: "/admin/plans", label: "Plans" },
      { href: "/admin/teams", label: "Team Subscriptions" },
    ],
  },
  {
    id: "lenders",
    title: "Lenders & Programs",
    icon: Building2,
    items: [
      { href: "/admin/monitoring", label: "Guideline Monitoring" },
      { href: "/admin/specialists", label: "ITIN / FN Specialists" },
      { href: "/admin/lenders", label: "Lender Tiers" },
    ],
  },
  {
    id: "users",
    title: "Users & Access",
    icon: Users,
    items: [
      { href: "/admin/activity", label: "Active Users & Beta Testers" },
      { href: "/admin/trials", label: "Trial Access Management" },
      { href: "/admin/users", label: "Users" },
    ],
  },
  {
    id: "sales",
    title: "Sales & Attribution",
    icon: Tags,
    items: [
      { href: "/admin/demo-requests", label: "Demo Requests" },
      { href: "/admin/attribution", label: "Signup Attribution" },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    icon: Settings2,
    items: [
      { href: "/admin/documents", label: "Documents" },
      { href: "/admin/system-health", label: "System Health" },
    ],
  },
];

function groupForPath(pathname: string): string {
  for (const g of GROUPS) {
    if (g.items.some((i) => i.href === pathname)) return g.id;
  }
  return "overview";
}

export function AdminNav() {
  const pathname = usePathname();
  const activeGroup = useMemo(() => groupForPath(pathname), [pathname]);

  // Master collapse. When collapsing, remember which group was active so it can be restored.
  const [collapsed, setCollapsed] = useState(false);
  // Group accordion state: default open only for the group holding the current page.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GROUPS.map((g) => [g.id, g.id === groupForPath(pathname)]))
  );

  const toggleGroup = (id: string) =>
    setOpenGroups((o) => ({ ...o, [id]: !o[id] }));

  if (collapsed) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-[#0a0a0b]">
        <div className="gold-ambient" />
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="relative z-10 flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-300 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          title="Expand admin navigation"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-300">
            <Menu className="h-4 w-4" aria-hidden />
          </span>
          <span className="font-medium">Admin menu</span>
          <ChevronRight className="ml-auto h-4 w-4 text-slate-500" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-b from-[#0c0c0e] to-[#0a0a0b] shadow-lg shadow-black/40">
      <div className="gold-ambient" />
      <div className="relative z-10 p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight text-white">Admin</h1>
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300">
              {GROUPS.length} sections
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 px-2.5 py-1 text-xs text-slate-400 transition-colors hover:border-amber-400/60 hover:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Collapse
          </button>
        </div>

        <nav aria-label="Admin" className="space-y-3">
          {GROUPS.map((group) => {
            const open = !!openGroups[group.id];
            const isActive = group.id === activeGroup;
            return (
              <div
                key={group.id}
                className={`overflow-hidden rounded-xl border transition-colors ${
                  isActive
                    ? "border-amber-400/40 bg-amber-500/[0.07]"
                    : "border-white/[0.06] bg-white/[0.015]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-white/[0.03] focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      isActive
                        ? "border-amber-400/50 bg-amber-500/15 text-amber-200"
                        : "border-white/10 bg-black/30 text-slate-400"
                    }`}
                  >
                    <group.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className={isActive ? "text-amber-100" : "text-slate-200"}>{group.title}</span>
                  <span
                    className={`ml-auto text-[10px] font-medium tabular-nums ${
                      isActive ? "text-amber-300/80" : "text-slate-500"
                    }`}
                  >
                    {group.items.length}
                  </span>
                  {open ? (
                    <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden />
                  )}
                </button>

                {open ? (
                  <ul className="space-y-0.5 border-t border-white/[0.05] px-2 py-2">
                    {group.items.map((item) => {
                      const isCurrent = pathname === item.href;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={isCurrent ? "page" : undefined}
                            className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                              isCurrent
                                ? "bg-gradient-to-r from-amber-500/20 to-transparent font-semibold text-amber-100"
                                : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
                            }`}
                          >
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </nav>
      </div>
    </div>
  );
}