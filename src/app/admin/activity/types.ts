// Shared types for the /admin/activity "Active Users & Beta Testers" screen.
// Pure types + pure helpers so both the server page and the client table
// component can import them without pulling server-only code.

export type ActivityStatus =
  | "cancelled"
  | "trial_expired"
  | "trial_expiring"
  | "trial"
  | "paid"
  | "never_logged_in"
  | "inactive"
  | "no_plan";

export type ActivityFilter =
  | "total"
  | "paid"
  | "trial"
  | "beta"
  | "active7"
  | "active30"
  | "expired"
  | "inactive";

export type ActivitySort = "last_activity" | "created" | "logins" | "scenarios" | "trial_expiration";

export interface ActivityTimelineEvent {
  eventType: string;
  occurredAt: string;
}

export interface ActivityUserRow {
  id: string;
  email: string;
  displayName: string | null;
  nmlsId: string | null;
  isPlatformAdmin: boolean;
  createdAt: string;
  isBeta: boolean;
  betaGrantedAt: string | null;
  planName: string | null;
  tierLevel: number | null;
  canceledAt: string | null;
  isTrial: boolean;
  trialActivatedAt: string | null;
  trialExpiresAt: string | null;
  subscriptionStartedAt: string | null;
  source: string | null;
  currentPeriodEnd: string | null;
  status: ActivityStatus;
  lastLogin: string | null;
  lastActivity: string | null;
  logins: number;
  scenarios: number;
  voiceScenarios: number;
  aiAssistant: number;
  lenderList: number;
  programs: number;
  docNeeds: number;
  products: number;
  topFeature: string | null;
  /** Most recent 20 events, newest first (only populated for the current page). */
  timeline: ActivityTimelineEvent[];
}

export const STATUS_LABELS: Record<ActivityStatus, string> = {
  cancelled: "Cancelled",
  trial_expired: "Trial Expired",
  trial_expiring: "Trial Expiring",
  trial: "Trial",
  paid: "Paid",
  never_logged_in: "Never Logged In",
  inactive: "Inactive",
  no_plan: "No Plan",
};

export const FILTERS: { key: ActivityFilter; label: string; title: string }[] = [
  { key: "total", label: "Total", title: "All users" },
  { key: "paid", label: "Paid", title: "Active non-trial subscription" },
  { key: "trial", label: "Trials", title: "Active trials (incl. expiring)" },
  { key: "beta", label: "Beta", title: "Beta testers" },
  { key: "active7", label: "Active 7d", title: "Activity in the last 7 days" },
  { key: "active30", label: "Active 30d", title: "Activity in the last 30 days" },
  { key: "expired", label: "Expired", title: "Trials that have expired" },
  { key: "inactive", label: "Inactive", title: "No activity in 30+ days" },
];

export const SORTS: { key: ActivitySort; label: string }[] = [
  { key: "last_activity", label: "Last Activity" },
  { key: "created", label: "Created" },
  { key: "logins", label: "Logins" },
  { key: "scenarios", label: "Scenarios" },
  { key: "trial_expiration", label: "Trial Expiration" },
];

export const DAY_MS = 24 * 60 * 60 * 1000;

// Event TYPE union + labels. The type union also exists in @/lib/activity
// (server); the VALUE constants must live here (pure, client-safe) so the
// client <table> component never imports that server module. Keep in sync
// with src/lib/activity.ts's ACTIVITY_EVENT_TYPES.
export const ACTIVITY_EVENT_TYPES = [
  "login",
  "scenario_submitted",
  "voice_scenario",
  "ai_assistant",
  "lender_list",
  "programs",
  "doc_needs",
  "products",
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

/** Human labels for the admin timeline + "Top feature" column. */
export const ACTIVITY_LABELS: Record<ActivityEventType, string> = {
  login: "Logged in",
  scenario_submitted: "Submitted a scenario",
  voice_scenario: "Used Voice Scenario",
  ai_assistant: "Used AI Assistant",
  lender_list: "Viewed lender list",
  programs: "Viewed programs",
  doc_needs: "Viewed doc needs",
  products: "Viewed products",
};