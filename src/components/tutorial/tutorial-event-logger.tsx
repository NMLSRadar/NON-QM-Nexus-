"use client";

import { useEffect } from "react";
import type { TutorialEventType } from "@/lib/tutorial/events";

const CTRL_SELECTOR = "[data-tutorial-cta]";

/**
 * Fire-and-forget tutorial analytics for the public /tutorial page.
 *  - tutorial_viewed: once per browser tab (sessionStorage guard), on mount.
 *  - tutorial_section_viewed: when a section scrolls into view (once per
 *    section per page view) — sections are marked with data-section-slug.
 *  - tutorial_cta_clicked: delegated on any [data-tutorial-cta] click, using
 *    the element's data-cta-slug.
 * Every POST is best-effort: a failure (network, table not yet migrated) must
 * never surface to the reader.
 */
export function TutorialEventLogger({ slugs }: { slugs: string[] }) {
  useEffect(() => {
    const post = (event: TutorialEventType, slug?: string) => {
      void fetch("/api/tutorial/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event, slug }),
        keepalive: true,
      }).catch(() => {});
    };

    const fired = new Set<string>();
    try {
      if (!sessionStorage.getItem("nqn:tutorial:viewed")) {
        post("tutorial_viewed");
        sessionStorage.setItem("nqn:tutorial:viewed", "1");
      }
    } catch {
      // sessionStorage unavailable (private mode) — still log the view once.
      post("tutorial_viewed");
    }

    const onSectionVisible = (slug: string) => {
      if (fired.has(slug)) return;
      fired.add(slug);
      post("tutorial_section_viewed", slug);
    };

    const onCtaClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(CTRL_SELECTOR);
      const slug = el?.dataset.ctaSlug;
      if (slug) post("tutorial_cta_clicked", slug);
    };
    document.addEventListener("click", onCtaClick);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const slug = (entry.target as HTMLElement).dataset.sectionSlug;
          if (slug) onSectionVisible(slug);
        }
      },
      // Fire slightly early so the section is logged the moment it matters,
      // without requiring the full banner to be on screen.
      { rootMargin: "0px 0px -15% 0px", threshold: 0.15 }
    );

    const observed: Element[] = [];
    for (const slug of slugs) {
      const el = document.querySelector<HTMLElement>(`[data-section-slug="${CSS.escape(slug)}"]`);
      if (el) {
        observer.observe(el);
        observed.push(el);
      }
    }

    return () => {
      document.removeEventListener("click", onCtaClick);
      observer.disconnect();
    };
  }, [slugs]);

  return null;
}