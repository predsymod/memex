#!/usr/bin/env node
// Refuses to let secrets or personal details into a commit. Run by the pre-commit hook (.githooks/pre-commit) on the
// staged files, or by hand on the whole tree with: node scripts/check-secrets.mjs --all
//
// It looks for:
//   - key-like strings (API keys, tokens, private keys, long hex strings such as access keys)
//   - anything that looks like a connector URL with a key in it
//   - the literal values in your local .env (so your own keys can never be committed by accident)
//   - personal paths and identifiers listed in .secretscan-extra (one per line, gitignored), such as your project ref
//
// Zero dependencies; needs Node 18+.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const ROOT = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
process.chdir(ROOT);

const PATTERNS = [
  [/(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})/, "API key or token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\b[0-9a-f]{40,}\b/i, "long hex string (looks like an access key or hash of one)"],
  [/[?&]key=[A-Za-z0-9]{16,}/, "URL with a key in it"],
  [/\b(password|passwd|api[_ -]?key|secret|token)\s*(is|[:=])\s*(?!<|your|example|placeholder|xxx|\*)\S{8,}/i, "credential assignment"],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, "JWT"],
];
// Files that legitimately contain these patterns: the scanner itself, the sensitivity scanner, and the migration that mirrors it.
const ALLOW = [/^scripts\/check-secrets\.mjs$/, /^supabase\/functions\/_shared\/sensitivity\.ts$/, /^supabase\/migrations\/0003_/, /^tests\//, /package-lock\.json$/];

const all = process.argv.includes("--all");
const files = execSync(all ? "git ls-files --cached --others --exclude-standard" : "git diff --cached --name-only --diff-filter=ACMR", { encoding: "utf8" })
  .split("\n").map((s) => s.trim()).filter(Boolean);

// Literal values from the local .env (never committed) and the optional extra list.
const literals = [];
for (const f of [".env", ".secretscan-extra"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const v = f === ".env" ? line.split("=").slice(1).join("=").trim() : line.trim();
    if (v.length >= 8 && !v.startsWith("#")) literals.push([v, f === ".env" ? "a value from your .env" : "an entry from .secretscan-extra"]);
  }
}

let bad = 0;
for (const f of files) {
  if (!existsSync(f) || statSync(f).size > 2_000_000) continue;
  if (/\.(png|jpg|jpeg|gif|ico|woff2?|pdf|zip)$/i.test(f)) continue;
  let text;
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  const lines = text.split("\n");
  const allowed = ALLOW.some((re) => re.test(f));
  lines.forEach((line, i) => {
    if (!allowed) for (const [re, why] of PATTERNS) if (re.test(line)) { console.error(`${f}:${i + 1}  ${why}`); bad++; }
    for (const [v, why] of literals) if (line.includes(v)) { console.error(`${f}:${i + 1}  contains ${why}`); bad++; }
  });
}

if (bad) {
  console.error(`\n${bad} possible secret(s) found in ${all ? "the tree" : "staged files"}. Nothing was printed beyond file and line. Fix them, or add a deliberate exception to ALLOW in scripts/check-secrets.mjs.`);
  process.exit(1);
}
console.log(`check-secrets: ${files.length} file(s) clean.`);
