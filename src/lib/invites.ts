// Shared invite-token helpers — used by both the invite-issuing server
// action (src/app/account/team/actions.ts) and the invite-acceptance paths
// (signup with ?invite=, /invites/accept). Only the SHA-256 hash of the raw
// token is ever persisted (org_invites.token_hash) — the raw token exists
// exactly once, in the invite email/link — same convention as
// SharedLink.tokenHash. Hashing must match supabase/team-invite-signup.sql's
// pgcrypto digest(token, 'sha256') exactly (lowercase hex).
import { randomBytes, createHash } from "node:crypto";

export const INVITE_EXPIRY_DAYS = 7;

/** A fresh, high-entropy raw invite token — given to the invitee once, in
 * the email link, and never stored. */
export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function inviteExpiresAt(fromDate: Date = new Date()): Date {
  return new Date(fromDate.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}
