"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { acceptInvite } from "./actions";

export function AcceptInviteClient({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; organizationName?: string } | null>(null);
  const router = useRouter();

  return (
    <div className="space-y-4">
      {result?.organizationName ? (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-sm p-3">
          You&apos;ve joined <strong>{result.organizationName}</strong>. Use the org switcher in the account menu to
          move between organizations.
        </div>
      ) : (
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await acceptInvite(token);
              setResult(res);
              if (res.organizationName) router.refresh();
            })
          }
        >
          {pending ? "Accepting…" : "Accept invitation"}
        </Button>
      )}
      {result?.error ? <p className="text-sm text-rose-400">{result.error}</p> : null}
    </div>
  );
}
