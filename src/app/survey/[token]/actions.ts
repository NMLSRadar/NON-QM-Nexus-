"use server";

// Survey server actions — the ONLY writer of survey responses besides the
// Day-3/Day-5 cron. Every call authenticates by the survey's secure token
// (lookup by token, never by a client-supplied row id), runs on the
// service-role client, and only ever touches the row whose token matches.

import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import {
  BETA_SURVEY_QUESTIONS,
  classifyStatus,
  completionPercent,
  type SurveyAnswerValue,
} from "@/lib/beta-feedback/definitions";
import { loadSurveyByToken, type BetaSurveyRow } from "@/lib/beta-feedback/service";

const MAX_TEXT_LENGTH = 5000;

function validForQuestion(qid: string, value: SurveyAnswerValue): boolean {
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
  // text
  return typeof value === "string" && value.length <= MAX_TEXT_LENGTH;
}

/** Marks the survey OPENED the first time the tester opens the link. */
export async function markSurveyOpened(token: string): Promise<{ ok: boolean }> {
  if (!token || token.length < 32) return { ok: false };
  const supabase = createServiceRoleClient();
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

export interface SaveAnswerResult {
  ok: boolean;
  error?: string;
  percent?: number;
  status?: string;
  done?: boolean;
}

/**
 * Autosave one answer (and recompute status / completion % from the merged
 * responses). Called on every answer change — a partially-completed survey is
 * never lost, and re-opening the link resumes exactly where they left off.
 */
export async function saveSurveyAnswer(
  token: string,
  qid: string,
  value: SurveyAnswerValue
): Promise<SaveAnswerResult> {
  if (!token || token.length < 32) return { ok: false, error: "Invalid survey link." };
  if (!validForQuestion(qid, value)) return { ok: false, error: "Invalid answer." };

  const supabase = createServiceRoleClient();
  const survey = await loadSurveyByToken(supabase, token);
  if (!survey) return { ok: false, error: "This survey link is no longer valid." };

  const nextResponses: Record<string, SurveyAnswerValue> = {
    ...(survey.responses ?? {}),
  };
  if (typeof value === "string" && value.trim() === "") {
    // Clearing an optional text answer removes it from the stored responses.
    delete nextResponses[qid];
  } else {
    nextResponses[qid] = value;
  }

  const percent = completionPercent(nextResponses);
  const status = classifyStatus(nextResponses, survey.status);
  const now = new Date().toISOString();
  const done = status === "COMPLETED";

  const patch: Record<string, unknown> = {
    responses: nextResponses,
    completion_percentage: percent,
    status,
    last_answered_at: now,
    updated_at: now,
  };
  if (status === "STARTED") patch.started_at = survey.started_at ?? now;
  if (done) patch.completed_at = survey.completed_at ?? now;

  const { error } = await supabase
    .from("beta_tester_surveys")
    .update(patch)
    .eq("token", token);
  if (error) return { ok: false, error: error.message };

  return { ok: true, percent, status, done };
}

export interface SubmitSurveyResult extends SaveAnswerResult {
  missingRequired?: string[];
}

/**
 * Explicit "Submit feedback" — finalizes the survey once every required
 * question has an answer (optional short-answer questions may be left blank).
 * A completed survey is immediately removed from the Day-5 follow-up queue.
 */
export async function submitSurvey(token: string): Promise<SubmitSurveyResult> {
  if (!token || token.length < 32) return { ok: false, error: "Invalid survey link." };

  const supabase = createServiceRoleClient();
  const survey: BetaSurveyRow | null = await loadSurveyByToken(supabase, token);
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