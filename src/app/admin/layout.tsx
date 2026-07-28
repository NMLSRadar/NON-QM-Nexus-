import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/admin";

const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/plans", label: "Plans" },
  { href: "/admin/lenders", label: "Lender Tiers" },
  { href: "/admin/specialists", label: "ITIN / FN Specialists" },
  { href: "/admin/documents", label: "Documents" },
  { href: "/admin/monitoring", label: "Guideline Monitoring" },
  { href: "/admin/discounts", label: "Discounts" },
  { href: "/admin/users", label: "Users" },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-6 min-h-[60vh]">
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-[#0a0a0b] p-5 sm:p-6">
        <div className="gold-ambient" />
        <div className="relative z-10">
          <h1 className="text-xl font-semibold text-white">Admin</h1>
          <nav aria-label="Admin" className="mt-3 flex flex-wrap gap-x-1 gap-y-2 text-sm">
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-amber-500/20 px-3 py-1.5 text-slate-300 hover:text-white hover:border-amber-400/60 hover:bg-amber-500/10 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
