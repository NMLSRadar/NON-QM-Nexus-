import type { Metadata } from "next";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import remarkGfm from "remark-gfm";
import { compileMDX } from "next-mdx-remote/rsc";
import { BookOpen, Rocket, ShieldCheck } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";
import { buildMdxComponents } from "@/components/tutorial/mdx-components";
import {
  TutorialPage,
  TutorialSectionFrame,
  type TutorialSectionMeta,
} from "@/components/tutorial/tutorial-page";
import { TutorialEventLogger } from "@/components/tutorial/tutorial-event-logger";
import { TutorialVideoModal } from "@/components/tutorial/tutorial-video-modal";

// Public page. The root layout renders auth-aware chrome (Supabase session)
// on every page, so this page stays force-dynamic exactly like every other
// page in the app — see src/app/document-checklists/page.tsx for why static
// prerendering is intentionally never used here.
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "NON-QM Nexus Tutorial — from new account to first analyzed scenario",
  description:
    "Get a new mortgage broker from signup to their first analyzed NON-QM scenario in under five minutes: Quick Start, Voice & Manual scenario walkthroughs, lender and program guides, and how to read your results.",
  path: "/tutorial",
});

const CONTENT_DIR = path.join(process.cwd(), "content", "tutorial");

interface TutorialFrontmatter {
  slug: string;
  title: string;
  order: number;
  summary: string;
  feature: string;
  updated_at: string;
  keywords: string[];
}

interface LoadedSection {
  meta: TutorialSectionMeta;
  order: number;
  updatedAt: string;
  feature: string;
  body: string;
  file: string;
}

/** Build the ordered section list once per process. Content is compiled
 * server-side (never fetched client-side), and `next build` ships
 * `content/tutorial/**` into the /tutorial serverless function via
 * outputFileTracingIncludes (see next.config.mjs). Section order comes from
 * the frontmatter `order` field, so adding a section = adding one file. */
let cachedSections: LoadedSection[] | null = null;

function loadSections(): LoadedSection[] {
  if (cachedSections) return cachedSections;
  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".mdx"));
  if (files.length === 0) {
    throw new Error("content/tutorial is empty — add at least one .mdx section (see content/tutorial/README.md)");
  }
  cachedSections = files
    .map((file) => {
      const { data, content } = matter(readFileSync(path.join(CONTENT_DIR, file), "utf8"));
      const fm = data as Partial<TutorialFrontmatter>;
      if (!fm.slug || !fm.title || typeof fm.order !== "number" || !fm.summary) {
        throw new Error(
          `content/tutorial/${file}: frontmatter must include slug, title, order (number), summary` +
            (fm.slug ? "" : ` — got ${Object.keys(fm).join(", ") || "no frontmatter"}`)
        );
      }
      const rawUpdatedAt = fm.updated_at as unknown;
      return {
        meta: {
          slug: fm.slug,
          title: fm.title,
          summary: fm.summary,
          keywords: Array.isArray(fm.keywords) ? fm.keywords.map(String) : [],
        },
        order: fm.order,
        // gray-matter (js-yaml) parses unquoted dates into Date objects —
        // always coerce to a plain display string before it reaches React.
        updatedAt: rawUpdatedAt instanceof Date ? rawUpdatedAt.toISOString().slice(0, 10) : String(rawUpdatedAt ?? ""),
        feature: fm.feature ?? "",
        body: content,
        file,
      };
    })
    .sort((a, b) => a.order - b.order || a.meta.title.localeCompare(b.meta.title));
  return cachedSections;
}

/** compileMDX is deterministic per (file, auth state); memoize so repeated
 * requests never re-compile the same sections. */
const compiledCache = new Map<string, Promise<React.ReactElement>>();

async function renderSectionMd(file: string, body: string, authed: boolean): Promise<React.ReactElement> {
  const key = `${file}:${authed}`;
  let pending = compiledCache.get(key);
  if (!pending) {
    pending = compileMDX({
      source: body,
      options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
      components: buildMdxComponents(authed),
    }).then(({ content }) => content);
    compiledCache.set(key, pending);
  }
  return pending;
}

async function hasSession(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

export default async function TutorialPageRoute() {
  const sections = loadSections();
  const authed = await hasSession();
  const contents = await Promise.all(sections.map((s) => renderSectionMd(s.file, s.body, authed)));
  const slugs = sections.map((s) => s.meta.slug);

  return (
    <div id="tutorial-page" className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl">
      <TutorialEventLogger slugs={slugs} />

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-[#0a0a0b] p-6 sm:p-10">
        <div className="gold-ambient" />
        <div className="relative z-10 max-w-3xl">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
            <BookOpen className="h-4 w-4" aria-hidden /> Reference &amp; quick start
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
            NON-QM Nexus, explained in the order you&apos;ll use it
          </h1>
          <p className="mt-3 text-base leading-relaxed text-slate-300 sm:text-lg">
            NON-QM Nexus analyzes a borrower scenario against every eligible lender program
            in its verified catalog and ranks the strongest matches first — so a brand-new
            broker can go from signup to their first analyzed scenario in under five minutes.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href="#quick-start"
              className="gold-button inline-flex min-h-[48px] items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold"
            >
              <Rocket className="h-4 w-4" aria-hidden /> Quick Start (3 steps)
            </a>
            <TutorialVideoModal />
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
            Preliminary scenario analysis only — NON-QM Nexus is a research and decision-support
            tool. It does not issue loan approvals or commitments to lend.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <TutorialPage sections={sections.map((s) => s.meta)} loggedIn={authed}>
          {sections.map((s, i) => (
            <TutorialSectionFrame
              key={s.meta.slug}
              slug={s.meta.slug}
              title={s.meta.title}
              summary={s.meta.summary}
              updatedAt={s.updatedAt}
              loggedIn={authed}
            >
              {contents[i]}
            </TutorialSectionFrame>
          ))}
        </TutorialPage>
      </div>

      <footer className="mt-12 border-t border-amber-500/15 pt-6 text-xs leading-relaxed text-slate-500">
        Something in this guide does not match what you see in the app? The product ships
        first — this page follows the live UI. Questions or corrections:{" "}
        <a href="mailto:support@nonqmnexus.com" className="text-amber-400 hover:underline">
          support@nonqmnexus.com
        </a>
        .
      </footer>
    </div>
  );
}