import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, Lock, Mail } from "lucide-react";
import "./globals.css";
import "./light-theme.css";
import { DISCLAIMER } from "@/domain/types/enums";
import { AuthStatus } from "@/components/auth-status";
import { AdminNavLink } from "@/components/admin-nav-link";
import { TeamNavLink } from "@/components/team-nav-link";
import { PwaRegister } from "@/components/pwa-register";

import { BuildVersionGuard } from "@/components/build-version-guard";
import { PrimaryNav } from "@/components/primary-nav";
import { GlobalAmbientEngine } from "@/components/global-ambient-engine";
import { AiAssistantWidget } from "@/components/ai-assistant-widget";
import { ThemeToggle, THEME_STORAGE_KEY } from "@/components/theme-toggle";
import { TrialStatusBanner } from "@/components/trial-status-banner";
import { createClient } from "@/lib/supabase/server";
import { getLenderAccessInfo } from "@/lib/session";
import { SITE_URL, SITE_NAME, OG_IMAGE_PATH } from "@/lib/seo";
import { SUPPORT_EMAIL } from "@/lib/support";

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
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#060606",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = user ? await getLenderAccessInfo() : null;

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* No-flash theme script: applies the persisted theme to <html> before
            first paint so a light-mode user never sees a dark flash. Reads
            localStorage directly (the authoritative client store). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=document.documentElement;if(t==="light"||t==="dark"){d.setAttribute("data-theme",t);}else{d.setAttribute("data-theme","dark");}}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col bg-surface-bg text-ink-primary">
        <PwaRegister />
        <BuildVersionGuard />
        <GlobalAmbientEngine />
        {access ? <TrialStatusBanner isTrial={access.isTrial} trialExpiresAt={access.trialExpiresAt} currentTierLevel={access.tierLevel} /> : null}
        <header className="premium-site-header relative z-40 gold-theme gold-glass sticky top-0 text-white">
          <div className="premium-header-inner mx-auto grid max-w-[1500px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 px-3 py-2.5 sm:gap-x-4 sm:px-6 sm:py-3 xl:flex xl:flex-wrap">
            <Link href="/" className="premium-wordmark flex shrink-0 items-center gap-2.5 text-lg font-semibold tracking-tight">
              <Image src="/logo.png" alt="NON-QM Nexus" width={38} height={38} className="rounded-full ring-1 ring-amber-400/40" priority />
              <span>
                NON-QM <span className="gold-text-gradient font-bold">Nexus</span>
              </span>
            </Link>
            <div className="order-3 col-span-2 flex w-full justify-start xl:order-none xl:w-auto xl:flex-1 xl:justify-center">
              <PrimaryNav />
            </div>
            <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
              <ThemeToggle />
              <TeamNavLink />
              <AdminNavLink />
              <AuthStatus />
            </div>
          </div>
        </header>
        <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-4 sm:py-6">{children}</main>
        <footer className="relative z-10 border-t border-amber-500/20 gold-theme gold-glass">
          <div className="mx-auto max-w-7xl px-4 py-6 text-xs text-slate-400 space-y-5">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-400/40 bg-black/40 text-amber-400"
                >
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <p className="pt-1.5 leading-relaxed">{DISCLAIMER}</p>
              </div>
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-400/40 bg-black/40 text-amber-400"
                >
                  <Lock className="h-4 w-4" />
                </span>
                <p className="pt-1.5 leading-relaxed">
                  This platform is an underwriting-assistance and research tool; it does not issue loan approvals,
                  credit decisions, or commitments to lend. Lender program data is maintained by NON-QM Nexus
                  administrators and is subject to change without notice — always confirm current guidelines directly
                  with the lender before advising a client.
                </p>
              </div>
            </div>

            <div className="border-t border-amber-500/15" />

            <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/terms" className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 hover:underline">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                Terms of Service
              </Link>
              <Link href="/privacy" className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 hover:underline">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Privacy Policy
              </Link>
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-amber-400" aria-hidden />
                Support:{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-amber-400 hover:text-amber-300 hover:underline">
                  {SUPPORT_EMAIL}
                </a>
              </span>
            </nav>
          </div>
        </footer>
        {user && <AiAssistantWidget />}
      </body>
    </html>
  );
}
