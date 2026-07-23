import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/admin";

const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/plans", label: "Plans" },
  { href: "/admin/lenders", label: "Lender Tiers" },
  { href: "/admin/discounts", label: "Discounts" },
  { href: "/admin/users", label: "Users" },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-3">
        <h1 className="text-xl font-semibold text-slate-900">Admin</h1>
        <nav aria-label="Admin" className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-slate-600 hover:text-slate-900 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-500 rounded px-1"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
