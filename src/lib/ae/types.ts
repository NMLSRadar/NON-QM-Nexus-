export type AeProfileStatus = "unclaimed" | "claimed" | "hidden";

export interface AeProfile {
  id: string;
  lenderId: string;
  name: string;
  title: string | null;
  email: string;
  phone: string | null;
  nmlsId: string | null;
  states: string[];
  photoUrl: string | null;
  claimedByUserId: string | null;
  status: AeProfileStatus;
  createdAt: string;
  updatedAt: string;
}

export type AePlacementStatus = "none" | "active" | "canceled";
export type AePlacementSource = "stripe" | "comped";

export interface AePlacement {
  id: string;
  aeProfileId: string;
  status: AePlacementStatus;
  source: AePlacementSource | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  startedAt: string | null;
  canceledAt: string | null;
}

export function rowToAeProfile(row: Record<string, unknown>): AeProfile {
  return {
    id: row.id as string,
    lenderId: row.lender_id as string,
    name: row.name as string,
    title: (row.title as string | null) ?? null,
    email: row.email as string,
    phone: (row.phone as string | null) ?? null,
    nmlsId: (row.nmls_id as string | null) ?? null,
    states: (row.states as string[]) ?? [],
    photoUrl: (row.photo_url as string | null) ?? null,
    claimedByUserId: (row.claimed_by_user_id as string | null) ?? null,
    status: row.status as AeProfileStatus,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function rowToAePlacement(row: Record<string, unknown>): AePlacement {
  return {
    id: row.id as string,
    aeProfileId: row.ae_profile_id as string,
    status: row.status as AePlacementStatus,
    source: (row.source as AePlacementSource | null) ?? null,
    stripeCustomerId: (row.stripe_customer_id as string | null) ?? null,
    stripeSubscriptionId: (row.stripe_subscription_id as string | null) ?? null,
    startedAt: (row.started_at as string | null) ?? null,
    canceledAt: (row.canceled_at as string | null) ?? null,
  };
}
