import { VerificationStatus } from "../types/enums";
import type { Rule } from "../types/program";

/**
 * Effective-date selection and expired-guideline handling.
 *
 * A rule is active for evaluation when:
 *  - its verification status is publishable (human-verified or imported/pending
 *    that an org has chosen to include — here we require human_verified for
 *    active use; drafts and AI-extracted rules are NEVER active automatically);
 *  - `asOf` is on/after its effectiveDate (or it has none); and
 *  - `asOf` is before its expirationDate (or it has none).
 */
export function isRuleActive(rule: Rule, asOf: Date): boolean {
  if (rule.verificationStatus !== VerificationStatus.HumanVerified) return false;
  if (rule.effectiveDate && new Date(rule.effectiveDate) > asOf) return false;
  if (rule.expirationDate && new Date(rule.expirationDate) <= asOf) return false;
  return true;
}

export function selectActiveRules(rules: Rule[], asOf: Date = new Date()): Rule[] {
  return rules.filter((r) => isRuleActive(r, asOf));
}
