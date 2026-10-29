// Names and tags that only the server and Dreaming may write, and a paginated read for tables that can pass
// PostgREST's default row cap (about 1000 rows per request).

// Notes written by Dreaming carry source "dream" and are treated differently everywhere (skipped by enrichment,
// excluded from overview input, anchors for later runs), so a client must not be able to claim that name.
const RESERVED_SOURCES = new Set(["dream"]);
export const isReservedSource = (s: string): boolean => RESERVED_SOURCES.has(s.trim().toLowerCase());

// Tags that decide what `retract_thoughts` may hide. Only the server sets them: "auto-sync" on unattended saves,
// "synthesis" and "digest" on what Dreaming writes. A client or a model must not be able to add them to a note.
const RESERVED_TAGS = new Set(["auto-sync", "synthesis", "digest"]);
export const stripReservedTags = (tags: string[]): string[] => tags.filter((t) => !RESERVED_TAGS.has(t.trim().toLowerCase()));

// Reads every row of a query, a page at a time. `page` must build the same ordered query for the given range.
// A failed page throws instead of ending the read early: a silently short list would drop supersede or contradict links.
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error?: { message: string } | null }>,
  size = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0;; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < size) return out;
  }
}
