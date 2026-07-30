"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActiveOrganization } from "@/app/account/set-active-org";

export function OrgSwitcherSelect({
  organizations,
  currentOrgId,
}: {
  organizations: Array<{ organizationId: string; organizationName: string; role: string }>;
  currentOrgId: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <select
      aria-label="Switch organization"
      disabled={pending}
      value={currentOrgId}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          await setActiveOrganization(next);
          router.refresh();
        });
      }}
      className="bg-transparent text-slate-300 hover:text-white text-sm rounded px-1 py-0.5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-amber-400 max-w-[160px]"
    >
      {organizations.map((org) => (
        <option key={org.organizationId} value={org.organizationId} className="bg-[#111113] text-white">
          {org.organizationName}
        </option>
      ))}
    </select>
  );
}
