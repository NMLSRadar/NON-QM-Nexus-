import { Users } from "lucide-react";
import { PremiumPageHero } from "@/components/premium-ui";
import { requireSubscriberAccess } from "@/lib/session";
import { getAeDirectoryEntries } from "@/lib/ae/directory-data";
import { AeDirectoryClient } from "./ae-directory-client";

export const dynamic = "force-dynamic";

export default async function AeDirectoryPage() {
  await requireSubscriberAccess();
  const entries = await getAeDirectoryEntries();

  return (
    <div className="nexus-light-mode-section nexus-ae-directory-page gold-theme gold-page -mx-4 -my-6 space-y-6 rounded-b-3xl bg-[#050505] px-4 py-6 sm:px-6 sm:py-8">
      <PremiumPageHero
        icon={Users}
        title={<>AE <span className="nexus-title-gold">Directory</span></>}
        description={<>Connect directly with Account Executives from the lenders inside Non-QM Nexus.</>}
      />
      <AeDirectoryClient entries={entries} />
    </div>
  );
}
