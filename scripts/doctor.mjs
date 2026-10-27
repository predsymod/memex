#!/usr/bin/env node
// Checks a Memex install end to end and prints a checklist that is safe to paste into a setup report:
// it never prints keys, key-bearing URLs or your project ref. Read-only: it writes nothing to your memory.
//
//   node scripts/doctor.mjs
//
// Needs MEMEX_URL (https://<project>.supabase.co/functions/v1/memex-mcp) and MCP_ACCESS_KEY, from the environment
// or from a .env file in the repo root. Node 18+.
import { existsSync, readFileSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
const URL_MCP = process.env.MEMEX_URL;
const KEY = process.env.MCP_ACCESS_KEY;
const EXPECTED_TOOLS = ["capture_thought", "search_thoughts", "list_thoughts", "thought_stats", "sync_memex"];

const results = [];
const note = (ok, name, detail = "") => {
  results.push({ ok, name });
  console.log(`- [${ok === null ? "-" : ok ? "x" : " "}] ${name}${detail ? `: ${detail}` : ""}`);
};

async function rpc(method, params) {
  const res = await fetch(URL_MCP, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-brain-key": KEY },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.text();
  const line = body.split("\n").find((l) => l.startsWith("data:"));
  return { status: res.status, json: line ? JSON.parse(line.slice(5)) : (() => { try { return JSON.parse(body); } catch { return null; } })() };
}
const tool = async (name, args = {}) => {
  const r = await rpc("tools/call", { name, arguments: args });
  if (r.status !== 200 || r.json?.error) throw new Error(`HTTP ${r.status}`);
  const t = r.json?.result?.content?.[0]?.text ?? "";
  if (r.json?.result?.isError) throw new Error(t.slice(0, 120).replace(/https?:\/\/\S+/g, "<url>"));
  return t;
};

console.log("## Memex doctor\n");
console.log(`node ${process.version}, ${process.platform}/${process.arch}\n`);

note(!!URL_MCP, "MEMEX_URL is set", URL_MCP ? "" : "add MEMEX_URL=https://<project>.supabase.co/functions/v1/memex-mcp to .env");
note(!!KEY, "MCP_ACCESS_KEY is set", KEY ? `${KEY.length} characters` : "add it to .env");
if (!URL_MCP || !KEY) { console.log("\nCannot continue without both values."); process.exit(1); }
if (/[?&]key=/.test(URL_MCP)) note(false, "MEMEX_URL must not contain ?key=", "put the key in MCP_ACCESS_KEY instead");

try {
  const bad = await fetch(URL_MCP, { method: "POST", headers: { "content-type": "application/json", "x-brain-key": "wrong" }, body: "{}" });
  note(bad.status === 401, "a wrong key is rejected", `HTTP ${bad.status}`);
  const get = await fetch(URL_MCP, { method: "GET", headers: { "x-brain-key": KEY } });
  note(get.status === 405, "GET is refused (prevents hung connections)", `HTTP ${get.status}`);
} catch (e) { note(false, "server reachable", String(e.message)); process.exit(1); }

try {
  const r = await rpc("tools/list", {});
  const names = (r.json?.result?.tools ?? []).map((t) => t.name);
  note(r.status === 200, "your key is accepted", `HTTP ${r.status}`);
  const missing = EXPECTED_TOOLS.filter((t) => !names.includes(t));
  note(missing.length === 0, "all 5 tools are listed", missing.length ? `missing: ${missing.join(", ")}` : "");
} catch (e) { note(false, "tools/list", e.message); }

let total = null;
try {
  const stats = JSON.parse(await tool("thought_stats"));
  total = stats.total;
  note(true, "database reachable (thought_stats)", `${stats.total} memories`);
} catch (e) { note(false, "database reachable (thought_stats)", e.message + " (did the migrations run?)"); }

try {
  const hits = JSON.parse(await tool("search_thoughts", { query: "memex doctor check", limit: 1 }));
  note(Array.isArray(hits), "search works", "embeddings and the search function respond");
} catch (e) { note(false, "search works", e.message + " (check OPENROUTER_API_KEY and migration 0005)"); }

try {
  const dreamUrl = URL_MCP.replace(/\/memex-mcp$/, "/memex-dream") + "?dry=1";
  const r = await fetch(dreamUrl, { method: "POST", headers: { "x-brain-key": KEY } });
  const j = await r.json().catch(() => ({}));
  if (j.skipped) note(null, "Dreaming (optional)", "off: no model key configured, which is fine");
  else if (r.status === 200 && j.results) note(true, "Dreaming (optional)", `on, answered by ${j.provider} in ${j.ms} ms`);
  else note(false, "Dreaming (optional)", `HTTP ${r.status}${j.error ? " " + String(j.error).slice(0, 80) : ""}`);
} catch (e) { note(false, "Dreaming (optional)", e.message); }

const failed = results.filter((r) => r.ok === false).length;
console.log(`\n${failed ? `${failed} check(s) failed.` : "All checks passed."}${total === 0 ? " The memory is empty, which is expected on a new install." : ""}`);
process.exit(failed ? 1 : 0);
