import type { ReactNode } from "react";
import { Lightbulb, AlertTriangle, Info, Camera } from "lucide-react";
import { StatusBadge, Pill } from "@/components/ui";
import { CopyButton } from "./copy-button";
import { TryButton } from "./try-button";
import { slugify } from "./slugify";

/* ------------------------------------------------------------------ */
/* Section content primitives — everything rendered inside an MDX       */
/* section. Copy lives in the MDX files; these components only provide  */
/* the chrome (icons, borders, labels that are part of the component).  */
/* ------------------------------------------------------------------ */

export function Callout({
  variant = "tip",
  children,
}: {
  variant?: "tip" | "mistake" | "note";
  children: ReactNode;
}) {
  const styles = {
    tip: {
      border: "border-emerald-400/25",
      bg: "bg-emerald-500/5",
      icon: <Lightbulb className="h-4 w-4 text-emerald-300" aria-hidden />,
      label: "Tip",
      labelClass: "text-emerald-300",
    },
    mistake: {
      border: "border-rose-400/25",
      bg: "bg-rose-500/5",
      icon: <AlertTriangle className="h-4 w-4 text-rose-300" aria-hidden />,
      label: "Common mistake",
      labelClass: "text-rose-300",
    },
    note: {
      border: "border-amber-400/25",
      bg: "bg-amber-500/5",
      icon: <Info className="h-4 w-4 text-amber-300" aria-hidden />,
      label: "Note",
      labelClass: "text-amber-300",
    },
  }[variant];

  return (
    <aside className={`mt-4 rounded-xl border p-4 ${styles.border} ${styles.bg}`}>
      <p className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide ${styles.labelClass}`}>
        {styles.icon}
        {styles.label}
      </p>
      <div className="mt-1.5 space-y-2 text-sm text-slate-200">{children}</div>
    </aside>
  );
}

/** Clearly labeled media placeholder — NOT a broken embed. Until a real
 * screenshot is captured (see content/tutorial/MEDIA.md), each section shows
 * exactly what to record and how. */
export function Screenshot({
  title,
  alt,
  script,
}: {
  title: string;
  alt: string;
  script: string;
}) {
  return (
    <figure
      role="img"
      aria-label={alt}
      className="my-5 overflow-hidden rounded-2xl border border-dashed border-amber-400/30 bg-black/40"
    >
      <figcaption className="flex items-center gap-2 border-b border-amber-400/20 bg-amber-500/5 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-amber-300">
        <Camera className="h-3.5 w-3.5" aria-hidden />
        Screenshot: {title}
      </figcaption>
      <div className="px-4 py-4">
        <p className="text-xs font-medium text-slate-300">What to capture</p>
        <p className="mt-1 text-sm text-slate-200">{alt}</p>
        <p className="mt-3 text-xs font-medium text-slate-300">Recording script</p>
        <pre className="mt-1 whitespace-pre-wrap rounded-lg border border-amber-400/15 bg-black/50 p-3 font-mono text-[12px] leading-relaxed text-slate-300">
          {script}
        </pre>
        <p className="mt-2 text-[11px] text-slate-500">
          Placeholder — capture steps live in <code>content/tutorial/MEDIA.md</code>.
        </p>
      </div>
    </figure>
  );
}

/** Glossary entry — renders an h3 with a stable `glossary-<id>` anchor so
 * walkthroughs can deep-link to a term, e.g. /tutorial#glossary-dscr. The
 * term name is `name`; the definition (markdown allowed) is children. */
export function GlossaryTerm({ id, name, children }: { id: string; name: string; children: ReactNode }) {
  return (
    <div className="mt-6 first:mt-0">
      <h3 id={`glossary-${id}`} className="scroll-mt-28 text-base font-bold text-white">
        {name}
      </h3>
      <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-slate-300">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Heading anchors — every h2/h3 in a section gets a deep-link id so    */
/* the outline sidebar, search, and "jump to section" all have targets. */
/* ------------------------------------------------------------------ */

function AnchorHeading({
  level,
  children,
}: {
  level: "h2" | "h3";
  children: ReactNode;
}) {
  const id = slugify(typeof children === "string" ? children : String(children ?? ""));
  const Tag = level as "h2" | "h3";
  const base = level === "h2" ? "text-xl font-bold text-white scroll-mt-28" : "text-base font-semibold text-white scroll-mt-28";
  return (
    <Tag id={id} className={`${base} group mt-8 flex items-center gap-2`}>
      <a href={`#${id}`} className="text-slate-500 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100" aria-label={`Link to ${String(children ?? "")}`}>
        #
      </a>
      <span>{children}</span>
    </Tag>
  );
}

/** Build the component map handed to compileMDX. `authed` (from the server
 * page's session) decides whether "Try it" buttons read as "Open the tool"
 * deep links or "Start free trial" CTAs — never guessed on the client. */
export function buildMdxComponents(authed: boolean) {
  return {
    h2: (props: { children?: ReactNode }) => <AnchorHeading level="h2">{props.children}</AnchorHeading>,
    h3: (props: { children?: ReactNode }) => <AnchorHeading level="h3">{props.children}</AnchorHeading>,
    StatusBadge,
    Pill,
    Copy: CopyButton,
    TryIt: (props: { href: string; label: string; feature: string }) => (
      <TryButton href={props.href} label={props.label} feature={props.feature} authed={authed} />
    ),
    Tip: (props: { children?: ReactNode }) => <Callout variant="tip">{props.children}</Callout>,
    Mistake: (props: { children?: ReactNode }) => <Callout variant="mistake">{props.children}</Callout>,
    Note: (props: { children?: ReactNode }) => <Callout variant="note">{props.children}</Callout>,
    Screenshot,
    GlossaryTerm,
  };
}