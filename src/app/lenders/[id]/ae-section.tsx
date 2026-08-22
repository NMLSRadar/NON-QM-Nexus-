import { AeContactBlock } from "@/components/ae-contact-block";
import { getAeContactsByLenderIds } from "@/lib/ae/directory-data";

/** Account Executives section on a lender detail page. Sponsored profiles
 * (active ae_placements) sort first with a "Sponsored" badge — presentation
 * only, per the AE monetization spec; this never affects lender/program
 * matching or eligibility. */
export async function AeSection({ lenderId }: { lenderId: string }) {
  const contactsByLender = await getAeContactsByLenderIds([lenderId]);
  const contacts = contactsByLender[lenderId] ?? [];
  return <AeContactBlock contacts={contacts} variant="panel" />;
}
