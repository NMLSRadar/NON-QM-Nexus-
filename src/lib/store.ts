import type { Lender, Program, Rule } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
import type { ProgramCatalog } from "@/domain/analyze";
import { sampleLenders, samplePrograms } from "@/data/sampleLenders";
import { sampleRules } from "@/data/sampleRules";
import { sampleScenarios } from "@/data/sampleScenarios";

/**
 * Repository interface for the demo application.
 *
 * DEVELOPMENT/DEMO ONLY: this in-memory implementation is seeded with clearly
 * labeled fictional data so the full workflow can be exercised without a
 * database. The production path replaces this module with a Prisma/Supabase
 * implementation (see docs/architecture.md and prisma/schema.prisma); the
 * calling code depends only on this interface.
 */
export interface Repository {
  getCatalog(organizationId: string): Promise<ProgramCatalog>;
  listScenarios(organizationId: string): Promise<Scenario[]>;
  getScenario(organizationId: string, id: string): Promise<Scenario | null>;
  saveScenario(scenario: Scenario): Promise<Scenario>;
  listLenders(organizationId: string): Promise<Lender[]>;
  /** Every lender in the org, regardless of the caller's subscription tier
   * — used by the Lenders directory page so lender VISIBILITY is never
   * gated by plan (only actual guideline/program data is — see
   * listPrograms, which remains tier-filtered). */
  listAllLenders(organizationId: string): Promise<Lender[]>;
  listPrograms(organizationId: string): Promise<Program[]>;
  listRules(organizationId: string): Promise<Rule[]>;
  /** Tier-gated (but NOT verification-gated) list of lenders that are
   * visible-but-pending-review — i.e. active, tier-eligible for the
   * caller, but not yet promoted to human_verified. Returns ONLY the
   * lender name and each program's name + incomeDocTypes — deliberately
   * never a numeric guideline field (LTV/FICO/loan amount/etc.), so this
   * can never be a backdoor around the verified-only gate on
   * listLenders/listPrograms. Used by the AI assistant so it can say "X
   * appears to offer this program, but it's still pending guideline
   * review" instead of having zero awareness that a pending lender
   * exists at all (see Brokers First Funding integration, 2026-07-28). */
  listPendingReviewLenderPrograms(organizationId: string): Promise<Array<{ lenderName: string; programName: string; incomeDocTypes: string[] }>>;
}

const DEMO_ORG = "org_demo";

class InMemoryRepository implements Repository {
  private scenarios = new Map<string, Scenario>(sampleScenarios.map((s) => [s.id, s]));

  async getCatalog(organizationId: string): Promise<ProgramCatalog> {
    this.assertOrg(organizationId);
    return { lenders: sampleLenders, programs: samplePrograms, rules: sampleRules };
  }

  async listScenarios(organizationId: string): Promise<Scenario[]> {
    this.assertOrg(organizationId);
    return [...this.scenarios.values()].filter((s) => s.organizationId === organizationId);
  }

  async getScenario(organizationId: string, id: string): Promise<Scenario | null> {
    this.assertOrg(organizationId);
    const s = this.scenarios.get(id);
    return s && s.organizationId === organizationId ? s : null;
  }

  async saveScenario(scenario: Scenario): Promise<Scenario> {
    this.assertOrg(scenario.organizationId);
    this.scenarios.set(scenario.id, { ...scenario, updatedAt: new Date().toISOString() });
    return scenario;
  }

  async listLenders(organizationId: string): Promise<Lender[]> {
    this.assertOrg(organizationId);
    return sampleLenders;
  }

  async listAllLenders(organizationId: string): Promise<Lender[]> {
    this.assertOrg(organizationId);
    return sampleLenders;
  }

  async listPrograms(organizationId: string): Promise<Program[]> {
    this.assertOrg(organizationId);
    return samplePrograms;
  }

  async listRules(organizationId: string): Promise<Rule[]> {
    this.assertOrg(organizationId);
    return sampleRules;
  }

  async listPendingReviewLenderPrograms(organizationId: string): Promise<Array<{ lenderName: string; programName: string; incomeDocTypes: string[] }>> {
    this.assertOrg(organizationId);
    return []; // demo store has no verification-status concept; nothing pending by construction
  }

  // Tenant guard even in the demo store: callers must always scope by org.
  private assertOrg(organizationId: string): void {
    if (organizationId !== DEMO_ORG) {
      throw new Error("Unknown organization");
    }
  }
}

const globalStore = globalThis as unknown as { __repo?: Repository };

export function getRepository(): Repository {
  if (!globalStore.__repo) globalStore.__repo = new InMemoryRepository();
  return globalStore.__repo;
}

/** The demo session's organization. Real auth replaces this (Supabase Auth). */
export function getCurrentOrganizationId(): string {
  return DEMO_ORG;
}
