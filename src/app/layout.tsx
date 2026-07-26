import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import { DISCLAIMER } from "@/domain/types/enums";
import { AuthStatus } from "@/components/auth-status";
import { AdminNavLink } from "@/components/admin-nav-link";
import { PwaRegister } from "@/components/pwa-register";
import { BuildVersionGuard } from "@/components/build-version-guard";
import { PrimaryNav } from "@/components/primary-nav";

export const metadata: Metadata = {
  title: "NON-QM Nexus",
  description: "AI-assisted NON-QM scenario analysis and lender-matching decision-support platform.",
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
  themeColor: "#060606",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-surface-bg text-ink-primary">
        <PwaRegister />
        <BuildVersionGuard />
        <header className="gold-theme sticky top-0 z-40 bg-[#060606] text-white border-b border-amber-500/20">
          <div className="mx-auto max-w-7xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight shrink-0">
              <Image src="/logo.png" alt="NON-QM Nexus" width={36} height={36} className="rounded-full ring-1 ring-amber-400/40" priority />
              <span>
                NON-QM <span className="gold-text-gradient font-bold">Nexus</span>
              </span>
            </Link>
            <div className="flex-1 flex justify-center min-w-[280px]">
              <PrimaryNav />
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <AdminNavLink />
              <AuthStatus />
            </div>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
        <footer className="border-t-2 border-black bg-white">
          <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-slate-500 space-y-2">
            <p>{DISCLAIMER}</p>
            <p>
              This platform is an underwriting-assistance and research tool; it does not issue loan approvals,
              credit decisions, or commitments to lend. Lender program data is maintained by NON-QM Nexus
              administrators and is subject to change without notice — always confirm current guidelines directly
              with the lender before advising a client.
            </p>
            <nav aria-label="Legal" className="flex gap-4 pt-1">
              <Link href="/terms" className="hover:text-slate-900 hover:underline">
                Terms of Service
              </Link>
              <Link href="/privacy" className="hover:text-slate-900 hover:underline">
                Privacy Policy
              </Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
