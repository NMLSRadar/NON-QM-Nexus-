"use server";

// Survey server actions — the ONLY writer of survey responses besides the
// Day-3/Day-5 cron. Every call authenticates by the survey's secure token
// (lookup by token, never by a client-supplied row id), runs on the
// service-role client, and only ever touches the row whose token matches.
//
// The state machine + persistence live in src/lib/beta-feedback/survey-core.ts
// (client-injectable so the exact same logic is integration-tested with an
// in-memory database in scripts/test-beta-feedback.ts); these thin wrappers
// bind the real service-role client.

import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import type { SurveyAnswerValue } from "@/lib/beta-feedback/definitions";
import {
  finalizeSurvey,
  markOpened,
  persistAnswer,
  type SaveAnswerResult,
  type SubmitSurveyResult,
} from "@/lib/beta-feedback/survey-core";

/** Marks the survey OPENED the first time the tester opens the link. */
export async function markSurveyOpened(token: string): Promise<{ ok: boolean }> {
  return markOpened(createServiceRoleClient(), token);
}

/** Autosave one answer (and recompute status / completion % from the merged
 * responses). A partially-completed survey is never lost; re-opening the link
 * resumes exactly where they left off. */
export async function saveSurveyAnswer(
  token: string,
  qid: string,
  value: SurveyAnswerValue
): Promise<SaveAnswerResult> {
  return persistAnswer(createServiceRoleClient(), token, qid, value);
}

/** Explicit "Submit feedback" — finalizes the survey once every required
 * question has an answer (optional short-answer questions may be left blank).
 * A completed survey is immediately removed from the Day-5 follow-up queue. */
export async function submitSurvey(token: string): Promise<SubmitSurveyResult> {
  return finalizeSurvey(createServiceRoleClient(), token);
}