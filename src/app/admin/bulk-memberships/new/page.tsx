import { requirePlatformAdmin } from "@/lib/admin";
import { Card } from "@/components/ui";
import { CreateBulkMembershipForm } from "./create-form";

export const dynamic = "force-dynamic";

export default async function NewBulkMembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ requestId?: string }>;
}) {
  const { supabase } = await requirePlatformAdmin();
  const { requestId } = await searchParams;

  let prefill: { companyName?: string; contactName?: string; contactEmail?: string; seatCount?: number } = {};
  if (requestId) {
    const { data } = await supabase
      .from("bulk_membership_requests")
      .select("company_name, contact_name, contact_email, seat_count_requested")
      .eq("id", requestId)
      .maybeSingle();
    if (data) {
      prefill = {
        companyName: data.company_name as string,
        contactName: data.contact_name as string,
        contactEmail: data.contact_email as string,
        seatCount: data.seat_count_requested as number,
      };
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">New Bulk Membership</h1>
      <Card>
        <CreateBulkMembershipForm
          defaultCompanyName={prefill.companyName}
          defaultContactName={prefill.contactName}
          defaultContactEmail={prefill.contactEmail}
          defaultSeatCount={prefill.seatCount}
          requestId={requestId}
        />
      </Card>
    </div>
  );
}
