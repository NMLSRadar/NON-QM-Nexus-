import { createClient } from "@/lib/supabase/server";
import { ClaimForm } from "./claim-form";

export const dynamic = "force-dynamic";

export default async function AeClaimPage() {
  const supabase = await createClient();
  const { data: lenders } = await supabase.from("lenders").select("id, name").order("name");
  const { data: unclaimedProfiles } = await supabase
    .from("ae_profiles")
    .select("id, lender_id, name, title, email")
    .is("claimed_by_user_id", null)
    .eq("status", "unclaimed")
    .order("name");

  const lenderById = new Map((lenders ?? []).map((l) => [l.id as string, l.name as string]));

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">Claim your AE profile</h1>
      <p className="text-sm text-slate-400">
        Find your name below and claim your listing free. If your sign-in email matches your employer&apos;s verified domain, it&apos;s
        approved instantly — otherwise an admin reviews it shortly.
      </p>
      <ClaimForm profiles={(unclaimedProfiles ?? []).map((p) => ({ id: p.id as string, name: p.name as string, title: p.title as string | null, email: p.email as string, lenderName: lenderById.get(p.lender_id as string) ?? "" }))} />
    </div>
  );
}
