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
  for (const [n, entry] of (raw ?? "").split(",").entries()) {
    const p = entry.trim(); // a stray space or Windows line ending from an editor or .env must not become part of a key
    if (!p) continue;
    const i = p.indexOf(":");
    const name = p.slice(0, i).trim(), key = p.slice(i + 1).trim();
    if (i > 0 && name && key) out.push([name, key]);
    else console.warn(`MCP_ACCESS_KEYS entry ${n + 1} ignored: expected name:key`); // never log the value itself
  }
  return out;
}
