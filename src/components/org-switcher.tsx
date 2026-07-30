import { listUserOrganizations, getCurrentOrganizationId } from "@/lib/session";
import { OrgSwitcherSelect } from "./org-switcher-select";

/** Minimal org switcher — a dropdown, not a workspace system — shown in the
 * account menu ONLY when the signed-in user has more than one active
 * membership (accepted a second team's invite). Solo users never see any
 * extra chrome. Server component: resolves the org list + current
 * selection server-side, hands both to the tiny client select. */
export async function OrgSwitcher() {
  const organizations = await listUserOrganizations();
  if (organizations.length < 2) return null;

  const currentOrgId = await getCurrentOrganizationId();
  return <OrgSwitcherSelect organizations={organizations} currentOrgId={currentOrgId} />;
}
