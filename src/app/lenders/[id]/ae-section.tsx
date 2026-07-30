import { Pill } from "@/components/ui";
import { listAeProfilesForLender } from "@/lib/ae/queries";
import { RecordAeEventButtons } from "./ae-event-buttons";

/** Account Executives section on a lender detail page. Sponsored profiles
 * (active ae_placements) sort first with a "Sponsored" badge — presentation
 * only, per the AE monetization spec; this never affects lender/program
 * matching or eligibility. */
export async function AeSection({ lenderId }: { lenderId: string }) {
  const profiles = await listAeProfilesForLender(lenderId);

  return (
    <div className="mt-3 space-y-3">
      {profiles.length === 0 ? (
        <p className="text-sm text-slate-400">No AE contacts listed yet.</p>
      ) : (
        profiles.map(({ profile, placement }) => {
          const sponsored = placement?.status === "active";
          return (
            <div
              key={profile.id}
              className={`rounded-control border p-4 ${sponsored ? "border-amber-500/50 bg-amber-500/5" : "border-amber-500/20 bg-black/20"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-white flex items-center gap-2">
                    {profile.name}
                    {sponsored ? <Pill tone="gold">Sponsored</Pill> : null}
                  </p>
                  {profile.title ? <p className="text-sm text-slate-400">{profile.title}</p> : null}
                  {profile.states.length > 0 ? <p className="mt-1 text-xs text-slate-500">Licensed: {profile.states.join(", ")}</p> : null}
                </div>
                <RecordAeEventButtons aeProfileId={profile.id} phone={profile.phone} email={profile.email} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
