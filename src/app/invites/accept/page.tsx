import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { AcceptInviteClient } from "./accept-invite-client";

export const dynamic = "force-dynamic";

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="gold-theme gold-page -mx-4 -my-10 px-4 py-16 sm:px-6 min-h-[70vh] max-w-md mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-6">Team invitation</h1>
      <Card>
        {!invite ? (
          <p className="text-sm text-slate-400">Missing invitation token.</p>
        ) : !user ? (
          <p className="text-sm text-slate-400">
            Sign in first, then{" "}
            <Link href={`/login?next=${encodeURIComponent(`/invites/accept?invite=${invite}`)}`} className="text-amber-400 underline">
              come back to this link
            </Link>{" "}
            to accept.
          </p>
        ) : (
          <AcceptInviteClient token={invite} />
        )}
      </Card>
    </main>
  );
}
