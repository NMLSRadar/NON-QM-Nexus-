import { requirePlatformAdmin } from "@/lib/admin";
import { createOutreachContact } from "./actions";
import { SendPanel } from "./send-panel";

export const dynamic = "force-dynamic";

export default async function AdminOutreachPage({ searchParams }: { searchParams: Promise<{ status?: string; lender?: string }> }) {
  const { supabase } = await requirePlatformAdmin();
  const params = await searchParams;

  let query = supabase.from("outreach_contacts").select("id, name, email, lender_name, status, ae_profile_id, last_contacted_at").order("created_at", { ascending: false });
  if (params.status) query = query.eq("status", params.status);
  if (params.lender) query = query.ilike("lender_name", `%${params.lender}%`);
  const { data: contacts } = await query;

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Outreach — Admin</h1>
      <p className="text-sm text-slate-500">
        Admin-triggered only — no cron ever sends this. Every send is previewed with the recipient&apos;s real, live stats before going out,
        rate-limited to 50/day, and logged to outreach_sends.
      </p>

      <section className="gold-panel rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-300/80">Add a prospect</h2>
        <form
          action={async (formData: FormData) => {
            "use server";
            await createOutreachContact(formData);
          }}
          className="flex flex-wrap gap-3 items-end"
        >
          <input name="name" required placeholder="Name" className="rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white" />
          <input name="email" type="email" required placeholder="Email" className="rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white" />
          <input name="lenderName" required placeholder="Lender name" className="rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white" />
          <input name="sourceNote" placeholder="Source (where we got this contact)" className="rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white" />
          <button type="submit" className="gold-button rounded-full px-4 py-2 text-sm font-semibold">
            Add
          </button>
        </form>
      </section>

      <section className="gold-panel rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-300/80">Filter</h2>
        <form className="flex flex-wrap gap-3 items-end">
          <select name="status" defaultValue={params.status ?? ""} className="rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white">
            <option value="">Any status</option>
            {["prospect", "invited", "claimed", "subscribed", "unsubscribed"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input name="lender" defaultValue={params.lender ?? ""} placeholder="Filter by lender" className="rounded-lg bg-black/40 border border-amber-500/25 px-3 py-2 text-sm text-white" />
          <button type="submit" className="text-xs text-amber-300 underline">
            Apply
          </button>
        </form>
      </section>

      <section className="gold-panel rounded-2xl p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-300/80 mb-3">Prospects ({(contacts ?? []).length})</h2>
        <SendPanel
          contacts={(contacts ?? []).map((c) => ({ id: c.id as string, name: c.name as string, email: c.email as string, lenderName: c.lender_name as string, status: c.status as string }))}
        />
      </section>
    </div>
  );
}
