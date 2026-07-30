import { requirePlatformAdmin } from "@/lib/admin";
import { createAeProfile, updateAeProfileStatus, deleteAeProfile, setLenderEmailDomain } from "./actions";
import { AeImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default async function AdminAeProfilesPage() {
  const { supabase } = await requirePlatformAdmin();

  const { data: lenders } = await supabase.from("lenders").select("id, name, email_domain").order("name");
  const { data: profiles } = await supabase
    .from("ae_profiles")
    .select("id, lender_id, name, title, email, phone, states, status, claimed_by_user_id")
    .order("created_at", { ascending: false });

  const lenderById = new Map((lenders ?? []).map((l) => [l.id as string, l]));

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-6">
      <h1 className="text-2xl font-bold text-white">AE Directory — Admin</h1>

      <section className="gold-panel rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-300/80">Bulk import (CSV)</h2>
        <AeImportForm />
      </section>

      <section className="gold-panel rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-300/80">Add a single profile</h2>
        <form
          action={async (formData: FormData) => {
            "use server";
            await createAeProfile(formData);
          }}
          className="flex flex-wrap gap-3 items-end"
        >
          <select name="lenderId" required className="rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white">
            <option value="">Select lender…</option>
            {(lenders ?? []).map((l) => (
              <option key={l.id as string} value={l.id as string}>
                {l.name as string}
              </option>
            ))}
          </select>
          <input name="name" required placeholder="Name" className="rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white" />
          <input name="title" placeholder="Title" className="rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white" />
          <input name="email" type="email" required placeholder="Email" className="rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white" />
          <input name="phone" placeholder="Phone" className="rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white" />
          <input name="nmlsId" placeholder="NMLS ID" className="rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white" />
          <input name="states" placeholder="States (comma-sep)" className="rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white" />
          <button type="submit" className="gold-button rounded-full px-4 py-2 text-sm font-semibold">
            Add
          </button>
        </form>
      </section>

      <section className="gold-panel rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-300/80">Lender email domains (for claim auto-approval)</h2>
        <p className="text-xs text-slate-500">
          An AE&apos;s claim auto-approves only when their verified sign-in email domain matches the lender&apos;s domain here.
        </p>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {(lenders ?? []).map((l) => (
            <form
              key={l.id as string}
              action={async (formData: FormData) => {
                "use server";
                await setLenderEmailDomain(l.id as string, (formData.get("emailDomain") as string) ?? "");
              }}
              className="flex items-center gap-2 text-sm"
            >
              <span className="w-52 truncate text-slate-300">{l.name as string}</span>
              <input
                name="emailDomain"
                defaultValue={(l.email_domain as string | null) ?? ""}
                placeholder="e.g. acralending.com"
                className="rounded-lg bg-black/40 border border-amber-500/25 px-3 py-1.5 text-xs text-white flex-1"
              />
              <button type="submit" className="text-xs text-amber-300 underline">
                Save
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="gold-panel rounded-2xl p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-300/80 mb-3">All AE profiles ({(profiles ?? []).length})</h2>
        <div className="space-y-2">
          {(profiles ?? []).map((p) => (
            <div key={p.id as string} className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/10 pb-2">
              <div>
                <p className="text-sm font-medium text-white">
                  {p.name as string} <span className="text-slate-500">— {lenderById.get(p.lender_id as string)?.name as string}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {p.email as string} {p.phone ? `· ${p.phone as string}` : ""} · status: {p.status as string}
                  {p.claimed_by_user_id ? " (claimed)" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(["unclaimed", "claimed", "hidden"] as const).map((s) => (
                  <form
                    key={s}
                    action={async () => {
                      "use server";
                      await updateAeProfileStatus(p.id as string, s);
                    }}
                  >
                    <button
                      type="submit"
                      className={`text-xs rounded-full px-2.5 py-1 border ${p.status === s ? "border-amber-400 text-amber-300" : "border-amber-500/20 text-slate-500"}`}
                    >
                      {s}
                    </button>
                  </form>
                ))}
                <form
                  action={async () => {
                    "use server";
                    await deleteAeProfile(p.id as string);
                  }}
                >
                  <button type="submit" className="text-xs text-rose-400 underline">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
          {(profiles ?? []).length === 0 ? <p className="text-sm text-slate-500">No AE profiles yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
