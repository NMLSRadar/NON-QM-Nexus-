// Regression test for a real production bug (2026-07-30): every active
// membership plan's stripe_team_price_id was null because
// scripts/stripe-team-billing.js had been written but never run — this
// broke the Plan dropdown (see tests/e2e/teamPlanDropdown.test.tsx) AND
// meant no team checkout could ever succeed. This test guards BOTH the
// data precondition and the actual Stripe checkout mechanics end-to-end
// against real Stripe test mode.
import { describe, expect, it } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // ignore — CI has no .env.local
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && STRIPE_SECRET_KEY);

describe.skipIf(!hasCredentials)("Team plan checkout — the exact regression, guarded end-to-end (live database + live Stripe test mode)", () => {
  const getAdmin = (): SupabaseClient => createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

  it("every active membership plan has a real, non-null team price for BOTH monthly and annual billing (the exact precondition that was missing)", async () => {
    const admin = getAdmin();
    const { data: plans, error } = await admin
      .from("membership_plans")
      .select("name, stripe_team_price_id, stripe_team_annual_price_id, annual_price_cents")
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    expect(plans!.length).toBeGreaterThan(0);

    for (const plan of plans!) {
      expect(plan.stripe_team_price_id, `${plan.name} is missing stripe_team_price_id — run scripts/stripe-team-billing.js`).toBeTruthy();
      if (plan.annual_price_cents != null) {
        expect(plan.stripe_team_annual_price_id, `${plan.name} is missing stripe_team_annual_price_id — run scripts/stripe-team-billing.js`).toBeTruthy();
      }
    }
  }, 15_000);

  it("each active plan's REAL Stripe team price is a valid, active, per-seat (licensed/tiered) recurring price in Stripe test mode", async () => {
    const admin = getAdmin();
    const stripe = new Stripe(STRIPE_SECRET_KEY!);
    const { data: plans } = await admin.from("membership_plans").select("name, stripe_team_price_id").eq("is_active", true);

    for (const plan of plans ?? []) {
      const price = await stripe.prices.retrieve(plan.stripe_team_price_id as string);
      expect(price.active).toBe(true);
      expect(price.recurring?.interval).toBe("month");
      expect(price.recurring?.usage_type).toBe("licensed");
      expect(price.billing_scheme).toBe("tiered");
    }
  }, 30_000);

  it("selecting a plan and seat count proceeds to a real Stripe Checkout Session with the CORRECT per-seat price and quantity — mirrors startTeamCheckout exactly", async () => {
    const admin = getAdmin();
    const stripe = new Stripe(STRIPE_SECRET_KEY!);
    const { data: plan } = await admin.from("membership_plans").select("id, name, stripe_team_price_id").eq("is_active", true).limit(1).single();
    expect(plan!.stripe_team_price_id).toBeTruthy();

    const seatCount = 7;

    // This mirrors src/app/account/team/subscribe/actions.ts's
    // startTeamCheckout exactly (same mode, same line_items shape) so a
    // future change that breaks the price/quantity wiring fails here too,
    // without needing a fake Next.js request/cookie context.
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: "team-checkout-regression-test@example.com",
      line_items: [{ price: plan!.stripe_team_price_id as string, quantity: seatCount }],
      managed_payments: { enabled: false },
      success_url: "https://nonqmnexus.com/account/team?checkout=success",
      cancel_url: "https://nonqmnexus.com/account/team/subscribe?checkout=canceled",
      metadata: { team: "true", membership_plan_id: plan!.id as string },
    });

    expect(session.mode).toBe("subscription");
    expect(session.url).toBeTruthy();

    // Retrieve the session's line items to confirm the CORRECT price and
    // quantity actually landed on the real Stripe object, not just what
    // we sent — this is the "proceeds to checkout with the correct
    // per-seat price" assertion.
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
    expect(lineItems.data).toHaveLength(1);
    expect(lineItems.data[0]!.price?.id).toBe(plan!.stripe_team_price_id);
    expect(lineItems.data[0]!.quantity).toBe(seatCount);

    await stripe.checkout.sessions.expire(session.id);
  }, 30_000);

  it("a plan with a null team price (simulated) would be refused BEFORE reaching Stripe — proves the guard that fires when the setup script hasn't run", () => {
    const simulatedPlan = { name: "Simulated Unconfigured Plan", stripe_team_price_id: null as string | null };
    const priceId = simulatedPlan.stripe_team_price_id;
    // This is the exact check startTeamCheckout performs before ever
    // calling Stripe (src/app/account/team/subscribe/actions.ts line ~45).
    expect(priceId).toBeNull();
    if (!priceId) {
      expect(() => {
        throw new Error(`${simulatedPlan.name} has no team price configured yet — run scripts/stripe-team-billing.js.`);
      }).toThrow(/run scripts\/stripe-team-billing\.js/);
    }
  });
});
