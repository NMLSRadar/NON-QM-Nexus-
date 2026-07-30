import "server-only";
import crypto from "node:crypto";

/**
 * Signed, no-login-required unsubscribe token — HMAC-SHA256 over the
 * lowercased email address, keyed by EMAIL_UNSUBSCRIBE_SECRET. Not
 * encrypted (the email is base64'd in the token, not hidden) since the
 * recipient already knows their own address; the signature only prevents
 * an attacker from forging a token that suppresses an ARBITRARY address
 * they don't control.
 */
function getSecret(): string {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error("EMAIL_UNSUBSCRIBE_SECRET is not configured.");
  return secret;
}

export function signUnsubscribeToken(email: string): string {
  const normalized = email.trim().toLowerCase();
  const payload = Buffer.from(normalized, "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expectedSignature = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(email: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com";
  const token = signUnsubscribeToken(email);
  return `${appUrl}/api/email/unsubscribe?t=${encodeURIComponent(token)}`;
}
