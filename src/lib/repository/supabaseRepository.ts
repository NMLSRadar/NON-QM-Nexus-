import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repository } from "@/lib/store";
import type { Lender, Program, Rule } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
import type { ProgramCatalog } from "@/domain/analyze";
import { getEffectivePlan } from "./membership";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";

/** The top subscription tier (Enterprise) — passing this as a tier
 * override effectively lifts the `.lte("tier_level", tier)` gate so every
 * active, verified lender/program is returned regardless of the caller's
 * real plan. Used only by getCatalogForMatching. */
const MAX_TIER_LEVEL = 3;

// ---------------------------------------------------------------------------
// Row <-> domain object mapping.
//
// Lenders map column-for-column. Programs and Rules carry their full
// structured shape (loan criteria / condition tree) in a jsonb column
// (config / definition) — see prisma/schema.prisma comments — with a few
// canonical columns (organization_id, lender_id, name, active, ...)
// mirrored for querying and RLS. The jsonb payload is the source of truth
// for every other field; canonical columns always win on conflict.
// ---------------------------------------------------------------------------

interface LenderRow {
  id: string;
  organization_id: string;
  name: string;
  is_sample_data: boolean;
  active: boolean;
  contact_email: string | null;
  notes: string | null;
  tier_level: number;
}

function rowToLender(row: LenderRow): Lender {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    isSampleData: row.is_sample_data,
    active: row.active,
    contactEmail: row.contact_email ?? undefined,
    notes: row.notes ?? undefined,
    tierLevel: row.tier_level,
  };
}

interface ProgramRow {
  id: string;
  organization_id: string;
  lender_id: string;
  name: string;
  is_sample_data: boolean;
  active: boolean;
  config: Omit<Program, "id" | "organizationId" | "lenderId" | "name" | "isSampleData" | "active">;
}

function rowToProgram(row: ProgramRow): Program {
  return {
    ...row.config,
    id: row.id,
    organizationId: row.organization_id,
    lenderId: row.lender_id,
    name: row.name,
    isSampleData: row.is_sample_data,
    active: row.active,
  };
}

interface RuleRow {
  id: string;
  organization_id: string;
  program_id: string;
  guideline_version_id: string;
  category: string;
  name: string;
  definition: Pick<Rule, "conditions" | "outcomeWhenTrue" | "outcomeWhenFalse" | "setsField">;
  severity: Rule["severity"];
  user_explanation: string;
  internal_explanation: string | null;
  source_section: string | null;
  source_page: number | null;
  effective_date: string | null;
  expiration_date: string | null;
  verification_status: Rule["verificationStatus"];
  // joined in via `programs(lender_id)`
  programs: { lender_id: string } | { lender_id: string }[] | null;
}

function rowToRule(row: RuleRow): Rule {
  const joinedProgram = Array.isArray(row.programs) ? row.programs[0] : row.programs;
  return {
    id: row.id,
    lenderId: joinedProgram?.lender_id ?? "",
    programId: row.program_id,
    guidelineVersionId: row.guideline_version_id,
    category: row.category,
    name: row.name,
    conditions: row.definition.conditions,
    outcomeWhenTrue: row.definition.outcomeWhenTrue,
    outcomeWhenFalse: row.definition.outcomeWhenFalse,
    setsField: row.definition.setsField ?? undefined,
    severity: row.severity,
    userExplanation: row.user_explanation,
    internalExplanation: row.internal_explanation ?? undefined,
    sourceSection: row.source_section ?? undefined,
    sourcePage: row.source_page ?? undefined,
    effectiveDate: row.effective_date ?? undefined,
    expirationDate: row.expiration_date ?? undefined,
    verificationStatus: row.verification_status,
  };
}

interface ScenarioRow {
  id: string;
  organization_id: string;
  name: string;
  created_by: string;
  data: Omit<Scenario, "id" | "organizationId" | "name" | "createdByUserId" | "createdAt" | "updatedAt">;
  created_at: string;
  updated_at: string;
}

export function rowToScenario(row: ScenarioRow): Scenario {
  return {
    ...row.data,
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    createdByUserId: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function scenarioToRow(scenario: Scenario) {
  const { id, organizationId, name, createdByUserId, createdAt, updatedAt, ...data } = scenario;
  void id;
  void createdAt;
  void updatedAt;
  return {
    organization_id: organizationId,
    name,
    created_by: createdByUserId,
    data,
  };
}

export class SupabaseRepository implements Repository {
  private effectiveTierPromise: Promise<number> | null = null;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly userId?: string
  ) {}

  /** The current user's subscription tier level (0 = no active plan → sees no lenders). */
  private async getEffectiveTier(): Promise<number> {
    if (!this.userId) return 0;
    if (!this.effectiveTierPromise) {
      this.effectiveTierPromise = getEffectivePlan(this.supabase, this.userId).then((p) => p.tierLevel);
    }
    return this.effectiveTierPromise;
  }

  async getCatalog(organizationId: string): Promise<ProgramCatalog> {
    // No self-seeding step here anymore — lenders/programs/rules are the
    // shared platform catalog (PLATFORM_CATALOG_ORGANIZATION_ID), so a
    // brand-new organization already sees real data on its very first
    // call; there is nothing to seed into an org whose own lenders table
    // is never read by these three methods.
    const [lenders, programs, rules] = await Promise.all([
      this.listLenders(organizationId),
      this.listPrograms(organizationId),
      this.listRules(organizationId),
    ]);
    return { lenders, programs, rules };
  }

  /** Same catalog, but for scenario MATCHING — every active, verified
   * program regardless of the caller's subscription tier (tierOverride =
   * MAX_TIER_LEVEL). The results page uses this so an eligible lender
   * above the viewer's own tier still shows up (locked) and still counts
   * toward the eligible-lender threshold, instead of the matching engine
   * never seeing it at all. Never used to leak guideline data anywhere
   * except through the already-locked scenario-results card. */
  async getCatalogForMatching(organizationId: string): Promise<ProgramCatalog> {
    const [lenders, programs, rules] = await Promise.all([
      this.listLenders(organizationId, MAX_TIER_LEVEL),
      this.listPrograms(organizationId, MAX_TIER_LEVEL),
      this.listRules(organizationId, MAX_TIER_LEVEL),
    ]);
    return { lenders, programs, rules };
  }

  async listScenarios(organizationId: string): Promise<Scenario[]> {
    const { data, error } = await this.supabase
      .from("scenarios")
      .select("id, organization_id, name, created_by, data, created_at, updated_at")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(`Failed to list scenarios: ${error.message}`);
    return (data as ScenarioRow[]).map(rowToScenario);
  }

  async getScenario(organizationId: string, id: string): Promise<Scenario | null> {
    const { data, error } = await this.supabase
      .from("scenarios")
      .select("id, organization_id, name, created_by, data, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(`Failed to load scenario: ${error.message}`);
    return data ? rowToScenario(data as ScenarioRow) : null;
  }

  async saveScenario(scenario: Scenario): Promise<Scenario> {
    const row = scenarioToRow(scenario);
    const { data, error } = await this.supabase
      .from("scenarios")
      .upsert({ id: scenario.id, ...row }, { onConflict: "id" })
      .select("id, organization_id, name, created_by, data, created_at, updated_at")
      .single();
    if (error) throw new Error(`Failed to save scenario: ${error.message}`);
    return rowToScenario(data as ScenarioRow);
  }

  async listLenders(organizationId: string, tierOverride?: number): Promise<Lender[]> {
    // Catalog data is shared platform-wide, not scoped to the caller's own
    // organization — see docs on PLATFORM_CATALOG_ORGANIZATION_ID. The
    // `organizationId` parameter is kept for interface stability (and is
    // still what InMemoryRepository uses) but intentionally unused here.
    void organizationId;
    const tier = tierOverride ?? (await this.getEffectiveTier());
    const { data, error } = await this.supabase
      .from("lenders")
      .select("id, organization_id, name, is_sample_data, active, contact_email, notes, tier_level")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .eq("is_sample_data", false)
      .lte("tier_level", tier)
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to list lenders: ${error.message}`);
    const lenders = (data as LenderRow[]).map(rowToLender);
    // External-audit fix (2026-07-28): a lender must not be customer-
    // visible, matched against, or counted toward any advertised tier
    // number unless it has at least one active program backed by a
    // human_verified guideline_version. "Pending" (no verified guideline
    // yet) is an admin-only state — see listAllLenders below, which
    // intentionally has NO such filter for the admin review workflow.
    const verifiedLenderIds = await this.getVerifiedLenderIds(lenders.map((l) => l.id));
    return lenders.filter((l) => verifiedLenderIds.has(l.id));
  }

  /** Real lender IDs that currently have >=1 active program backed by a
   * human_verified guideline_version — the single source of truth for
   * "verified" used by every customer-facing query. Never invents
   * verification: a lender/program an admin hasn't reviewed through
   * /admin/documents (or an equivalent verified guideline_versions row)
   * stays excluded until that happens. */
  private async getVerifiedLenderIds(candidateLenderIds: string[]): Promise<Set<string>> {
    if (candidateLenderIds.length === 0) return new Set();
    const { data: programs, error: programsError } = await this.supabase
      .from("programs")
      .select("id, lender_id")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .eq("is_sample_data", false)
      .eq("active", true)
      .in("lender_id", candidateLenderIds)
      .is("deleted_at", null);
    if (programsError) throw new Error(`Failed to list programs for verification check: ${programsError.message}`);
    const programIds = (programs as Array<{ id: string; lender_id: string }>).map((p) => p.id);
    if (programIds.length === 0) return new Set();

    const { data: guidelineVersions, error: gvError } = await this.supabase
      .from("guideline_versions")
      .select("program_id, verification_status")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .in("program_id", programIds)
      .eq("verification_status", "human_verified");
    if (gvError) throw new Error(`Failed to list guideline versions for verification check: ${gvError.message}`);
    const verifiedProgramIds = new Set((guidelineVersions as Array<{ program_id: string }>).map((g) => g.program_id));

    const verifiedLenderIds = new Set<string>();
    for (const p of programs as Array<{ id: string; lender_id: string }>) {
      if (verifiedProgramIds.has(p.id)) verifiedLenderIds.add(p.lender_id);
    }
    return verifiedLenderIds;
  }

  /** Every lender in the platform catalog regardless of tier — see the
   * Repository interface doc comment. Deliberately has NO
   * `.lte("tier_level", tier)` filter; guideline/program data
   * (listPrograms) stays tier-gated, so this alone never leaks anything
   * beyond a lender's name/tier. */
  async listAllLenders(organizationId: string): Promise<Lender[]> {
    void organizationId;
    const { data, error } = await this.supabase
      .from("lenders")
      .select("id, organization_id, name, is_sample_data, active, contact_email, notes, tier_level")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .eq("is_sample_data", false)
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to list all lenders: ${error.message}`);
    return (data as LenderRow[]).map(rowToLender);
  }

  /** See the Repository interface doc comment — tier-gated but NOT
   * verification-gated, and deliberately returns only names + doc types
   * (never a numeric guideline field), so the AI assistant can be aware a
   * pending-review lender exists ("appears to offer this program, but
   * eligibility is still being verified") without ever being handed a
   * guideline fact that hasn't passed admin review. */
  async listPendingReviewLenderPrograms(organizationId: string): Promise<Array<{ lenderName: string; programName: string; incomeDocTypes: string[] }>> {
    void organizationId;
    const tier = await this.getEffectiveTier();
    const { data: lenderRows, error: lenderError } = await this.supabase
      .from("lenders")
      .select("id, name")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .eq("is_sample_data", false)
      .eq("active", true)
      .lte("tier_level", tier)
      .is("deleted_at", null);
    if (lenderError) throw new Error(`Failed to list lenders for pending-review check: ${lenderError.message}`);
    const lenders = lenderRows as Array<{ id: string; name: string }>;
    if (lenders.length === 0) return [];

    const verifiedLenderIds = await this.getVerifiedLenderIds(lenders.map((l) => l.id));
    const pendingLenderIds = lenders.filter((l) => !verifiedLenderIds.has(l.id)).map((l) => l.id);
    if (pendingLenderIds.length === 0) return [];

    const { data: programRows, error: programError } = await this.supabase
      .from("programs")
      .select("name, lender_id, config")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .eq("is_sample_data", false)
      .eq("active", true)
      .in("lender_id", pendingLenderIds)
      .is("deleted_at", null);
    if (programError) throw new Error(`Failed to list programs for pending-review check: ${programError.message}`);

    const lenderNameById = new Map(lenders.map((l) => [l.id, l.name]));
    return (programRows as Array<{ name: string; lender_id: string; config: { incomeDocTypes?: string[] } }>).map((p) => ({
      lenderName: lenderNameById.get(p.lender_id) ?? "Unknown lender",
      programName: p.name,
      incomeDocTypes: p.config.incomeDocTypes ?? [],
    }));
  }

  async listPrograms(organizationId: string, tierOverride?: number): Promise<Program[]> {
    void organizationId;
    const tier = tierOverride ?? (await this.getEffectiveTier());
    const { data, error } = await this.supabase
      .from("programs")
      .select("id, organization_id, lender_id, name, is_sample_data, active, config, lenders!inner(tier_level)")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .eq("is_sample_data", false)
      .lte("lenders.tier_level", tier)
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to list programs: ${error.message}`);
    const programs = (data as unknown as ProgramRow[]).map(rowToProgram);
    if (programs.length === 0) return [];
    // External-audit fix (2026-07-28): same verified-only gate as
    // listLenders — a program must not evaluate in matching for customer
    // accounts unless it has a human_verified guideline_version. Pending
    // (AI-extracted or otherwise unreviewed) programs are admin-only.
    const { data: guidelineVersions, error: gvError } = await this.supabase
      .from("guideline_versions")
      .select("program_id")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .in(
        "program_id",
        programs.map((p) => p.id),
      )
      .eq("verification_status", "human_verified");
    if (gvError) throw new Error(`Failed to list guideline versions for verification check: ${gvError.message}`);
    const verifiedProgramIds = new Set((guidelineVersions as Array<{ program_id: string }>).map((g) => g.program_id));
    return programs.filter((p) => verifiedProgramIds.has(p.id));
  }

  async listRules(organizationId: string, tierOverride?: number): Promise<Rule[]> {
    void organizationId;
    const tier = tierOverride ?? (await this.getEffectiveTier());
    const { data, error } = await this.supabase
      .from("rules")
      .select(
        "id, organization_id, program_id, guideline_version_id, category, name, definition, severity, user_explanation, internal_explanation, source_section, source_page, effective_date, expiration_date, verification_status, programs!inner(lender_id, lenders!inner(tier_level))"
      )
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .lte("programs.lenders.tier_level", tier)
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to list rules: ${error.message}`);
    return (data as unknown as RuleRow[]).map(rowToRule);
  }
}

/**
 * The real, live count of verified Non-QM lenders in the platform catalog —
 * copy-integrity fix (launch-hardening spec, Section 5): the pricing page's
 * "N currently verified lenders" claim must never be a hand-maintained
 * number that silently drifts from reality. Reuses listLenders's own
 * verified-only filtering (getVerifiedLenderIds — "the quarantine") with
 * MAX_TIER_LEVEL so it counts every verified lender regardless of tier, not
 * just what one caller's own plan can see — the exact same code path
 * getCatalogForMatching already relies on, so there is exactly one
 * definition of "verified" anywhere in the app, never two that can drift.
 */
export async function getVerifiedLenderCount(supabase: SupabaseClient): Promise<number> {
  const repo = new SupabaseRepository(supabase);
  const lenders = await repo.listLenders(PLATFORM_CATALOG_ORGANIZATION_ID, MAX_TIER_LEVEL);
  return lenders.length;
}
