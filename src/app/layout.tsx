import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import { DISCLAIMER } from "@/domain/types/enums";
import { AuthStatus } from "@/components/auth-status";
import { AdminNavLink } from "@/components/admin-nav-link";
import { TeamNavLink } from "@/components/team-nav-link";
import { PwaRegister } from "@/components/pwa-register";

import { BuildVersionGuard } from "@/components/build-version-guard";
import { PrimaryNav } from "@/components/primary-nav";
import { GlobalAmbientEngine } from "@/components/global-ambient-engine";
import { AiAssistantWidget } from "@/components/ai-assistant-widget";
import { TrialStatusBanner } from "@/components/trial-status-banner";
import { createClient } from "@/lib/supabase/server";
import { getLenderAccessInfo } from "@/lib/session";
import { SITE_URL, SITE_NAME, OG_IMAGE_PATH } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
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
  // Sitewide default OpenGraph — every public page's own metadata (see
  // src/lib/seo.ts's pageMetadata) overrides title/description/url with its
  // own copy; this is just the fallback for anything that doesn't.
  openGraph: {
    title: "NON-QM Nexus",
    description: "AI-assisted NON-QM scenario analysis and lender-matching decision-support platform.",
    url: SITE_URL,
    siteName: SITE_NAME,
    images: [{ url: `${SITE_URL}${OG_IMAGE_PATH}` }],
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#060606",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = user ? await getLenderAccessInfo() : null;

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-surface-bg text-ink-primary">
        <PwaRegister />
        <BuildVersionGuard />
        <GlobalAmbientEngine />
        {access ? <TrialStatusBanner isTrial={access.isTrial} trialExpiresAt={access.trialExpiresAt} currentTierLevel={access.tierLevel} /> : null}
        <header className="relative z-40 gold-theme gold-glass sticky top-0 text-white">
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
              <TeamNavLink />
              <AdminNavLink />
              <AuthStatus />
            </div>
          </div>
        </header>
        <main className="relative z-10 flex-1 mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
        <footer className="relative z-10 border-t-2 border-black bg-white">
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
        {user && <AiAssistantWidget />}
      </body>
    </html>
  );
}
