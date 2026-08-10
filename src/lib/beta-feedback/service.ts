// Beta Tester Feedback — data operations shared by the survey page, its server
// actions, the Day-3/Day-5 cron, and the admin section. Everything authenticates
// by the survey's secure token (service-role, server-only) or by an admin
// session; no function here trusts client-supplied row ids.
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BETA_SURVEY_QUESTIONS,
  TIME_SAVED_LABELS,
  TIME_SAVED_MINUTES,
  answeredCount,
  completionPercent,
  isAnswered,
  type SurveyResponses,
  type SurveyStatus,
} from "./definitions";

/** Unforgeable 64-char survey link token. */
export function generateSurveyToken(): string {
  return randomBytes(32).toString("hex");
}

/** Row shape as read back from beta_tester_surveys. */
export interface BetaSurveyRow {
  id: string;
  user_id: string;
  trial_redemption_id: string | null;
  trial_started_at: string;
  status: SurveyStatus;
  token: string;
  day3_email_sent_at: string | null;
  day3_email_id: string | null;
  opened_at: string | null;
  started_at: string | null;
  last_answered_at: string | null;
  completed_at: string | null;
  completion_percentage: number;
  day5_follow_up_sent_at: string | null;
  day5_email_id: string | null;
  responses: SurveyResponses;
  created_at: string;
  updated_at: string;
}

export type { SurveyStatus };

/** Load a survey by its secure token, or null if it doesn't exist. */
export async function loadSurveyByToken(
  supabase: SupabaseClient,
  token: string
): Promise<BetaSurveyRow | null> {
  const { data } = await supabase
    .from("beta_tester_surveys")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  return (data as BetaSurveyRow | null) ?? null;
}

export interface RedemptionStub {
  id: string;
  user_id: string;
  activated_at: string;
}

/**
 * Create the survey row for a redemption if it doesn't exist (idempotent via
 * the unique user_id). Used by the Day-3/Day-5 cron as a backfill so that
 * every beta tester — including ones already mid-trial when this shipped —
 * gets a survey row and a Day-3 email. trial_started_at is always the exact
 * redemption activated_at.
 */
export async function ensureSurveyForRedemption(
  supabase: SupabaseClient,
  redemption: RedemptionStub
): Promise<BetaSurveyRow> {
  const token = generateSurveyToken();
  const { data } = await supabase
    .from("beta_tester_surveys")
    .upsert(
      {
        user_id: redemption.user_id,
        trial_redemption_id: redemption.id,
        trial_started_at: redemption.activated_at,
        status: "NOT_SENT",
        token,
        responses: {},
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();
  if (!data) {
    // The conflict means the row already exists (or a rare token collision) —
    // re-read it so we never create a duplicate.
    const { data: existing } = await supabase
      .from("beta_tester_surveys")
      .select("*")
      .eq("user_id", redemption.user_id)
      .maybeSingle();
    if (existing) return existing as BetaSurveyRow;
    throw new Error("beta_tester_surveys.upsert returned no row");
  }
  return data as BetaSurveyRow;
}

// ---------------------------------------------------------------------------
// Admin display + aggregate analytics (single source of truth so the admin
// table and the analytics cards never disagree).
// ---------------------------------------------------------------------------

export interface SurveySummaryRow extends BetaSurveyRow {
  // Join data from the corresponding trial_redemptions row (email/name).
  email: string;
  first_name: string | null;
  last_name: string | null;
  // Derived display fields shared by the admin table + analytics.
  overall_rating: number | null;
  voice_scenario_rating: number | null;
  voice_accuracy_rating: number | null;
  ai_assistant_rating: number | null;
  ai_accuracy_rating: number | null;
  likelihood_to_recommend: number | null;
  would_become_paid_member: string | null;
  estimated_time_saved: string | null;
  written_feedback: string[];
}

/** The flat per-tester fields shown in the admin "Beta Tester Feedback" table. */
export function buildSurveySummary(
  survey: BetaSurveyRow,
  redemption?: { email?: string; first_name?: string | null; last_name?: string | null } | null
): SurveySummaryRow {
  const r = survey.responses ?? {};
  const ratingSet = ["voice_ease", "voice_accuracy", "reco_accuracy", "assistant_helpful", "assistant_accuracy", "assistant_concise", "nav_ease"];
  const numeric = (q: string): number | null => {
    const v = r[q];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const overallVals = ratingSet.map(numeric).filter((v): v is number => v !== null);
  const written = ["one_improvement", "expected_missing", "use_regularly"]
    .map((q) => (typeof r[q] === "string" && String(r[q]).trim() ? String(r[q]).trim() : null))
    .filter((v): v is string => v !== null);

  return {
    ...survey,
    email: redemption?.email ?? "",
    first_name: redemption?.first_name ?? null,
    last_name: redemption?.last_name ?? null,
    overall_rating: overallVals.length ? +(overallVals.reduce((a, b) => a + b, 0) / overallVals.length).toFixed(2) : null,
    voice_scenario_rating: numeric("voice_ease"),
    voice_accuracy_rating: numeric("voice_accuracy"),
    ai_assistant_rating: numeric("assistant_helpful"),
    ai_accuracy_rating: numeric("assistant_accuracy"),
    likelihood_to_recommend: numeric("recommend"),
    would_become_paid_member: typeof r.paid_member === "string" ? (r.paid_member as string) : null,
    estimated_time_saved: typeof r.time_saved_est === "string" ? (r.time_saved_est as string) : null,
    written_feedback: written,
  };
}

export interface FeedbackAggregate {
  totalTesters: number;
  surveysSent: number;
  responseRate: number | null; // % of sent that opened
  completionRate: number | null; // % of sent that completed
  avgVoiceScenarioRating: number | null;
  avgVoiceAccuracyRating: number | null;
  avgAiAssistantRating: number | null;
  avgAiAccuracyRating: number | null;
  avgPlatformEase: number | null;
  avgRecommendation: number | null;
  pctWouldPay: number | null;
  mostValuableFeature: string[]; // top feature(s) by votes
  avgTimeSavedMinutes: number | null;
  mostCommonImprovementRequests: Array<{ text: string; count: number }>;
}

function avg(nums: Array<number | null>): number | null {
  const vals = nums.filter((v): v is number => v !== null);
  if (!vals.length) return null;
  return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
}

function topByCount(items: Array<string | null>, top = 1): string[] {
  const counts: Record<string, number> = {};
  for (const it of items) {
    if (!it || !String(it).trim()) continue;
    const key = String(it).trim();
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const entries: Array<[string, number]> = (Object.keys(counts) as string[]).map((k) => [k, counts[k] as number]);
  const max = entries.reduce((a, [, c]) => Math.max(a, c), 0);
  return max > 0 ? entries.filter(([, c]) => c === max).map(([k]) => k).slice(0, top) : [];
}

export function aggregateFeedback(rows: SurveySummaryRow[]): FeedbackAggregate {
  const sent = rows.filter((r) => r.day3_email_sent_at || r.day3_email_id);
  // "Opened" means the tester actually opened the survey link (or went past
  // opening into answering) — a FOLLOW_UP_SENT status alone does NOT mean
  // they opened it (the follow-up goes out to sent-but-never-opened testers).
  const opened = rows.filter(
    (r) => r.opened_at || ["OPENED", "STARTED", "PARTIALLY_COMPLETED", "COMPLETED"].includes(r.status)
  );
  const completed = rows.filter((r) => r.status === "COMPLETED");
  const r = (q: string) => rows.map((row) => (typeof row.responses?.[q] === "number" ? (row.responses[q] as number) : null));

  const paidAnswers = rows.map((row) => (typeof row.responses?.paid_member === "string" ? row.responses.paid_member as string : null));
  const paidYes = paidAnswers.filter((v) => v === "Yes" || v === "Maybe").length;
  const paidAnswered = paidAnswers.filter((v) => v !== null).length;

  const timeAnswered = rows
    .map((row) => {
      const v = row.responses?.time_saved_est;
      return typeof v === "string" && TIME_SAVED_LABELS.includes(v as (typeof TIME_SAVED_LABELS)[number]) ? TIME_SAVED_MINUTES[v as (typeof TIME_SAVED_LABELS)[number]] : null;
    })
    .filter((v): v is number => v !== null);

  // Most common improvement requests: tally the trimmed "ONE thing to improve"
  // verbatims. Exact-equivalent copies group together; the raw list is still
  // shown per-tester so nothing is hidden.
  const improveCounts: Record<string, number> = {};
  for (const row of rows) {
    const v = row.responses?.one_improvement;
    if (typeof v === "string" && String(v).trim()) {
      const key = String(v).trim();
      improveCounts[key] = (improveCounts[key] ?? 0) + 1;
    }
  }
  const mostCommonImprovements = Object.keys(improveCounts)
    .map((text) => ({ text, count: improveCounts[text] as number }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    totalTesters: rows.length,
    surveysSent: sent.length,
    responseRate: sent.length ? +((opened.length / sent.length) * 100).toFixed(1) : null,
    completionRate: sent.length ? +((completed.length / sent.length) * 100).toFixed(1) : null,
    avgVoiceScenarioRating: avg(r("voice_ease")),
    avgVoiceAccuracyRating: avg(r("voice_accuracy")),
    avgAiAssistantRating: avg(r("assistant_helpful")),
    avgAiAccuracyRating: avg(r("assistant_accuracy")),
    avgPlatformEase: avg(r("nav_ease")),
    avgRecommendation: avg(r("recommend")),
    pctWouldPay: paidAnswered ? +((paidYes / paidAnswered) * 100).toFixed(1) : null,
    mostValuableFeature: topByCount(rows.map((row) => (typeof row.responses?.best_feature === "string" ? (row.responses.best_feature as string) : null))),
    avgTimeSavedMinutes: timeAnswered.length ? +(timeAnswered.reduce((a, b) => a + b, 0) / timeAnswered.length).toFixed(1) : null,
    mostCommonImprovementRequests: mostCommonImprovements,
  };
}

/** True when a survey should get the Day-5 follow-up (i.e. not fully completed). */
export function needsFollowUp(survey: BetaSurveyRow): boolean {
  return survey.status !== "COMPLETED";
}

export { answeredCount, completionPercent, isAnswered, BETA_SURVEY_QUESTIONS };