// Beta Tester Feedback — single source of truth for the survey's questions
// and status logic. Imported by the public survey page, its server actions,
// the Day-3/Day-5 cron, and the admin "Beta Tester Feedback" section, so the
// questionnaire, its answer options, and the aggregate analytics never drift
// between the places that use them.

export type SurveyAnswerValue = string | number;

/** Stored responses are `{ [questionId]: value }`. */
export type SurveyResponses = Record<string, SurveyAnswerValue>;

// One of the 7 admin statuses (spec): Not Sent, Sent, Opened, Started,
// Partially Completed, Completed, Follow-Up Sent.
export const SURVEY_STATUSES = [
  "NOT_SENT",
  "SENT",
  "OPENED",
  "STARTED",
  "PARTIALLY_COMPLETED",
  "COMPLETED",
  "FOLLOW_UP_SENT",
] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

export type QuestionType = "rating" | "choice" | "text";

export interface SurveyQuestion {
  id: string;
  type: QuestionType;
  title: string;
  /** Short caption describing a rating scale (e.g. "1 = very difficult"). */
  hint?: string;
  min?: number;
  max?: number;
  options?: string[];
  required: boolean;
}

export const BETA_SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "voice_ease",
    type: "rating",
    min: 1,
    max: 5,
    hint: "1 = very difficult, 5 = very easy",
    title: "How easy was the Voice Scenario feature to use?",
    required: true,
  },
  {
    id: "voice_accuracy",
    type: "rating",
    min: 1,
    max: 5,
    title: "How accurately did Voice Scenario understand your loan scenario?",
    required: true,
  },
  {
    id: "reco_accuracy",
    type: "rating",
    min: 1,
    max: 5,
    title: "How accurate were the lender and program recommendations?",
    required: true,
  },
  {
    id: "realistic_lenders",
    type: "choice",
    options: ["Yes", "Somewhat", "No"],
    title: "Did the platform identify lenders or programs you would realistically consider using?",
    required: true,
  },
  {
    id: "voice_missed",
    type: "text",
    title: "Did Voice Scenario misunderstand or fail to capture anything?",
    required: false,
  },
  {
    id: "assistant_helpful",
    type: "rating",
    min: 1,
    max: 5,
    title: "How helpful was the AI Assistant when asking Non-QM questions?",
    required: true,
  },
  {
    id: "assistant_accuracy",
    type: "rating",
    min: 1,
    max: 5,
    title: "How accurate did you feel the AI Assistant's answers were?",
    required: true,
  },
  {
    id: "assistant_concise",
    type: "rating",
    min: 1,
    max: 5,
    title: "Were the AI Assistant responses concise and easy to understand?",
    required: true,
  },
  {
    id: "nav_ease",
    type: "rating",
    min: 1,
    max: 5,
    title: "How easy was NON-QM Nexus to navigate overall?",
    required: true,
  },
  {
    id: "saves_time",
    type: "choice",
    options: ["Yes", "Somewhat", "No"],
    title: "Do you believe NON-QM Nexus could save you time compared with manually searching lender guidelines?",
    required: true,
  },
  {
    id: "daily_ops",
    type: "choice",
    options: ["Definitely", "Probably", "Maybe", "Probably Not", "No"],
    title: "Would NON-QM Nexus benefit you in your daily operations as a loan officer or mortgage professional?",
    required: true,
  },
  {
    id: "best_feature",
    type: "choice",
    options: ["Voice Scenario", "AI Assistant", "Lender List", "Programs", "Documentation Requirements"],
    title: "Which feature provided the most value?",
    required: true,
  },
  {
    id: "confidence",
    type: "rating",
    min: 1,
    max: 10,
    hint: "1 = not at all confident, 10 = fully confident",
    title: "How confident would you feel using NON-QM Nexus to identify a lender for a real borrower scenario?",
    required: true,
  },
  {
    id: "time_saved_est",
    type: "choice",
    options: ["Less than 5 minutes", "5–15 minutes", "15–30 minutes", "30–60 minutes", "More than 1 hour"],
    title: "Approximately how much time could NON-QM Nexus save you on a typical Non-QM scenario?",
    required: true,
  },
  {
    id: "one_improvement",
    type: "text",
    title: "What is the ONE thing we should improve before officially launching?",
    required: true,
  },
  {
    id: "expected_missing",
    type: "text",
    title: "Was there anything you expected NON-QM Nexus to do that it currently does not?",
    required: false,
  },
  {
    id: "recommend",
    type: "rating",
    min: 0,
    max: 10,
    hint: "0 = not at all likely, 10 = extremely likely",
    title: "How likely would you be to recommend NON-QM Nexus to another loan officer or mortgage broker?",
    required: true,
  },
  {
    id: "paid_member",
    type: "choice",
    options: ["Yes", "Maybe", "No"],
    title: "After testing the platform, would you personally consider becoming a paid member?",
    required: true,
  },
  {
    id: "use_regularly",
    type: "text",
    title: "What would make NON-QM Nexus something you would want to use regularly?",
    required: false,
  },
];

export const BETA_SURVEY_TOTAL = BETA_SURVEY_QUESTIONS.length;

/** True when a stored answer counts as "answered" (text may be blank). */
export function isAnswered(value: SurveyAnswerValue | null | undefined): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

/** Count of answered questions in the stored responses. */
export function answeredCount(responses: SurveyResponses): number {
  let count = 0;
  for (const q of BETA_SURVEY_QUESTIONS) {
    if (isAnswered(responses[q.id])) count += 1;
  }
  return count;
}

/** Completion percentage 0..100, derived only from the stored responses. */
export function completionPercent(responses: SurveyResponses): number {
  return Math.round((answeredCount(responses) / BETA_SURVEY_TOTAL) * 100);
}

/**
 * Deterministic status from how many answers are on file — safe under resume
 * (re-loading a partially-completed survey yields the same status) and safe
 * under a second scheduled sweep (a completed survey is never re-opened).
 */
export function classifyStatus(
  responses: SurveyResponses,
  current: SurveyStatus | null
): SurveyStatus {
  const n = answeredCount(responses);
  if (n === BETA_SURVEY_TOTAL) return "COMPLETED";
  if (n === 1) return "STARTED";
  if (n > 1) return "PARTIALLY_COMPLETED";
  // Zero answered. Keep any already-reached progress state rather than
  // moving backwards; otherwise "OPENED" is the most truthful signal.
  if (current === "STARTED" || current === "PARTIALLY_COMPLETED") return current;
  return "OPENED";
}

/** Survey status labels shown in the admin UI. */
export const SURVEY_STATUS_LABELS: Record<SurveyStatus, string> = {
  NOT_SENT: "Not Sent",
  SENT: "Sent",
  OPENED: "Opened",
  STARTED: "Started",
  PARTIALLY_COMPLETED: "Partially Completed",
  COMPLETED: "Completed",
  FOLLOW_UP_SENT: "Follow-Up Sent",
};

/** Shared across the table + admin, so "Most valuable feature" stays in sync. */
export const TIME_SAVED_LABELS = ["Less than 5 minutes", "5–15 minutes", "15–30 minutes", "30–60 minutes", "More than 1 hour"] as const;

/** Approximate midpoint (minutes) per "time saved" option, for the average. */
export const TIME_SAVED_MINUTES: Record<(typeof TIME_SAVED_LABELS)[number], number> = {
  "Less than 5 minutes": 2.5,
  "5–15 minutes": 10,
  "15–30 minutes": 22.5,
  "30–60 minutes": 45,
  "More than 1 hour": 75,
};