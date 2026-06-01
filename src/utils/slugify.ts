/** Convert a human-readable name to a URL-safe slug. */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
