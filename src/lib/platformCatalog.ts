/**
 * NON-QM Nexus's lender/program/rule catalog is a SINGLE platform-curated
 * dataset shared by every subscriber, gated by subscription TIER — not a
 * private per-brokerage lender list. Every real lender/program/rule row
 * lives in this one canonical organization.
 *
 * Root cause this constant fixes: `organizations`/`memberships` ARE
 * genuinely per-signup (each new user gets their own org for scenarios,
 * billing, etc.), so a naive "read catalog data scoped to the caller's
 * own organization_id" silently returns nothing for every account except
 * this one — which is exactly what was happening. See
 * supabase/lender-catalog-global-read.sql for the matching RLS policy
 * that allows any authenticated user to read this organization's
 * lenders/programs/guideline_versions/rules rows (writes remain fully
 * platform-admin-only, unchanged).
 */
export const PLATFORM_CATALOG_ORGANIZATION_ID = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
export const MAX_TIER_LEVEL = 3;
