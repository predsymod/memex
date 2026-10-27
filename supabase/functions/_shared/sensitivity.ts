// Deterministic sensitivity scan and output hygiene, shared by memex-mcp and memex-dream.
// Keep the restricted patterns in sync with supabase/migrations/0003_type_importance_sensitivity.sql.

export type Tier = "standard" | "personal" | "restricted";
const RANK: Record<Tier, number> = { standard: 0, personal: 1, restricted: 2 };

const RESTRICTED_PATTERNS: RegExp[] = [
  /\b\d{3}-\d{2}-\d{4}\b/, // US social security number
  /\b(?:\d[ -]?){13,19}\b/, // card-like number
  /(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})/, // API keys and tokens
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(password|passwd|api[_ -]?key|secret|token)\s*(is|[:=])\s*\S{6,}/i,
  /\b[0-9a-f]{40,}\b/i, // long hex strings, such as access keys
];

// Errs toward flagging: a false "restricted" only hides a memory from search and from the LLM.
export function scanTier(text: string): Tier {
  return RESTRICTED_PATTERNS.some((re) => re.test(text)) ? "restricted" : "standard";
}

export function maxTier(a: Tier, b: Tier): Tier {
  return RANK[a] >= RANK[b] ? a : b;
}

export function asTier(v: unknown): Tier {
  return v === "personal" || v === "restricted" ? v : "standard";
}

// Strip control characters and cap length. Used on every string an LLM hands back before it is stored.
export function clean(v: unknown, max: number): string {
  // deno-lint-ignore no-control-regex
  return String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}
