"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const NAV = [
  { href: "/scenarios/voice", label: "Voice Scenario" },
  { href: "/scenarios/new", label: "New Scenario" },
  { href: "/unique-products", label: "Unique Non-QM Products" },
  { href: "/lenders", label: "Lenders" },
  { href: "/programs", label: "Programs" },
  { href: "/document-checklists", label: "Doc Checklists" },
  { href: "/toolkit", label: "Toolkit" },
  { href: "/tutorial", label: "Tutorial" },
  { href: "/pricing", label: "Pricing" },
  { href: "/account", label: "Account" },
] as const;

function isActive(pathname: string, href: string) {
  const isLenderDetail = href === "/lenders" && pathname.startsWith("/lenders/");
  const isUniqueProductDetail = href === "/unique-products" && pathname.startsWith("/unique-products/");
  return pathname === href || isLenderDetail || isUniqueProductDetail;
}

export function PrimaryNav() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    function closeOnOutsidePress(event: PointerEvent) {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <>
      <nav aria-label="Primary" className="hidden items-center justify-center gap-x-3 whitespace-nowrap text-[12px] xl:flex 2xl:gap-x-5 2xl:text-[13px]">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`premium-nav-link relative rounded-md px-1 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                active ? "text-amber-300" : "text-slate-200 hover:text-amber-200"
              }`}
            >
              {item.label}
              <span aria-hidden className={`premium-nav-underline ${active ? "is-active" : ""}`} />
            </Link>
          );
        })}
      </nav>

      <details
        ref={detailsRef}
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="premium-mobile-nav relative xl:hidden"
      >
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg border border-amber-400/35 bg-black/40 px-3 py-2 text-sm font-medium text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-400">
          <Menu className="h-4 w-4" aria-hidden="true" />
          Menu
        </summary>
        <nav aria-label="Mobile primary" className="premium-mobile-nav-panel">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={active ? "is-active" : ""}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </details>
    </>
  );
}
