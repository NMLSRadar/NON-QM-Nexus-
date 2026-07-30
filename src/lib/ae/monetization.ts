/** Feature flag gating AE monetization (Section 3). Default false — the
 * owner flips this once subscriber volume justifies it. When false,
 * /ae/subscribe shows a "coming soon" message and no checkout is
 * reachable at all (not just hidden — the server action itself refuses). */
export function isAeMonetizationEnabled(): boolean {
  return process.env.AE_MONETIZATION_ENABLED === "true";
}
