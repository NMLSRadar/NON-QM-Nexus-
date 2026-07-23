import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { DISCLAIMER } from "@/domain/types/enums";

export const metadata: Metadata = {
  title: "NON-QM Navigator",
  description:
    "AI-assisted NON-QM scenario analysis and lender-matching decision-support platform (demonstration build).",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/scenarios/new", label: "New Scenario" },
  { href: "/scenarios/voice", label: "Voice Scenario" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/lenders", label: "Lenders" },
  { href: "/programs", label: "Programs" },
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="bg-brand-900 text-white">
          <div className="mx-auto max-w-7xl px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              NON-QM <span className="text-brand-100">Navigator</span>
            </Link>
            <nav aria-label="Primary" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="text-brand-100 hover:text-white focus:outline-none focus:ring-2 focus:ring-white rounded px-1">
                  {item.label}
                </Link>
              ))}
            </nav>
            <span className="ml-auto text-xs bg-amber-400 text-amber-950 font-medium rounded px-2 py-1">
              Demo environment — sample data only
            </span>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-slate-500 space-y-1">
            <p>{DISCLAIMER}</p>
            <p>
              All lenders and programs shown in this demonstration build are fictional sample data — not real lender
              guidelines. This platform is an underwriting-assistance and research tool; it does not issue loan
              approvals, credit decisions, or commitments to lend.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
