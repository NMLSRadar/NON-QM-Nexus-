// Integration tests for the Voice Scenario intake pipeline against the REAL
// Supabase project. Same skip-without-credentials convention as the other
// tests/integration/*.test.ts files.
//
// Complements tests/e2e/voiceIntakeSession.test.tsx (which drives the real
// <VoiceClient /> component and checks the Vitals tile + assistant summary
// with the server action mocked) by proving the OTHER end of the same
// session: once a transcript is complete, the exact production path
// (extractFromTranscript -> assess -> buildScenarioInput -> schema validation
// -> SupabaseRepository.saveScenario, the same functions createScenarioFromVoice
// itself calls) persists the correctly normalized loanPurpose value in the
// live database, for each of the four loan purposes.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { extractFromTranscript } from "@/domain/voice/extract";
import { assess, buildScenarioInput } from "@/domain/voice/dialog";
import { scenarioInputSchema } from "@/domain/validation/scenarioSchema";
import { SupabaseRepository } from "@/lib/repository/supabaseRepository";
import type { Scenario } from "@/domain/types/scenario";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

const BASE = "single family primary residence worth $500,000, loan amount 350k, credit score 720, full doc income";

/** Runs a transcript through the exact same functions createScenarioFromVoice
 * uses, then persists via the real repository — bypassing only the Next.js
 * server-action/request-cookie plumbing (which needs a live HTTP request),
 * not any domain or persistence logic. */
async function saveFromTranscript(repo: SupabaseRepository, org: string, userId: string, transcript: string): Promise<Scenario> {
  const extraction = extractFromTranscript(transcript);
  const assessment = assess(extraction);
  expect(assessment.complete, `expected transcript to be complete: "${transcript}" — missing ${assessment.missing.join(", ")}`).toBe(true);
  const input = buildScenarioInput(extraction, assessment);
  const parsed = scenarioInputSchema.parse(input);
  const now = new Date().toISOString();
  const scenario: Scenario = { ...parsed, id: randomUUID(), organizationId: org, createdByUserId: userId, createdAt: now, updatedAt: now };
  await repo.saveScenario(scenario);
  return scenario;
}

describe.skipIf(!hasCredentials)("Voice intake session: stored scenario record (live database)", () => {
  let admin: SupabaseClient;
  let userClient: SupabaseClient;
  let repo: SupabaseRepository;
  let userId: string;
  let organizationId: string;
  const savedScenarioIds: string[] = [];
  const testEmail = `nqn-voice-integration-${Date.now()}@gmail.com`;
  const testPassword = "Voice-Integration-Pw-123";

  beforeAll(async () => {
    admin = createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });
    if (createError || !created.user) throw new Error(`Failed to create test user: ${createError?.message}`);
    userId = created.user.id;

    userClient = createSupabaseClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    await userClient.auth.signInWithPassword({ email: testEmail, password: testPassword });

    const { data: membership } = await userClient.from("memberships").select("organization_id").eq("user_id", userId).maybeSingle();
    organizationId = membership!.organization_id as string;

    repo = new SupabaseRepository(userClient, userId);
  }, 30_000);

  afterAll(async () => {
    if (savedScenarioIds.length > 0) {
      await admin.from("scenarios").delete().in("id", savedScenarioIds);
    }
    if (organizationId) {
      await admin.from("memberships").delete().eq("organization_id", organizationId);
      await admin.from("organizations").delete().eq("id", organizationId);
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
  }, 30_000);

  const cases: Array<{ label: string; transcript: string; expected: string }> = [
    { label: "Purchase", transcript: `Purchase of a ${BASE}`, expected: "purchase" },
    { label: "Cash-Out Refinance", transcript: `The borrower wants to refinance and pull cash out of a ${BASE}`, expected: "cash_out_refinance" },
    { label: "Rate-and-Term Refinance", transcript: `They just want to lower their rate on a ${BASE}, not taking cash back`, expected: "rate_term_refinance" },
  ];

  for (const c of cases) {
    it(`${c.label}: persists loanPurpose="${c.expected}" in the stored scenario record`, async () => {
      const scenario = await saveFromTranscript(repo, organizationId, userId, c.transcript);
      savedScenarioIds.push(scenario.id);

      const { data: row, error } = await admin.from("scenarios").select("data").eq("id", scenario.id).single();
      expect(error).toBeNull();
      const stored = row!.data as { loanPurpose: string };
      expect(stored.loanPurpose).toBe(c.expected);
    });
  }

  it('Refinance (ambiguous, no subtype stated): the session stays incomplete and nothing is persisted', async () => {
    const extraction = extractFromTranscript(`This is a refinance of a ${BASE}`);
    const assessment = assess(extraction);
    expect(assessment.complete).toBe(false);
    expect(assessment.missing).toContain("loanPurpose");
    expect(assessment.prompt).toMatch(/Is the refinance rate-and-term or cash-out\?/);
    expect(() => buildScenarioInput(extraction, assessment)).toThrow();
  });
});
