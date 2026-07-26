"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/scenarios/new", label: "New Scenario" },
  { href: "/scenarios/voice", label: "Voice Scenario" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/lenders", label: "Lenders" },
  { href: "/programs", label: "Programs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/account", label: "Account" },
] as const;

export function PrimaryNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm">
      {NAV.map((item) => {
        const isScenarioDetail = item.href === "/scenarios" && pathname?.startsWith("/scenarios/") && !pathname.startsWith("/scenarios/new") && !pathname.startsWith("/scenarios/voice");
        const isLenderDetail = item.href === "/lenders" && pathname?.startsWith("/lenders/");
        const active = pathname === item.href || isScenarioDetail || isLenderDetail;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative rounded px-1 py-1 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 ${
              active ? "text-amber-300" : "text-slate-300 hover:text-amber-200"
            }`}
          >
            {item.label}
            <span
              aria-hidden
              className={`absolute -bottom-0.5 left-1 right-1 h-px rounded-full transition-opacity ${
                active ? "bg-gradient-to-r from-amber-300 via-amber-400 to-amber-300 opacity-100 shadow-[0_0_6px_1px_rgba(240,200,96,0.6)]" : "opacity-0"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
