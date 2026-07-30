import { isAeMonetizationEnabled } from "@/lib/ae/monetization";
import { startAePlacementCheckout } from "./actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AeSubscribePage() {
  const enabled = isAeMonetizationEnabled();

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold text-white">AE Featured Placement</h1>

      {!enabled ? (
        <div className="gold-panel rounded-2xl p-6 space-y-3">
          <p className="text-slate-300">Coming soon — join the free directory now.</p>
          <p className="text-sm text-slate-500">
            Featured Placement is a flat monthly subscription for advertising placement only. It has no effect on lender or
            program matching, eligibility, or ranking — sponsorship never changes which lenders appear in a broker&apos;s results.
          </p>
          <Link href="/ae/claim" className="gold-button inline-block rounded-full px-5 py-2.5 text-sm font-semibold">
            Claim your free profile
          </Link>
        </div>
      ) : (
        <div className="gold-panel rounded-2xl p-6 space-y-4">
          <p className="text-slate-300">
            $49/month, flat. Your profile sorts first within your lender&apos;s AE list with a &quot;Sponsored&quot; badge, appears
            in a clearly-bordered Sponsored AE contact card on scenario results (only when your lender independently qualifies for
            that scenario), and unlocks full stats.
          </p>
          <p className="text-xs text-slate-500">
            This is advertising placement only — it never influences lender/program eligibility, ranking, or which lenders appear
            in a broker&apos;s results.
          </p>
          <form action={startAePlacementCheckout}>
            <button type="submit" className="gold-button rounded-full px-5 py-2.5 text-sm font-semibold">
              Subscribe — $49/mo
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
