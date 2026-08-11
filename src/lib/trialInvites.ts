// App-generated trial beta-invite tokens (2026-08-11). This replaces the
// earlier fragile dependency on Supabase admin `generateLink({type:"invite"})`,
// whose hosted verify link inconsistently bounced invited officers back to
// /trial/[slug]/invite-accept WITHOUT a usable session — leaving the invitee
// stuck on "We couldn't verify your invitation link" and then a dead-end
// "Invalid login credentials" on the login page (the account created by the
// admin invite sits unconfirmed with no password).
//
// Instead the invite link is a plain app URL (…?token=<raw>) and the
// invite-accept page validates it SERVER-side against public.trial_invites
// by SHA-256 hash of the raw token (same convention as src/lib/invites.ts /
// shared_links.tokenHash). Only the hash is ever persisted; the raw token
// exists exactly once, in the invite email/link.
import { randomBytes, createHash } from "node:crypto";

export const TRIAL_INVITE_TOKEN_BYTES = 32;
export const TRIAL_INVITE_EXPIRY_DAYS = 7;

/** A fresh, high-entropy raw trial-invite token — given to the invitee once,
 * in the email link, and never stored. */
export function generateTrialInviteToken(): string {
  return randomBytes(TRIAL_INVITE_TOKEN_BYTES).toString("hex");
}

export function hashTrialInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function trialInviteExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + TRIAL_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}