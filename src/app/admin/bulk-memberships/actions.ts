"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { getStripe } from "@/lib/stripe";
import { generateInviteToken, hashInviteToken, inviteExpiresAt } from "@/lib/invites";
import { sendTransactionalEmail } from "@/lib/email";
import { orgInviteEmail, bulkMembershipCheckoutLinkEmail, bulkMembershipInvoiceSentEmail } from "@/lib/emailTemplates";
import { BULK_PLAN_KEY, isValidBulkSeatCount, MAX_BULK_SEATS } from "@/lib/bulkMembership";

async function getBulkPlan(): Promise<{ id: string; stripeProductId: string | null } | null> {
  const service = createServiceRoleClient();
  const { data } = await service.from("membership_plans").select("id, stripe_product_id").eq("key", BULK_PLAN_KEY).maybeSingle();
  if (!data) return null;
  return { id: data.id as string, stripeProductId: (data.stripe_product_id as string | null) ?? null };
}

/** Lazily creates (once) the shared Stripe Product every Bulk Membership
 * deal's dynamic per-seat Price attaches to — Prices are immutable and
 * created fresh per deal (scripts/stripe-team-billing.js's existing
 * convention), but they all share one Product. */
async function ensureBulkProduct(planId: string, existingProductId: string | null): Promise<string> {
  if (existingProductId) return existingProductId;
  const stripe = getStripe();
  const product = await stripe.products.create({ name: "NON-QM Nexus — Bulk Membership" });
  const service = createServiceRoleClient();
  await service.from("membership_plans").update({ stripe_product_id: product.id }).eq("id", planId);
  return product.id;
}

async function findOrCreateStripeCustomer(email: string, name: string): Promise<string> {
  const stripe = getStripe();
  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const created = await stripe.customers.create({ email, name });
  return created.id;
}

/** Sends the initial org_admin invite for a freshly created Bulk
 * Membership org — deliberately NOT a call into
 * src/app/account/team/actions.ts's inviteMember, since that's gated by
 * requireOrgAdmin() and the org has no members at all yet (a platform
 * admin is not, and should never automatically become, a member of a
 * customer's organization). Same token/email mechanics, smaller surface. */
async function inviteFirstOrgAdmin(organizationId: string, invitedByUserId: string, email: string): Promise<void> {
  const service = createServiceRoleClient();
  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = inviteExpiresAt();

  await service.from("org_invites").insert({
    organization_id: organizationId,
    email,
    role: "org_admin",
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
    invited_by: invitedByUserId,
  });

  const { data: orgRow } = await service.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  const { data: existingUser } = await service.from("users").select("id").eq("email", email).maybeSingle();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com";
  const acceptUrl = existingUser ? `${appUrl}/invites/accept?invite=${rawToken}` : `${appUrl}/signup?invite=${rawToken}`;

  const { subject, html } = orgInviteEmail({
    organizationName: (orgRow?.name as string | undefined) ?? "your team",
    role: "org_admin",
    inviterEmail: "NON-QM Nexus",
    acceptUrl,
    expiresAtIso: expiresAt.toISOString(),
  });
  await sendTransactionalEmail({ to: email, subject, html });
}

export interface CreateBulkMembershipResult {
  error?: string;
  checkoutUrl?: string;
  invoiceUrl?: string;
  organizationId?: string;
}

/** Platform-admin only. Creates a Bulk Membership deal end to end: a new
 * Organization (or attaches to an existing one), the org_subscriptions row
 * at the negotiated price, and — depending on billingMode — either a
 * Stripe Checkout link (card), a sent NET-30 Stripe Invoice (invoiced), or
 * nothing further (comped pilot). Always invites the contact as the org's
 * first org_admin (unless attaching to an existing org that already has
 * one). See docs/bulk-membership.md. */
export async function createBulkMembership(formData: FormData): Promise<CreateBulkMembershipResult> {
  const { userId } = await requirePlatformAdmin();

  const companyName = String(formData.get("companyName") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim().toLowerCase();
  const seatCount = Number(formData.get("seatCount"));
  const pricePerSeatCents = Number(formData.get("pricePerSeatCents"));
  const billingMode = String(formData.get("billingMode") ?? "");
  const existingOrganizationId = String(formData.get("existingOrganizationId") ?? "").trim() || null;
  const requestId = String(formData.get("requestId") ?? "").trim() || null;

  if (!companyName && !existingOrganizationId) return { error: "Company name is required." };
  if (!contactEmail || !contactEmail.includes("@")) return { error: "A valid contact email is required." };
  if (!isValidBulkSeatCount(seatCount)) return { error: `Seat count must be between 1 and ${MAX_BULK_SEATS}.` };
  if (!Number.isInteger(pricePerSeatCents) || pricePerSeatCents < 0) return { error: "Enter a valid negotiated price per seat." };
  if (!["custom_stripe", "invoiced", "comped"].includes(billingMode)) return { error: "Invalid billing mode." };

  const bulkPlan = await getBulkPlan();
  if (!bulkPlan) return { error: "Bulk Membership plan not found — run supabase/bulk-membership-schema.sql first." };

  const service = createServiceRoleClient();

  let organizationId = existingOrganizationId;
  let orgIsNew = false;
  if (!organizationId) {
    const { data: newOrg, error: orgError } = await service.from("organizations").insert({ name: companyName }).select("id").single();
    if (orgError) return { error: orgError.message };
    organizationId = newOrg.id as string;
    orgIsNew = true;
  }

  const { data: existingActive } = await service
    .from("org_subscriptions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (existingActive) return { error: "This organization already has an active team subscription." };

  const baseRow = {
    organization_id: organizationId,
    plan_id: bulkPlan.id,
    seat_count: seatCount,
    custom_price_per_seat_cents: pricePerSeatCents,
    billing_contact_email: contactEmail,
    billing_contact_name: contactName || null,
  };

  const result: CreateBulkMembershipResult = { organizationId: organizationId ?? undefined };

  if (billingMode === "comped") {
    const { error } = await service.from("org_subscriptions").insert({
      ...baseRow,
      status: "active",
      source: "comped",
      billing_mode: "comped",
    });
    if (error) return { error: error.message };
    await service.from("audit_logs").insert({
      organization_id: organizationId,
      actor_user_id: userId,
      action: "bulk_membership.comped_granted",
      entity_type: "org_subscriptions",
      metadata: { plan_id: bulkPlan.id, seat_count: seatCount, price_per_seat_cents: pricePerSeatCents },
    });
  } else if (billingMode === "custom_stripe") {
    const productId = await ensureBulkProduct(bulkPlan.id, bulkPlan.stripeProductId);
    const stripe = getStripe();
    const price = await stripe.prices.create({
      product: productId,
      currency: "usd",
      unit_amount: pricePerSeatCents,
      recurring: { interval: "month", usage_type: "licensed" },
    });
    const customerId = await findOrCreateStripeCustomer(contactEmail, contactName || companyName);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com";
    const metadata = {
      team: "true",
      organization_id: organizationId,
      bulk: "true",
      bulk_plan_id: bulkPlan.id,
      price_per_seat_cents: String(pricePerSeatCents),
    };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: price.id, quantity: seatCount }],
      subscription_data: { metadata },
      metadata,
      success_url: `${appUrl}/admin/bulk-memberships?checkout=success`,
      cancel_url: `${appUrl}/admin/bulk-memberships?checkout=canceled`,
    });
    if (!session.url) return { error: "Stripe did not return a checkout URL." };
    result.checkoutUrl = session.url;
    // No org_subscriptions row yet — the webhook creates it once Stripe
    // confirms payment (checkout.session.completed / customer.subscription.*),
    // exactly like the existing self-serve team flow.
    await sendTransactionalEmail({
      to: contactEmail,
      ...bulkMembershipCheckoutLinkEmail({ companyName: companyName || "your company", seatCount, pricePerSeatCents, checkoutUrl: session.url }),
    });
  } else {
    // invoiced (NET-30)
    const customerId = await findOrCreateStripeCustomer(contactEmail, contactName || companyName);
    const stripe = getStripe();
    const totalCents = pricePerSeatCents * seatCount;
    await stripe.invoiceItems.create({
      customer: customerId,
      amount: totalCents,
      currency: "usd",
      description: `Bulk Membership — ${seatCount} seats @ $${(pricePerSeatCents / 100).toFixed(2)}/seat/mo`,
    });
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: "send_invoice",
      days_until_due: 30,
      metadata: { team: "true", organization_id: organizationId, bulk: "true", bulk_plan_id: bulkPlan.id },
    });
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id!);
    await stripe.invoices.sendInvoice(invoice.id!);

    const nextInvoiceDueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const { error } = await service.from("org_subscriptions").insert({
      ...baseRow,
      status: "active",
      source: "invoiced",
      billing_mode: "invoiced",
      stripe_invoice_id: invoice.id,
      next_invoice_due_at: nextInvoiceDueAt.toISOString(),
    });
    if (error) return { error: error.message };
    await service.from("audit_logs").insert({
      organization_id: organizationId,
      actor_user_id: userId,
      action: "bulk_membership.invoiced_created",
      entity_type: "org_subscriptions",
      metadata: { plan_id: bulkPlan.id, seat_count: seatCount, price_per_seat_cents: pricePerSeatCents, stripe_invoice_id: invoice.id },
    });
    result.invoiceUrl = finalized.hosted_invoice_url ?? undefined;
    if (finalized.hosted_invoice_url) {
      await sendTransactionalEmail({
        to: contactEmail,
        ...bulkMembershipInvoiceSentEmail({
          companyName: companyName || "your company",
          seatCount,
          totalCents,
          invoiceUrl: finalized.hosted_invoice_url,
          dueDate: nextInvoiceDueAt.toLocaleDateString("en-US", { dateStyle: "long" }),
        }),
      });
    }
  }

  if (orgIsNew) {
    await inviteFirstOrgAdmin(organizationId, userId, contactEmail);
  }

  if (requestId) {
    await service
      .from("bulk_membership_requests")
      .update({ status: "converted", converted_organization_id: organizationId })
      .eq("id", requestId);
  }

  revalidatePath("/admin/bulk-memberships");
  return result;
}

/** Marks a request contacted/declined without converting it — platform
 * admin only, lightweight status tracking on the lead. */
export async function updateRequestStatus(requestId: string, status: "contacted" | "declined"): Promise<{ error?: string }> {
  await requirePlatformAdmin();
  const service = createServiceRoleClient();
  const { error } = await service.from("bulk_membership_requests").update({ status }).eq("id", requestId);
  if (error) return { error: error.message };
  revalidatePath("/admin/bulk-memberships");
  return {};
}

/** Rolls an "invoiced" Bulk Membership forward one billing cycle — there's
 * no recurring Stripe object for a NET-30 deal (unlike custom_stripe /
 * standard team subscriptions), so this is a manual admin action rather
 * than something a webhook drives. */
export async function sendNextBulkInvoice(orgSubscriptionId: string): Promise<{ error?: string }> {
  await requirePlatformAdmin();
  const service = createServiceRoleClient();

  const { data: sub, error: fetchError } = await service
    .from("org_subscriptions")
    .select("organization_id, seat_count, custom_price_per_seat_cents, billing_contact_email, billing_contact_name, billing_mode")
    .eq("id", orgSubscriptionId)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!sub || sub.billing_mode !== "invoiced") return { error: "Not an invoiced Bulk Membership subscription." };
  if (!sub.billing_contact_email) return { error: "No billing contact email on file." };

  const stripe = getStripe();
  const customerId = await findOrCreateStripeCustomer(sub.billing_contact_email as string, (sub.billing_contact_name as string) || "");
  const seatCount = sub.seat_count as number;
  const pricePerSeatCents = sub.custom_price_per_seat_cents as number;
  const totalCents = seatCount * pricePerSeatCents;

  await stripe.invoiceItems.create({
    customer: customerId,
    amount: totalCents,
    currency: "usd",
    description: `Bulk Membership — ${seatCount} seats @ $${(pricePerSeatCents / 100).toFixed(2)}/seat/mo`,
  });
  const invoice = await stripe.invoices.create({ customer: customerId, collection_method: "send_invoice", days_until_due: 30 });
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id!);
  await stripe.invoices.sendInvoice(invoice.id!);

  const nextInvoiceDueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const { error } = await service
    .from("org_subscriptions")
    .update({ stripe_invoice_id: invoice.id, next_invoice_due_at: nextInvoiceDueAt.toISOString() })
    .eq("id", orgSubscriptionId);
  if (error) return { error: error.message };

  if (finalized.hosted_invoice_url) {
    await sendTransactionalEmail({
      to: sub.billing_contact_email as string,
      ...bulkMembershipInvoiceSentEmail({
        companyName: (sub.billing_contact_name as string) || "your company",
        seatCount,
        totalCents,
        invoiceUrl: finalized.hosted_invoice_url,
        dueDate: nextInvoiceDueAt.toLocaleDateString("en-US", { dateStyle: "long" }),
      }),
    });
  }

  revalidatePath("/admin/bulk-memberships");
  return {};
}

/** Cancels a Bulk Membership org_subscription (any billing mode) —
 * platform admin only. Members fall back immediately (no period-end
 * grace, matching the existing comped-cancellation convention — a real
 * custom_stripe subscription should instead be canceled via the Stripe
 * dashboard/customer portal so period-end access is honored). */
export async function cancelBulkMembership(orgSubscriptionId: string): Promise<{ error?: string }> {
  const { userId } = await requirePlatformAdmin();
  const service = createServiceRoleClient();

  const { data: sub, error: fetchError } = await service
    .from("org_subscriptions")
    .select("organization_id, billing_mode")
    .eq("id", orgSubscriptionId)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!sub) return { error: "Subscription not found." };

  const { error } = await service
    .from("org_subscriptions")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("id", orgSubscriptionId);
  if (error) return { error: error.message };

  await service.from("audit_logs").insert({
    organization_id: sub.organization_id as string,
    actor_user_id: userId,
    action: "bulk_membership.canceled",
    entity_type: "org_subscriptions",
    entity_id: orgSubscriptionId,
    metadata: { billing_mode: sub.billing_mode },
  });

  revalidatePath("/admin/bulk-memberships");
  return {};
}
