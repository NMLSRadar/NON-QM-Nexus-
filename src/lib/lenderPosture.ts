import { mergePostureProfiles, type LenderFlexibilityProfile } from "@/domain/lenderPosture";

/**
 * Server-side loader for the org's effective posture directory: platform
 * seed defaults + any rows in lender_flexibility_profiles (platform-level
 * overrides and the caller org's own overrides — RLS scopes the query).
 * Best-effort: with no database (demo mode) or no table yet, the seed
 * defaults stand alone. A load failure must never fail the page/answer.
 */

interface SupabaseishClient {
  from(table: string): {
    select(columns: string): {
      is(column: string, value: null): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}

interface ProfileRow {
  id: string;
  organization_id: string | null;
  lender_id: string | null;
  canonical_name: string;
  aliases: string[] | null;
  posture: LenderFlexibilityProfile["posture"];
  posture_notes: string | null;
  pricing_tendency: LenderFlexibilityProfile["pricingTendency"];
  exceptions_considered: boolean;
  exception_channel: string | null;
  typical_compensating_factors: string[] | null;
  source: LenderFlexibilityProfile["source"];
  is_verified: boolean;
  last_reviewed_at: string | null;
  confidence: LenderFlexibilityProfile["confidence"];
}

function fromRow(row: ProfileRow): LenderFlexibilityProfile {
  return {
    id: row.id,
    organizationId: row.organization_id,
    lenderId: row.lender_id ?? undefined,
    canonicalName: row.canonical_name,
    aliases: row.aliases ?? [],
    posture: row.posture,
    postureNotes: row.posture_notes ?? "",
    pricingTendency: row.pricing_tendency,
    exceptionsConsidered: row.exceptions_considered,
    exceptionChannel: row.exception_channel ?? undefined,
    typicalCompensatingFactorsRequired: (row.typical_compensating_factors ?? []) as LenderFlexibilityProfile["typicalCompensatingFactorsRequired"],
    source: row.source,
    isVerified: row.is_verified,
    lastReviewedAt: row.last_reviewed_at,
    confidence: row.confidence,
  };
}

export async function getEffectivePostureProfiles(client: SupabaseishClient | null): Promise<LenderFlexibilityProfile[]> {
  if (!client) return mergePostureProfiles([]);
  try {
    const { data, error } = await client
      .from("lender_flexibility_profiles")
      .select(
        "id, organization_id, lender_id, canonical_name, aliases, posture, posture_notes, pricing_tendency, exceptions_considered, exception_channel, typical_compensating_factors, source, is_verified, last_reviewed_at, confidence"
      )
      .is("deleted_at", null);
    if (error || !data) return mergePostureProfiles([]);
    return mergePostureProfiles((data as ProfileRow[]).map(fromRow));
  } catch {
    return mergePostureProfiles([]);
  }
}
