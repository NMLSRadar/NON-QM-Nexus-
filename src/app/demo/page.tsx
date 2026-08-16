import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { DEMO_BOOKING_URL } from "@/lib/demo";
import { DemoForm } from "./demo-form";

export const metadata: Metadata = pageMetadata({
  title: "Book a Live Demo — NON-QM Nexus",
  description:
    "Book a live walkthrough of NON-QM Nexus. See how to describe a borrower's scenario and get lender programs ranked by real guideline eligibility — not pricing.",
  path: "/demo",
});

export default function DemoPage() {
  return (
    <div className="gold-theme gold-page nexus-landing -mx-4 -my-6 bg-[#050505] px-4 py-8 sm:px-6 sm:py-12">
      <div className="relative mx-auto max-w-xl">
        <div className="mb-6 text-center">
          <span className="nexus-eyebrow">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Live walkthrough · 30 minutes
          </span>
          <h1 className="nexus-headline mt-4">
            <span className="block">Book a live demo of</span>
            <span className="nexus-gold-copy block">NON-QM Nexus</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-300">
            Tell us who you are and we&apos;ll hand you off to pick a time. We&apos;ll walk you
            through matching any Non-QM scenario — DSCR, bank statement, ITIN, foreign national —
            to the right lender by real guideline eligibility.
          </p>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-[#0a0a0b] p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] sm:p-6">
          <DemoForm bookingUrl={DEMO_BOOKING_URL} />
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          This is a research and underwriting-assistance tool. It does not issue loan approvals or
          commitments to lend.
        </p>
      </div>
    </div>
  );
}