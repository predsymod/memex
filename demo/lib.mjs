// Shared helpers for the demo scripts. Zero dependencies; Node 18+.
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const DEMO_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(DEMO_DIR, "..");
export const MARKER = join(DEMO_DIR, ".last-seed");

export function loadEnv() {
  const p = join(ROOT, ".env");
  if (existsSync(p)) {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
  const url = process.env.MEMEX_URL, key = process.env.MCP_ACCESS_KEY;
  if (!url || !key) { console.error("Set MEMEX_URL and MCP_ACCESS_KEY in .env (see .env.example)."); process.exit(1); }
  return { url, key, dreamUrl: url.replace(/\/memex-mcp$/, "/memex-dream") };
}

// Calls one MCP tool and returns its text.
export async function callTool(cfg, name, args) {
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-brain-key": cfg.key },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const body = await res.text();
  const line = body.split("\n").find((l) => l.startsWith("data:"));
  const j = line ? JSON.parse(line.slice(5)) : null;
  if (!res.ok || !j || j.error || j.result?.isError) throw new Error(`${name} failed (HTTP ${res.status})`);
  return j.result.content[0].text;
}

// Runs SQL against the linked Supabase project through the CLI (needs `supabase login` and `supabase link` done once).
// Returns the rows of the last statement.
export function sql(query) {
  const file = join(tmpdir(), `memex-demo-${process.pid}.sql`);
  writeFileSync(file, query);
  try {
    const r = spawnSync(`npx supabase db query --linked --file "${file}"`, { shell: true, encoding: "utf8", cwd: ROOT });
    const out = r.stdout ?? "";
    const a = out.indexOf("{"), b = out.lastIndexOf("}");
    if (r.status !== 0 || a < 0) throw new Error("supabase CLI failed. Run `npx supabase login` and `npx supabase link` first.\n" + (r.stderr ?? "").slice(0, 300));
    return JSON.parse(out.slice(a, b + 1)).rows ?? [];
  } finally { rmSync(file, { force: true }); }
}

export const readMarker = () => (existsSync(MARKER) ? readFileSync(MARKER, "utf8").trim() : null);
export const writeMarker = (iso) => writeFileSync(MARKER, iso + "\n");
