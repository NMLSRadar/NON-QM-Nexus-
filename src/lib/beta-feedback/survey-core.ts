// Survey state machine + persistence, extracted from the server actions so the
// exact same logic exercised in tests (scripts/test-beta-feedback.ts with an
// in-memory client) is what the deployed actions run. Everything here is pure
// conversion + a client argument — no env, no RSC guards.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BETA_SURVEY_QUESTIONS,
  BETA_SURVEY_TOTAL,
  classifyStatus,
  completionPercent,
  type SurveyAnswerValue,
  type SurveyStatus,
} from "./definitions";
import { loadSurveyByToken } from "./service";

const MAX_TEXT_LENGTH = 5000;

export function validForQuestion(qid: string, value: SurveyAnswerValue): boolean {
  const q = BETA_SURVEY_QUESTIONS.find((x) => x.id === qid);
  if (!q) return false;
  if (q.type === "rating") {
    if (typeof value !== "number" || !Number.isInteger(value)) return false;
    if (q.min !== undefined && value < q.min) return false;
    if (q.max !== undefined && value > q.max) return false;
    return true;
  }
  if (q.type === "choice") {
    return typeof value === "string" && (q.options ?? []).includes(value);
  }
  return typeof value === "string" && value.length <= MAX_TEXT_LENGTH;
}

/** Pure: merge one answer into stored responses and derive next state. */
export function computeNextState(
  existing: Record<string, SurveyAnswerValue>,
  qid: string,
  value: SurveyAnswerValue,
  currentStatus: string
): {
  responses: Record<string, SurveyAnswerValue>;
  answered: number;
  percent: number;
  status: string;
  done: boolean;
} {
  const nextResponses: Record<string, SurveyAnswerValue> = { ...existing };
  if (typeof value === "string" && value.trim() === "") {
    // Clearing an optional text answer removes it from the stored responses.
    delete nextResponses[qid];
  } else {
    nextResponses[qid] = value;
  }
  const percent = completionPercent(nextResponses);
  const status = classifyStatus(nextResponses, (currentStatus || null) as SurveyStatus);
  return {
    responses: nextResponses,
    answered: Object.values(nextResponses).filter((v) => v !== null && v !== undefined && String(v).trim() !== "").length,
    percent,
    status,
    done: status === "COMPLETED",
  };
}

export interface SaveAnswerResult {
  ok: boolean;
  error?: string;
  percent?: number;
  status?: string;
  done?: boolean;
}

export async function markOpened(supabase: SupabaseClient, token: string): Promise<{ ok: boolean }> {
  if (!token || token.length < 32) return { ok: false };
  const survey = await loadSurveyByToken(supabase, token);
  if (!survey) return { ok: false };
  if (survey.status === "NOT_SENT" || survey.status === "SENT") {
    const now = new Date().toISOString();
    await supabase
      .from("beta_tester_surveys")
      .update({ status: "OPENED", opened_at: survey.opened_at ?? now, updated_at: now })
      .eq("token", token);
  }
  return { ok: true };
}

export async function persistAnswer(
  supabase: SupabaseClient,
  token: string,
  qid: string,
  value: SurveyAnswerValue
): Promise<SaveAnswerResult> {
  if (!token || token.length < 32) return { ok: false, error: "Invalid survey link." };
  if (!validForQuestion(qid, value)) return { ok: false, error: "Invalid answer." };

  const survey = await loadSurveyByToken(supabase, token);
  if (!survey) return { ok: false, error: "This survey link is no longer valid." };

  const next = computeNextState(survey.responses ?? {}, qid, value, survey.status);
  const now = new Date().toISOString();
  const done = next.status === "COMPLETED";

  const patch: Record<string, unknown> = {
    responses: next.responses,
    completion_percentage: next.percent,
    status: next.status,
    last_answered_at: now,
    updated_at: now,
  };
  if (next.status === "STARTED") patch.started_at = survey.started_at ?? now;
  if (done) patch.completed_at = survey.completed_at ?? now;

  const { error } = await supabase.from("beta_tester_surveys").update(patch).eq("token", token);
  if (error) return { ok: false, error: error.message };

  return { ok: true, percent: next.percent, status: next.status, done };
}

export interface SubmitSurveyResult extends SaveAnswerResult {
  missingRequired?: string[];
}

export async function finalizeSurvey(supabase: SupabaseClient, token: string): Promise<SubmitSurveyResult> {
  if (!token || token.length < 32) return { ok: false, error: "Invalid survey link." };

  const survey = await loadSurveyByToken(supabase, token);
  if (!survey) return { ok: false, error: "This survey link is no longer valid." };

  const responses = survey.responses ?? {};
  const missingRequired = BETA_SURVEY_QUESTIONS.filter(
    (q) => q.required && (typeof responses[q.id] === "undefined" || String(responses[q.id]).trim() === "")
  ).map((q) => q.id);

  if (missingRequired.length > 0) {
    return {
      ok: false,
      error: "A few required questions are still unanswered.",
      missingRequired,
      percent: completionPercent(responses),
      status: survey.status,
    };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("beta_tester_surveys")
    .update({
      status: "COMPLETED",
      completed_at: survey.completed_at ?? now,
      completion_percentage: completionPercent(responses),
      updated_at: now,
    })
    .eq("token", token);
  if (error) return { ok: false, error: error.message };

  return { ok: true, done: true, status: "COMPLETED", percent: completionPercent(responses) };
}

export { BETA_SURVEY_TOTAL };