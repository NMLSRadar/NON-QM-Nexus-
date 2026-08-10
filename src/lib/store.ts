import type { Lender, Program, Rule } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";
import type { ProgramCatalog } from "@/domain/analyze";
import type { LenderFlexibilityProfile } from "@/domain/lenderPosture";
import { sampleLenders, samplePrograms } from "@/data/sampleLenders";
import { sampleRules } from "@/data/sampleRules";
import { sampleScenarios } from "@/data/sampleScenarios";
import { seedProfiles } from "@/domain/lenderPosture";

/** Input for the chatbot feedback / unanswered-questions flywheel. */
export interface ChatFeedbackInput {
  question: string;
  answer?: string;
  rating: boolean; // true = up, false = down
  reason?: string;
  intent?: string;
  promptVersion?: string;
}

export interface ChatUnansweredInput {
  question: string;
  intent?: string;
  reason?: "non_answer" | "thumbs_down";
  normalization?: string;
}

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
  /** Same shape as getCatalog, but for SCENARIO MATCHING only — includes
   * every active, verified lender/program regardless of the caller's
   * subscription tier. Tier gating for matching happens at DISPLAY time
   * (an eligible lender above the viewer's tier is still shown, just
   * locked — see the scenario-results membership-tier protection rule),
   * never by hiding it from the matching engine entirely. */
  getCatalogForMatching(organizationId: string): Promise<ProgramCatalog>;
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
  /** The org's EDITORIAL lender-flexibility profiles (chatbot Part 2). Returns
   * the org-editable defaults when the org hasn't customized any yet. These are
   * advisory metadata, never guideline data — see docs/lender-posture.md. */
  listLenderFlexibilityProfiles(organizationId: string): Promise<LenderFlexibilityProfile[]>;
  /** Record explicit thumbs up/down feedback (flywheel). */
  recordChatFeedback(organizationId: string, userId: string, input: ChatFeedbackInput): Promise<void>;
  /** Record a non-answer / thumbs-down into the admin's unanswered queue. */
  recordChatUnanswered(organizationId: string, userId: string, input: ChatUnansweredInput): Promise<void>;
}

const DEMO_ORG = "org_demo";

class InMemoryRepository implements Repository {
  private scenarios = new Map<string, Scenario>(sampleScenarios.map((s) => [s.id, s]));

  async getCatalog(organizationId: string): Promise<ProgramCatalog> {
    this.assertOrg(organizationId);
    return { lenders: sampleLenders, programs: samplePrograms, rules: sampleRules };
  }

  async getCatalogForMatching(organizationId: string): Promise<ProgramCatalog> {
    // The demo store has no tier gating at all, so matching already sees
    // everything — identical to getCatalog.
    return this.getCatalog(organizationId);
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

  async listLenderFlexibilityProfiles(organizationId: string): Promise<LenderFlexibilityProfile[]> {
    this.assertOrg(organizationId);
    return seedProfiles(organizationId);
  }

  async recordChatFeedback(_organizationId: string, _userId: string, _input: ChatFeedbackInput): Promise<void> {
    // Demo store: no-op (feedback is a production persistence concern).
  }

  async recordChatUnanswered(_organizationId: string, _userId: string, _input: ChatUnansweredInput): Promise<void> {
    // Demo store: no-op.
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
