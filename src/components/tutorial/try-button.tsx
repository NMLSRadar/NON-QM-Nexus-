"use client";

import { ArrowRight } from "lucide-react";

/**
 * Per-section "Try it" deep link. The server page knows whether a session
 * exists and passes `authed` down through the MDX component map:
 *   - signed-in users see "Open the tool" copy from the MDX file and jump
 *     straight into the feature (e.g. /scenarios/voice);
 *   - anonymous visitors (the page doubles as a public sales asset) get a
 *     "Start free trial" CTA pointing at the signup flow.
 * Everything except that anon/login split comes from the MDX content file.
 */
export function TryButton({
  href,
  label,
  feature,
  authed,
}: {
  href: string;
  label: string;
  feature: string;
  authed: boolean;
}) {
  const display = authed ? label : "Start free trial";
  const target = authed ? href : "/signup?next=/tutorial";

  return (
    <a
      href={target}
      data-tutorial-cta
      data-cta-slug={feature}
      className="gold-button inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
    >
      {display}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </a>
  );
}