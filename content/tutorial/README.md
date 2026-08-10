# Adding or editing a tutorial section

`/tutorial` is a single page composed from **one MDX file per section** in this
folder. No code change is needed to add, remove, or reorder a section — the
`order` frontmatter field drives everything.

## How to add a section

1. **Drop in a new file** `content/tutorial/your-slug.mdx` with this frontmatter:

   ```markdown
   ---
   slug: your-slug               # must be unique; becomes the #anchor and the
                                 # analytics event's section slug
   title: Your Section Title
   order: 55                     # number; sections sort ascending, ties by title
   summary: One line on what this is for.  # shown under the section title + in search
   feature: your-feature         # slug sent with tutorial_cta_clicked events
   updated_at: 2026-08-10
   keywords:
     - words
     - the search box matches
   ---
   ```

2. **Write the body** following the shared template (see existing sections):
   a “### Do it in N steps” numbered list (one action per step, imperative),
   optionally a media slot, then `<TryIt … />`, then `<Tip>` / `<Mistake>` /
   `<Note>` callouts (2–4 bullets max).

   Available MDX components (imported automatically by the page — do **not**
   import them in the file):

   | Component | Purpose |
   | --- | --- |
   | `<TryIt href label feature />` | “Try it” deep link; becomes “Start free trial” for anonymous visitors |
   | `<Copy text={\`…\`} label />` | Copy-to-clipboard for example scripts/questions |
   | `<StatusBadge status="…" />` | The app&apos;s real match-status badge (shared component — never drifts) |
   | `<Pill tone=…>` | The app&apos;s real pill badge |
   | `<Tip>/<Mistake>/<Note>` | Callouts |
   | `<Screenshot title alt script />` | Media placeholder (see MEDIA.md) |
   | `<GlossaryTerm id name>` | Glossary entry with `#glossary-<id>` anchor |
   | Markdown tables | Supported (GFM); styled automatically |

3. **Add the screenshot to `MEDIA.md`** if the section shows media — the
   manifest is the contract for re-capturing when the UI changes.

## How to edit a section

Edit the section&apos;s MDX file. Keep copy in the MDX, not in TSX — the page
components (`src/components/tutorial/*`) render content only; if you catch
instructional text in a component file, it belongs in the MDX.

## How to reorder

Change the `order` numbers. The page reads the folder fresh per process, so a
deploy picks up new/reordered sections automatically — no code change, no route
change. (Section slugs referenced from the hero buttons or the FAQ are
hard-anchored, so reordering must keep the `slug` values stable.)

## Experience & product accuracy rules

- The page follows the **live UI**. If a walkthrough step doesn&apos;t match the
  app anymore, fix the copy after (or while) the UI ships — never document a
  feature that doesn&apos;t exist.
- Audience: seasoned mortgage professionals who know the business; explain what
  NEXUS does with a term, never the term itself. No borrower PII in examples.
- Keep the disclaimer standing: preliminary analysis, lender is final word.