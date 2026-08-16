# Build Task: Membership Management (Admin) — NON-QM Nexus

**Agent-agnostic build spec.** Written to be handed to whatever coding agent has repo access — Claude Code, Codex, or another harness. It requires a filesystem, git, database migrations, and a test runner, so it must be run by an agent that has those.

Save as `docs/tasks/04-membership-management.md`, commit, then instruct the agent:

> Read `docs/tasks/04-membership-management.md`. Start with Section 2 — inspect the existing membership, billing, and Trial Access Management code and report what already exists before writing anything. Section 03 (`docs/tasks/03-signup-attribution.md`) is a dependency; confirm whether it is implemented.

## 1. Goal

Build a **Membership Management** section in the admin area — the single place where every membership is tracked from first signup through cancellation and any reactivation.

Two non-negotiables:

1. **Attribution is admin-only.** Which rep brought in a membership is stored and displayed here and nowhere else. It is never visible to members, never exposed on any member-facing route, never returned by a member-scoped API. Enforced by RLS (platform-admin only) and by route-level authorization, not by hiding it in the UI.
2. **Every membership row carries its attributed rep.** Attribution is a first-class column and a filter on every view and every export in this section. That is the reason the section exists.

This depends on the attribution capture built in task 03. If that isn't implemented yet, build it first — this section has nothing to display without it.

## 2. First step: inspect before building

Report back before writing code:
- What membership/subscription state already exists in the schema, and whether Stripe (or another processor) is the source of truth for status.
- What Trial Access Management currently renders, so this extends it rather than duplicating it.
- Whether webhook events are persisted anywhere — cancellations and payment failures need an event trail, and re-deriving history from a status column is lossy.
- Whether task 03's `organization_attribution` table exists.

## 3. Membership lifecycle

Model status as an explicit enum with recorded transitions, not a mutable string:

```
trialing → active → past_due → cancelled → churned
                 ↘ cancelled_pending (cancels at period end, still has access)
churned → reactivated → active
trialing → trial_expired (never converted)
```

Two distinctions that matter and are usually collapsed by mistake:

- **Voluntary vs involuntary churn.** A cancellation is a product problem. A failed card is a dunning problem and is often recoverable. Reporting them as one number hides a fixable revenue leak.
- **`cancelled_pending` vs `cancelled`.** Someone who cancelled but still has 19 days of access is a save opportunity. Someone whose access already lapsed is a win-back. Different lists, different actions.

Persist every transition to a `membership_events` table: org, from status, to status, reason, source (`webhook` / `admin` / `system`), actor, timestamp. Derive history from events; never overwrite it.

## 4. Data model

```sql
BEGIN;

CREATE TABLE "memberships" (
  "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"       UUID NOT NULL,
  "status"                TEXT NOT NULL,        -- see Section 3
  "plan_tier"             TEXT NOT NULL,        -- monthly | annual | beta | comp
  "seat_count"            INTEGER NOT NULL DEFAULT 1,
  "mrr_cents"             INTEGER NOT NULL DEFAULT 0,
  "billing_interval"      TEXT,                 -- month | year
  "processor_customer_id" TEXT,
  "processor_sub_id"      TEXT,
  "trial_started_at"      TIMESTAMPTZ,
  "trial_ends_at"         TIMESTAMPTZ,
  "converted_at"          TIMESTAMPTZ,          -- trial → first paid
  "current_period_end"    TIMESTAMPTZ,
  "cancel_requested_at"   TIMESTAMPTZ,
  "access_ends_at"        TIMESTAMPTZ,          -- when access actually lapses
  "churned_at"            TIMESTAMPTZ,
  "churn_type"            TEXT,                 -- voluntary | involuntary
  "churn_reason"          TEXT,
  "churn_reason_detail"   TEXT,
  "reactivated_at"        TIMESTAMPTZ,
  "reactivation_count"    INTEGER NOT NULL DEFAULT 0,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memberships_org_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "memberships_org_unique" ON "memberships"("organization_id");
CREATE INDEX "memberships_status_idx" ON "memberships"("status", "updated_at");
CREATE INDEX "memberships_churn_idx" ON "memberships"("churned_at");

CREATE TABLE "membership_events" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "from_status"     TEXT,
  "to_status"       TEXT NOT NULL,
  "reason"          TEXT,
  "source"          TEXT NOT NULL,   -- webhook | admin | system
  "actor_user_id"   UUID,
  "mrr_delta_cents" INTEGER NOT NULL DEFAULT 0,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "membership_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "membership_events_org_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE INDEX "membership_events_org_idx" ON "membership_events"("organization_id", "created_at");
CREATE INDEX "membership_events_period_idx" ON "membership_events"("created_at", "to_status");

CREATE TABLE "membership_notes" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "author_user_id"  UUID NOT NULL,
  "body"            TEXT NOT NULL,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "membership_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "membership_notes_org_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id") ON DELETE CASCADE
);

ALTER TABLE "memberships"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership_notes"  ENABLE ROW LEVEL SECURITY;

-- Admin-only across the board. Match the repo's current policy helper names.
CREATE POLICY "memberships_admin" ON "memberships"
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "membership_events_admin" ON "membership_events"
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "membership_notes_admin" ON "membership_notes"
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

COMMIT;
```

Transaction-wrapped, FKs present, unique index on org. After applying, run `prisma migrate resolve --applied <name>` so Prisma doesn't report drift.

A member-facing "your plan" view reads only status and renewal date, through a separate narrowly-scoped query. It must never join to `organization_attribution`.

## 5. Metrics — define these precisely

Ambiguous churn math is worse than none. Implement each as a pure, tested function in `src/domain/memberships/metrics.ts` with the definition in a doc comment.

**Logo churn (monthly)**
`churned_in_month ÷ active_at_month_start`. Exclude trials — a trial that never converts is a conversion failure, not churn, and mixing them makes both numbers meaningless.

**Revenue churn (monthly)**
`MRR_lost_in_month ÷ MRR_at_month_start`. Track separately from logo churn; losing one big account is different from losing one small one.

**Net revenue retention**
`(starting_MRR + expansion − contraction − churned) ÷ starting_MRR`. Meaningful once you have tier upgrades; ship the field now, display when there's data.

**Retention rate** = `1 − logo churn`. Show alongside the raw counts, never alone — "94% retention" on 17 accounts is noise, and the UI should say so by displaying the denominator.

**Trial → paid conversion** = `converted ÷ trials_started_in_cohort`. Cohort by trial start month, not by conversion month.

**Median time to conversion** — days from `trial_started_at` to `converted_at`. Median, not mean; one outlier distorts the mean badly at low volume.

**Average membership lifetime** and **LTV** = `avg_MRR × avg_lifetime_months`. Mark as low-confidence until you have at least a few complete lifecycles.

**Per-rep versions of all of the above.** This is the point of the section: not just who signed up whom, but whose signups stayed.

## 6. UI — five tabs under Membership Management

### 6.1 Overview

Top strip: Active memberships · MRR · Retention rate (with denominator) · Trials in flight · Churned this month · Unattributed count.

Then:
- MRR trend, 12 months
- Active membership count trend
- **Attribution split** — active memberships and MRR by rep, with unattributed always shown even at zero
- Alerts row: payment failures needing action, trials expiring in 7 days, cancellations pending, active payers with zero usage in 30 days

### 6.2 All Memberships

The master table. Columns:

Organization · Primary contact · Status · Plan · MRR · **Attributed rep** · Attribution method · Member since · Renews / ends · Last active · Scenarios (30d)

Filter by status, plan, rep, attribution method, date range. Sort every column. Search by org or contact. CSV export respecting active filters. Row click opens the detail drawer.

### 6.3 Retention & Churn

- Cohort retention grid: signup month down, months-since across, percent retained in each cell
- Monthly churn trend, **split voluntary vs involuntary** — these need to be visually distinct, not summed
- Churn reasons, ranked
- Retention by rep — does one rep's book stay better?
- Retention by plan

### 6.4 Recently Deactivated

Explicitly requested, and operationally the most actionable tab. Two sections:

**Cancelled, access still active** (`cancelled_pending`) — days of access remaining, cancellation reason, last activity. These are saves, and they're time-boxed.

**Churned** — days since access ended, tenure, lifetime revenue, reason, attributed rep. Actions: log an outreach attempt, mark as won back, add a note.

Default sort: most recent first. Default range: last 90 days, adjustable.

### 6.5 Attribution

Per rep, plus a permanent Unattributed row:

| Rep | Signups | Trials | Converted | Conversion % | Active now | Churned | Retention % | MRR | Avg tenure |

Below: non-rep source breakdown, conflicts needing review (from task 03), manual reassignment with mandatory reason writing to `attribution_changes`, and CSV export.

## 7. Membership detail drawer

Opens from any row. Header: org, status badge, plan, MRR, attributed rep.

Tabs: **Timeline** (every `membership_events` row plus notes, chronological) · **Usage** (scenarios run, features touched, last login, seat activity) · **Billing** (invoices, payment failures, next charge) · **Notes** (internal, admin-only, append-only).

Admin actions: extend trial, comp a month, change plan, cancel, reactivate, reassign attribution. Every one writes a `membership_events` row with the acting admin recorded.

## 8. Churn reason capture

Add a short cancellation flow member-side: one required reason select, one optional free-text field. Options: too expensive · not using it enough · missing lenders or guidelines I need · switched to another tool · business changed · other.

Without this, the churn reasons column is empty and section 6.3 has nothing to rank. It's the cheapest useful thing in this whole build.

## 9. Two things worth adding that weren't asked for

**A usage-based health signal.** An active payer who hasn't run a scenario in 30 days is the strongest churn predictor you'll have, and you already track feature usage. Compute a simple health tier — healthy / watch / at risk — from days since last login and 30-day scenario count. Not a model, just thresholds, and surface it as a column and a filter.

**Sales-rep read access, scoped.** Bobby and Mike will want to see their own books. Attribution *data* stays admin-only as specified, but consider a later read-only view where each rep sees their own memberships and their own retention — never each other's, never the attribution edit controls, never the ability to reassign. Build the admin version first; note this as a follow-up rather than building it now.

## 10. Guardrails

- No member-facing route may return attribution data. Add an explicit test asserting a member-scoped fetch of their own org contains no rep field.
- Never delete a membership row. Status transitions only; churned memberships stay for cohort math.
- Every admin mutation is audited with actor and timestamp.
- Money in integer cents throughout. No floats.
- Empty and low-volume states must read honestly — "3 of 4 retained" rather than "75%" under a threshold you set.

## 11. Tests

- Every metric function against a fixture set with known answers, including division-by-zero at month zero.
- Voluntary and involuntary churn separate correctly from a mixed event stream.
- Cohort grid math on a hand-built 6-month dataset.
- Reactivation increments the counter, restores active status, and appears correctly in the cohort it originally belonged to.
- A member-role request for their own org returns no attribution field.
- A non-admin request to any `/admin/memberships*` route returns 403.
- CSV export honors active filters and includes the attribution column.
- Webhook replay is idempotent — a duplicate cancellation event creates one `membership_events` row, not two.

## 12. Definition of done

- Admin can see every membership, its status, and who brought it in, in one table.
- Retention rate, churn (split voluntary/involuntary), and trial conversion are computed from events and match hand-checked fixtures.
- Recently Deactivated separates still-has-access from access-lapsed.
- Per-rep retention is visible, not just per-rep signup counts.
- Unattributed is always displayed as its own row, even at zero.
- No attribution data reachable from any member-facing surface, proven by test.
- Every status change and admin action has an audit trail.