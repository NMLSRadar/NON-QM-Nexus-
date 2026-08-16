"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ChevronRight,
  Command,
  CreditCard,
  FileText,
  Inbox,
  Menu,
  Percent,
  Search,
  Settings2,
  ShieldCheck,
  Tags,
  Users,
  Wallet,
  X,
} from "lucide-react";

type NavItem = { href: string; label: string };
type NavGroup = { id: string; title: string; icon: typeof Command; items: NavItem[] };

/** Grouped source of truth (used for icons + a stable route registry).
 * The rendered list below is the FLAT, strictly alphabetical view of every
 * item — one list, A→Z, so any admin can find anything by reading down
 * the alphabet. */
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

/** Every section, flattened, strictly alphabetical by label. */
const ALL_ITEMS: Array<NavItem & { icon: typeof Command }> = GROUPS.flatMap((g) =>
  g.items.map((item) => ({ ...item, icon: g.icon }))
).sort((a, b) => a.label.localeCompare(b.label));

/** Which section the current route is in (for the breadcrumb highlight). */
function findGroup(pathname: string): NavGroup | null {
  for (const g of GROUPS) if (g.items.some((i) => i.href === pathname)) return g;
  return null;
}

const ICON_LOOKUP: Record<string, typeof Command> = {
  "/admin": Command,
  "/admin/scenario-volume": BarChart3,
  "/admin/demo-requests": CalendarDays,
  "/admin/billing": CreditCard,
  "/admin/bulk-memberships": Users,
  "/admin/discounts": Percent,
  "/admin/memberships": Wallet,
  "/admin/plans": CreditCard,
  "/admin/teams": Users,
  "/admin/monitoring": FileText,
  "/admin/specialists": ShieldCheck,
  "/admin/lenders": Building2,
  "/admin/activity": BarChart3,
  "/admin/trials": ShieldCheck,
  "/admin/users": Users,
  "/admin/attribution": Tags,
  "/admin/documents": FileText,
  "/admin/system-health": Settings2,
};

export function AdminNav() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");

  const lowered = query.trim().toLowerCase();
  const items = useMemo(
    () => (lowered ? ALL_ITEMS.filter((i) => i.label.toLowerCase().includes(lowered)) : ALL_ITEMS),
    [lowered]
  );

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
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight text-white">Admin</h1>
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300">
              {ALL_ITEMS.length} sections · A–Z
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 px-2.5 py-1 text-xs text-slate-400 transition-colors hover:border-amber-400/60 hover:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Collapse
            </button>
          </div>
        </div>

        {/* Find anything — type to filter the full alphabetical list */}
        <div className="relative mb-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            placeholder="Find an admin section… (e.g. Demo, Plans, Users)"
            aria-label="Search admin sections"
            className="w-full rounded-lg border border-amber-500/20 bg-black/40 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 transition-colors focus:border-amber-400/60 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
          />
        </div>

        <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">
          {items.length} of {ALL_ITEMS.length} sections
        </p>
<nav aria-label="Admin" className="grid gap-1">
          {items.map((item) => {
            const isCurrent = pathname === item.href;
            const Icon = ICON_LOOKUP[item.href] ?? Inbox;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isCurrent
                    ? "bg-gradient-to-r from-amber-500/25 to-transparent font-semibold text-amber-100"
                    : "text-slate-300 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    isCurrent
                      ? "border-amber-400/50 bg-amber-500/15 text-amber-200"
                      : "border-white/10 bg-black/30 text-slate-400"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="min-w-0 truncate">{item.label}</span>
                {isCurrent ? (
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-amber-300" aria-hidden />
                ) : null}
              </Link>
            );
          })}
          {items.length === 0 ? (
            <p className="rounded-lg border border-white/5 px-3 py-4 text-sm text-slate-500">
              No admin section matches “{query}”.
            </p>
          ) : null}
        </nav>

        {findGroup(pathname) ? (
          <p className="mt-3 border-t border-white/5 pt-2 text-xs text-slate-500">
            You&apos;re in: <span className="text-amber-200/90">{findGroup(pathname)?.title}</span>
          </p>
        ) : (
          <p className="mt-3 border-t border-white/5 pt-2 text-xs text-slate-500">
            All sections, alphabetized A–Z for quick finding.
          </p>
        )}
      </div>
    </div>
  );
}