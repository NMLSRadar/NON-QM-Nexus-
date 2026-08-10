"use client";

import { Children, cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Check, ChevronDown, Menu, Search, ListOrdered } from "lucide-react";

export interface TutorialSectionMeta {
  slug: string;
  title: string;
  summary: string;
  keywords: string[];
}

/** Props TutorialPage may add to section frames when rendering children. */
interface FrameExtras {
  slug?: string;
  hidden?: boolean;
  loggedIn?: boolean;
  done?: boolean;
  onToggleProgress?: () => void;
}

const PROGRESS_KEY = "nqn:tutorial:progress";

function loadProgress(): Record<string, true> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}") as Record<string, true>;
  } catch {
    return {};
  }
}

/**
 * Client chrome of /tutorial: sticky outline sidebar with current-section
 * highlighting, a live search box that filters section titles and step text,
 * per-section progress checkmarks (logged-in users only, localStorage-backed),
 * and the mobile "Contents" dropdown. All instructional copy lives in the MDX
 * files; this component owns only navigation chrome.
 */
export function TutorialPage({
  sections,
  loggedIn,
  children,
}: {
  sections: TutorialSectionMeta[];
  loggedIn: boolean;
  children: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, true>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  // Load saved progress after mount only — localStorage is unavailable during
  // SSR, and reading it in the initial render would hydrate with different
  // checkmark state than the server HTML.
  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  const normalized = query.trim().toLowerCase();

  const matchingSlugs = useMemo(() => {
    if (!normalized) return new Set(sections.map((s) => s.slug));
    return new Set(
      sections
        .filter((s) => {
          const haystack = [s.title, s.summary, ...s.keywords].join(" ").toLowerCase();
          return haystack.includes(normalized);
        })
        .map((s) => s.slug)
    );
  }, [sections, normalized]);

  // Scroll-spy: highlight the outline entry for the section in view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSlug((entry.target as HTMLElement).dataset.sectionSlug ?? null);
        }
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: 0 }
    );
    const els = contentRef.current?.querySelectorAll<HTMLElement>("[data-section-slug]") ?? [];
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const toggleProgress = useCallback(
    (slug: string) => {
      if (!loggedIn) return;
      setProgress((prev) => {
        const next = { ...prev };
        if (next[slug]) delete next[slug];
        else next[slug] = true;
        try {
          localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
        } catch {
          /* private mode — progress just won't persist */
        }
        return next;
      });
    },
    [loggedIn]
  );

  const jumpToFirstResult = useCallback(() => {
    const first = sections.find((s) => matchingSlugs.has(s.slug));
    if (!first) return;
    document.getElementById(first.slug)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [sections, matchingSlugs]);

  const outline = (
    <nav aria-label="Tutorial contents" className="mt-4 space-y-0.5">
      {sections.map((s) => {
        const visible = matchingSlugs.has(s.slug);
        const active = activeSlug === s.slug;
        const done = Boolean(progress[s.slug]);
        return (
          <a
            key={s.slug}
            href={`#${s.slug}`}
            className={`flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-[13px] leading-snug transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 ${
              visible ? "" : "hidden"
            } ${active ? "bg-amber-500/10 text-amber-200" : "text-slate-300 hover:bg-white/5 hover:text-amber-100"}`}
            aria-current={active ? "true" : undefined}
          >
            {loggedIn && done ? (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/25 text-emerald-300" aria-label="Completed">
                <Check className="h-3 w-3" aria-hidden />
              </span>
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full border border-slate-600" aria-hidden />
            )}
            <span>{s.title}</span>
          </a>
        );
      })}
      {normalized && matchingSlugs.size === 0 ? (
        <p className="px-3 py-2 text-xs text-slate-500">No sections match “{query.trim()}”.</p>
      ) : null}
    </nav>
  );

  const searchBox = (
    <div className="relative">
      <label htmlFor="tutorial-search" className="sr-only">
        Search tutorial sections and steps
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
      <input
        id="tutorial-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") jumpToFirstResult();
        }}
        placeholder="Search sections and steps…"
        className="min-h-[44px] w-full rounded-xl border border-amber-500/25 bg-black/40 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
      />
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:gap-8">
      {/* Desktop sticky sidebar */}
      <aside className="hidden lg:block print:hidden">
        <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7.5rem)] lg:overflow-y-auto lg:pb-10">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <ListOrdered className="h-3.5 w-3.5" aria-hidden /> On this page
          </p>
          {searchBox}
          {outline}
        </div>
      </aside>

      {/* Mobile contents dropdown */}
      <details className="mb-5 lg:hidden print:hidden">
        <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-xl border border-amber-400/35 bg-black/40 px-3 py-2 text-sm font-medium text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-400">
          <Menu className="h-4 w-4" aria-hidden /> Contents &amp; search
          <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden />
        </summary>
        <div className="mt-3 rounded-xl border border-amber-500/20 bg-[#0d0d0f] p-3">
          {searchBox}
          {outline}
        </div>
      </details>

      {/* Sections */}
      <div ref={contentRef} className="min-w-0 space-y-10">
        {normalized && matchingSlugs.size === 0 ? (
          <p className="rounded-xl border border-rose-400/25 bg-rose-500/5 p-4 text-sm text-rose-200">
            No sections match “{query.trim()}”. Clear the search to see the full tutorial.
          </p>
        ) : null}
        {Children.map(children, (child) => {
          if (!isValidElement<FrameExtras>(child)) return child;
          const slug = child.props.slug;
          const visible = slug ? matchingSlugs.has(slug) : true;
          return cloneElement(child as ReactElement<FrameExtras>, {
            hidden: !visible,
            loggedIn,
            done: slug ? Boolean(progress[slug]) : false,
            onToggleProgress: slug ? () => toggleProgress(slug) : () => {},
          });
        })}
      </div>
    </div>
  );
}

/** Section chrome: id/anchor target, header (title + summary + progress
 * check), then the MDX body. Rendered by the server page; the progress
 * button is the only interactive part. */
export function TutorialSectionFrame({
  slug,
  title,
  summary,
  updatedAt,
  loggedIn,
  done,
  onToggleProgress,
  hidden = false,
  children,
}: {
  slug: string;
  title: string;
  summary: string;
  updatedAt?: string;
  loggedIn: boolean;
  done: boolean;
  onToggleProgress: () => void;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={slug} data-section-slug={slug} className={`${hidden ? "hidden" : ""} scroll-mt-28`} aria-labelledby={`${slug}-title`}>
      <header className="border-b border-amber-500/20 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={`${slug}-title`} className="text-2xl font-bold tracking-tight text-white">
              {title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">{summary}</p>
            {updatedAt ? (
              <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-600">Updated {updatedAt}</p>
            ) : null}
          </div>
          {loggedIn ? (
            <button
              type="button"
              onClick={onToggleProgress}
              aria-pressed={done}
              aria-label={done ? `Mark “${title}” as not completed` : `Mark “${title}” as completed`}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                done
                  ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-300"
                  : "border-amber-400/30 bg-black/30 text-slate-500 hover:text-amber-200"
              }`}
            >
              <Check className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </header>
      <div className="tutorial-prose mt-4">{children}</div>
    </section>
  );
}