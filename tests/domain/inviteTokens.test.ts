// Pure unit tests for src/lib/invites.ts — no database, no credentials
// needed, always runs. Hashing here must match
// supabase/team-invite-signup.sql's pgcrypto digest(token, 'sha256')
// exactly (lowercase hex) — see that file's own comment.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { generateInviteToken, hashInviteToken, inviteExpiresAt, INVITE_EXPIRY_DAYS } from "@/lib/invites";

describe("Team invite tokens", () => {
  it("generates high-entropy, unique tokens", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64); // 32 bytes, hex-encoded
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes deterministically via SHA-256 lowercase hex (matches the SQL trigger's digest())", () => {
    const token = "a-fixed-test-token-value";
    const expected = createHash("sha256").update(token).digest("hex");
    expect(hashInviteToken(token)).toBe(expected);
    // Deterministic — same input always hashes the same.
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
  });

  it("produces different hashes for different tokens", () => {
    expect(hashInviteToken("token-one")).not.toBe(hashInviteToken("token-two"));
  });

  it("expires 7 days from the given date by default", () => {
    expect(INVITE_EXPIRY_DAYS).toBe(7);
    const from = new Date("2026-07-30T00:00:00.000Z");
    const expires = inviteExpiresAt(from);
    expect(expires.toISOString()).toBe("2026-08-06T00:00:00.000Z");
  });
});
