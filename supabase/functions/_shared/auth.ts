// Constant-time comparison, so response timing doesn't reveal how much of a key was right.
const enc = new TextEncoder();

export function timingSafeEqual(given: string, expected: string): boolean {
  const a = enc.encode(given);
  const b = enc.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

// True if `given` equals any of `keys`. Checks every key, with no early exit.
export function matchesAny(given: string | null | undefined, keys: string[]): boolean {
  if (!given) return false;
  let ok = false;
  for (const k of keys) if (timingSafeEqual(given, k)) ok = true;
  return ok;
}

// Parses MCP_ACCESS_KEYS ("claude:key1,codex:key2") into [name, key] pairs. An entry without a name, a colon or a key is
// dropped rather than guessed at, so a typo can't turn into a key under a garbled name.
export function parseClientKeys(raw: string | undefined): [string, string][] {
  const out: [string, string][] = [];
  for (const p of (raw ?? "").split(",")) {
    const i = p.indexOf(":");
    if (i > 0 && i < p.length - 1) out.push([p.slice(0, i), p.slice(i + 1)]);
  }
  return out;
}
