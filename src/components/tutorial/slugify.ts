/** Stable anchor slug used for every tutorial heading id (mirrors the
 * section slugs: lowercase, hyphens, no punctuation). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}