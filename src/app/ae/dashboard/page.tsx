import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAeProfileForCurrentUser } from "@/lib/ae/queries";
import { getAeMonthlyStats, currentAndLastNMonths } from "@/lib/ae/stats";
import { updateOwnAeProfile } from "./actions";

export const dynamic = "force-dynamic";

export default async function AeDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/ae/dashboard");

  const result = await getAeProfileForCurrentUser();
  if (!result) {
    return (
      <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-4 max-w-xl">
        <h1 className="text-2xl font-bold text-white">AE Dashboard</h1>
        <p className="text-sm text-slate-400">You haven&apos;t claimed an AE profile yet.</p>
        <Link href="/ae/claim" className="gold-button inline-block rounded-full px-5 py-2.5 text-sm font-semibold">
          Claim your profile
        </Link>
      </div>
    );
  }

  const { profile, placement } = result;
  const sponsored = placement?.status === "active";
  const months = currentAndLastNMonths(3);
  const statsByMonth = await Promise.all(months.map(async (m) => ({ month: m, stats: await getAeMonthlyStats(profile.id, m) })));

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">AE Dashboard — {profile.name}</h1>
      {profile.status === "unclaimed" ? (
        <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-3">Your claim is pending admin review.</p>
      ) : null}

      <section className="gold-panel rounded-2xl p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-300/80 mb-3">Your last 3 months</h2>
        <div className="grid grid-cols-3 gap-3">
          {statsByMonth.map(({ month, stats }) => (
            <div key={month} className="rounded-control border border-amber-500/20 bg-black/20 p-3">
              <p className="text-xs text-slate-500">{month}</p>
              <p className="text-lg font-bold text-white">{stats.views} views</p>
              <p className="text-xs text-slate-400">{stats.phoneClicks} calls · {stats.emailClicks} emails</p>
              {sponsored ? <p className="text-xs text-amber-300 mt-1">{stats.lenderScenarioMatches} scenario matches</p> : null}
            </div>
          ))}
        </div>
        {!sponsored ? (
          <p className="mt-3 text-xs text-slate-500">
            Scenario-match stats are part of Featured Placement.{" "}
            <Link href="/ae/subscribe" className="text-amber-300 underline">
              Learn more
            </Link>
            .
          </p>
        ) : null}
      </section>

      <section className="gold-panel rounded-2xl p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-300/80 mb-3">Edit your profile</h2>
        <form
          action={async (formData: FormData) => {
            "use server";
            await updateOwnAeProfile(formData);
          }}
          className="space-y-3"
        >
          <input name="title" defaultValue={profile.title ?? ""} placeholder="Title" className="w-full rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white" />
          <input name="phone" defaultValue={profile.phone ?? ""} placeholder="Phone" className="w-full rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white" />
          <input name="nmlsId" defaultValue={profile.nmlsId ?? ""} placeholder="NMLS ID" className="w-full rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white" />
          <input name="states" defaultValue={profile.states.join(", ")} placeholder="Licensed states (comma-separated)" className="w-full rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white" />
          <input name="photoUrl" defaultValue={profile.photoUrl ?? ""} placeholder="Photo URL" className="w-full rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white" />
          <button type="submit" className="gold-button rounded-full px-5 py-2.5 text-sm font-semibold">
            Save
          </button>
        </form>
      </section>
    </div>
  );
}
