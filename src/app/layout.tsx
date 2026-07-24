import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import { DISCLAIMER } from "@/domain/types/enums";
import { AuthStatus } from "@/components/auth-status";
import { AdminNavLink } from "@/components/admin-nav-link";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "NON-QM Nexus",
  description:
    "AI-assisted NON-QM scenario analysis and lender-matching decision-support platform (demonstration build).",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "NON-QM Nexus",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/scenarios/new", label: "New Scenario" },
  { href: "/scenarios/voice", label: "Voice Scenario" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/lenders", label: "Lenders" },
  { href: "/programs", label: "Programs" },
  { href: "/pricing", label: "Pricing" },
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-white">
        <PwaRegister />
        <header className="bg-white text-slate-900 border-b-2 border-black">
          <div className="mx-auto max-w-7xl px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
            <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
              <Image src="/logo.png" alt="NON-QM Nexus" width={40} height={40} className="rounded-full" priority />
              <span>
                NON-QM <span className="text-brand-600">Nexus</span>
              </span>
            </Link>
            <nav aria-label="Primary" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-slate-700 hover:text-black focus:outline-none focus:ring-2 focus:ring-brand-600 rounded px-1"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <span className="ml-auto text-xs bg-brand-500 text-black font-medium rounded px-2 py-1 border border-black">
              Demo environment — sample data only
            </span>
            <AdminNavLink />
            <AuthStatus />
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
        <footer className="border-t-2 border-black bg-white">
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
