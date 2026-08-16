import { useId } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getPrivateGuidelinesInfo } from "@/domain/privateGuidelines";

/**
 * PRIVATE-GUIDELINES DISCLOSURE KIT (2026-08-16).
 *
 * Renders the "guidelines not publicly published" disclaimer for lenders
 * like UWM and Change Wholesale anywhere they surface:
 *   - <GuidelinesSeal/>            — the signature gold seal artwork (SVG, no
 *                                    image dependency) used as the prominent
 *                                    visual on the banner and inline notices.
 *   - <PrivateGuidelinesBanner/>   — large, prominent dark-gold banner for the
 *                                    lender detail page.
 *   - <PrivateGuidelinesChip/>     — compact chip for directory/card surfaces.
 *   - <PrivateGuidelinesMatchNote/>— light-theme inline notice for scenario
 *                                    best-match / lock / ineligible cards.
 *
 * All components are pure presentational (no "use client" needed): they work
 * in server components and client components alike. Components render
 * nothing when the lender is not in the private-guidelines registry.
 */

/** Signature gold "confidential seal" — shield + keyhole, drawn in code so it
 * scales crisply on every surface and matches the gold/black theme. Gradients
 * get React-unique ids so multiple seals per page never collide. */
export function GuidelinesSeal({ size = 88, className = "" }: { size?: number; className?: string }) {
  const uid = useId();
  const ring = `${uid}-ring`;
  const disc = `${uid}-disc`;
  const shieldG = `${uid}-shield`;
  const notches = [0, 45, 90, 135, 180, 225, 270, 315];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      className={className}
      role="img"
      aria-label="Confidential guidelines seal"
    >
      <defs>
        <radialGradient id={ring} cx="0.5" cy="0.35" r="0.9">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="0.5" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#92400e" />
        </radialGradient>
        <radialGradient id={disc} cx="0.5" cy="0.35" r="0.95">
          <stop offset="0" stopColor="#3f3f46" />
          <stop offset="0.62" stopColor="#18181b" />
          <stop offset="1" stopColor="#09090b" />
        </radialGradient>
        <linearGradient id={shieldG} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fcd34d" />
          <stop offset="0.55" stopColor="#f0b429" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
      </defs>

      {/* outer gold ring */}
      <circle cx="48" cy="48" r="46" stroke={`url(#${ring})`} strokeWidth="2.6" opacity="0.95" />
      {/* notch ticks around the seal */}
      {notches.map((angle) => {
        const rad = ((angle - 90) * Math.PI) / 180;
        const x = 48 + Math.cos(rad) * 42;
        const y = 48 + Math.sin(rad) * 42;
        return <circle key={angle} cx={x} cy={y} r="1.3" fill="#fbbf24" />;
      })}
      {/* inner dark disc */}
      <circle cx="48" cy="48" r="38.5" fill={`url(#${disc})`} stroke="#fbbf24" strokeOpacity="0.35" strokeWidth="1.2" />

      {/* shield */}
      <path
        d="M48 26.5 C56.5 30.5 63 36 64.2 45 C64.8 59 56.5 67.5 48 72 C39.5 67.5 31.2 59 31.8 45 C33 36 39.5 30.5 48 26.5 Z"
        fill={`url(#${shieldG})`}
        stroke="#78350f"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* keyhole */}
      <circle cx="48" cy="45.5" r="6.2" fill="#18181b" />
      <path d="M48 50 L48 56.5" stroke="#18181b" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M45.2 56.5 L50.8 56.5" stroke="#18181b" strokeWidth="2.8" strokeLinecap="round" />
      {/* highlight on shield */}
      <path d="M41.5 38.5 C45 36.5 50 36 54.5 38" stroke="#fff7d6" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />

      {/* sparkles */}
      <path
        d="M23.5 27.5 l1.7 4.2 4.2 1.7 -4.2 1.7 -1.7 4.2 -1.7 -4.2 -4.2 -1.7 4.2 -1.7 Z"
        fill="#fde68a"
      />
      <path d="M72.5 23 l1.25 3.1 3.1 1.25 -3.1 1.25 -1.25 3.1 -1.25 -3.1 -3.1 -1.25 3.1 -1.25 Z" fill="#fbbf24" />
      <path d="M70 64 l1.1 2.7 2.7 1.1 -2.7 1.1 -1.1 2.7 -1.1 -2.7 -2.7 -1.1 2.7 -1.1 Z" fill="#fcd34d" opacity="0.85" />
    </svg>
  );
}

interface NoticeProps {
  lenderName: string;
  /** Place to send the member for current terms. Defaults to the AE anchor. */
  contactHref?: string;
  className?: string;
}

/** PROMINENT, visually rich banner — rendered at the top of a private-
 * guidelines lender's detail page (and available for any future surface
 * that needs the full disclosure). Renders nothing for other lenders. */
export function PrivateGuidelinesNotice({ lenderName, contactHref = "#account-executives", className = "" }: NoticeProps) {
  const info = getPrivateGuidelinesInfo(lenderName);
  if (!info) return null;

  return (
    <div
      role="note"
      aria-label={`${lenderName} — guidelines are not publicly published`}
      className={`relative overflow-hidden rounded-2xl border border-amber-400/40 bg-gradient-to-br from-[#1b1409] via-[#111113] to-[#0a0a0c] p-5 shadow-[0_18px_60px_-30px_rgba(245,158,11,0.65)] sm:p-6 ${className}`}
    >
      {/* ambient glow */}
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-amber-500/15 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-amber-700/10 blur-3xl" aria-hidden />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <GuidelinesSeal size={96} className="shrink-0 self-center drop-shadow-[0_12px_28px_rgba(245,158,11,0.5)] sm:self-auto" />

        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Confidential underwriting
          </p>
          <h2 className="mt-2 text-xl font-bold text-white sm:text-2xl">Guidelines are not publicly published</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">{info.detail}</p>
          <blockquote className="mt-3 border-l-2 border-amber-400/60 pl-3 text-sm font-medium italic text-amber-200/90">
            “{info.summary}”
          </blockquote>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <Link
            href={contactHref}
            className="gold-button inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition hover:brightness-110"
          >
            Contact an Account Executive
          </Link>
          <Link
            href={contactHref}
            className="inline-flex items-center justify-center gap-1 text-xs font-medium text-amber-300/80 transition hover:text-amber-200"
          >
            View AE directory <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Compact chip for directory cards and list surfaces — signals at a glance
 * that the lender keeps its guidelines out of public distribution. */
export function PrivateGuidelinesChip({ lenderName, className = "" }: { lenderName: string; className?: string }) {
  const info = getPrivateGuidelinesInfo(lenderName);
  if (!info) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300 ${className}`}
    >
      <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden />
      Guidelines not published
    </span>
  );
}

/** Light-theme inline notice for scenario best-match / locked / ineligible
 * cards. One glance must tell the broker the figures come from public
 * reporting, never from the lender's own matrix. */
export function PrivateGuidelinesMatchNote({ lenderName, lenderId, className = "" }: { lenderName: string; lenderId?: string; className?: string }) {
  const info = getPrivateGuidelinesInfo(lenderName);
  if (!info) return null;
  const aeHref = lenderId ? `/lenders/${lenderId}#account-executives` : "/lenders";

  return (
    <div role="note" className={`mt-3 flex items-start gap-3 rounded-control border border-amber-300 bg-amber-50 p-3 ${className}`}>
      <GuidelinesSeal size={44} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Guidelines not publicly published</p>
        <p className="mt-0.5 text-sm leading-snug text-amber-900">{info.summary}</p>
        <p className="mt-1 text-xs text-amber-800/80">
          Figures shown for {lenderName || "this lender"} come from public reporting and can change without notice.
        </p>
        <Link href={aeHref} className="mt-1 inline-block text-xs font-bold text-amber-900 underline underline-offset-2 hover:no-underline">
          Find an Account Executive for current terms →
        </Link>
      </div>
    </div>
  );
}