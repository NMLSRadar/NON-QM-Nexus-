import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repository } from "@/lib/store";
import type { Lender, Program, Rule } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
import type { ProgramCatalog } from "@/domain/analyze";
import { getEffectivePlan } from "./membership";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";

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

function rowToScenario(row: ScenarioRow): Scenario {
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

  async listLenders(organizationId: string): Promise<Lender[]> {
    // Catalog data is shared platform-wide, not scoped to the caller's own
    // organization — see docs on PLATFORM_CATALOG_ORGANIZATION_ID. The
    // `organizationId` parameter is kept for interface stability (and is
    // still what InMemoryRepository uses) but intentionally unused here.
    void organizationId;
    const tier = await this.getEffectiveTier();
    const { data, error } = await this.supabase
      .from("lenders")
      .select("id, organization_id, name, is_sample_data, active, contact_email, notes, tier_level")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .eq("is_sample_data", false)
      .lte("tier_level", tier)
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to list lenders: ${error.message}`);
    return (data as LenderRow[]).map(rowToLender);
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

  async listPrograms(organizationId: string): Promise<Program[]> {
    void organizationId;
    const tier = await this.getEffectiveTier();
    const { data, error } = await this.supabase
      .from("programs")
      .select("id, organization_id, lender_id, name, is_sample_data, active, config, lenders!inner(tier_level)")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .eq("is_sample_data", false)
      .lte("lenders.tier_level", tier)
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to list programs: ${error.message}`);
    return (data as unknown as ProgramRow[]).map(rowToProgram);
  }

  async listRules(organizationId: string): Promise<Rule[]> {
    void organizationId;
    const tier = await this.getEffectiveTier();
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
