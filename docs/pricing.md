# Pricing v2

## Catalog

| Plan | Billing | Commitment | Renewal |
|---|---:|---:|---|
| Monthly | $59.99 each month | None | Month-to-month until canceled |
| 4-Month Commitment | $50.00 today, then $50.00 monthly three more times | Four payments; $200.00 total | Automatically $59.99/month after payment four until canceled |

The commitment is not prepaid. Stripe collects four separate recurring monthly payments. The first is due at Checkout. A Subscription Schedule then keeps the $50 recurring price for four iterations and changes to the $59.99 recurring price at the next phase boundary.

## Disclosure and evidence

Checkout is blocked until the authenticated member chooses Bobby or Mike for the admin-only referral record and affirmatively accepts the current commitment disclosure. The server validates the disclosure version and stores the exact text, acceptance time, originating IP when available, user agent, and resulting Checkout Session ID. Organization identity is derived from the authenticated membership and is never accepted from the browser.

A cancellation request during the commitment removes the open-ended renewal phase but preserves all four committed $50 invoices. The member receives the exact access-through date. Payment collection is not described as guaranteed: payment failure, dispute, and card-network decisions remain possible and are handled by the existing dunning/audit path.

## Grandfathering

Existing projected $120 commitments receive `legacy_plan_key = legacy_commit_3mo_120`. The migration and Stripe synchronization script never update, archive, cancel, or reprice an existing subscription or schedule. Catalog Price objects are replaced, never mutated in place.

## Source of truth

All new-plan amounts and terms are defined in `src/config/pricing.ts` as integer cents. `src/lib/billing/money.ts` formats cents at the render edge. The existing `membership_plans` table remains the database catalog; creating a second `billing_plans` table would introduce conflicting sources of truth.

## Deployment

1. Apply `supabase/pricing-v2.sql`.
2. Run `pnpm tsx scripts/sync-stripe-prices.ts` and review the dry-run.
3. Run the same command with `--apply` using the intended Stripe mode and Supabase service environment.
4. Deploy application code only after the migration and catalog synchronization succeed.
5. Do not run the old bootstrap or commitment setup scripts for Pricing v2.

## Stripe test-mode verification

- Purchase Monthly and confirm the invoice is $59.99.
- Confirm commitment Checkout charges $50.00 immediately.
- Confirm its schedule has a four-month $50 phase followed by an open-ended $59.99 phase.
- Advance a Stripe test clock through four boundaries and verify four $50 invoices, then one $59.99 invoice.
- Request cancellation during month two; verify months three and four remain scheduled while the $59.99 phase is removed.
- Replay a webhook and verify the unique `stripe_event_id` index prevents another audit row.
- Verify a legacy $120 subscription and schedule are unchanged.
- Confirm Bobby/Mike attribution is visible only in admin Membership Management.
- Trigger a failed payment and dispute in test mode; verify event id/type logging without payloads, email addresses, or card data.

## Rollback

Application code can be rolled back independently. Stripe v2 prices should be archived only after traffic is returned to the old catalog. The migration includes a manual DOWN block, but destructive column removal should occur only after confirming no v2 memberships or evidence records exist.
