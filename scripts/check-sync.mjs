#!/usr/bin/env node
// Reports on what scheduled (unattended) syncs have saved, so you can check a run after it happens.
// Read-only. By default it prints counts and checks only, never memory text; add --show to see short previews.
//
//   node scripts/check-sync.mjs               last 24 hours
//   node scripts/check-sync.mjs --since 48    last 48 hours
//   node scripts/check-sync.mjs --show        include a 90-character preview of each saved note
//
// Needs MEMEX_URL and MCP_ACCESS_KEY from the environment or .env. Node 18+.
import { existsSync, readFileSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
const URL_MCP = process.env.MEMEX_URL, KEY = process.env.MCP_ACCESS_KEY;
if (!URL_MCP || !KEY) { console.error("Set MEMEX_URL and MCP_ACCESS_KEY (see .env.example)."); process.exit(1); }
const args = process.argv.slice(2);
const sinceHours = Number(args[args.indexOf("--since") + 1]) || 24;
const show = args.includes("--show");

async function rpc(method, params) {
  const res = await fetch(URL_MCP, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-brain-key": KEY },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const line = (await res.text()).split("\n").find((l) => l.startsWith("data:"));
  if (!res.ok || !line) throw new Error(`HTTP ${res.status}`);
  return JSON.parse(line.slice(5)).result;
}

// The cap the server is configured with is stated in the sync_memex description.
const tools = (await rpc("tools/list", {})).tools;
const cap = Number(/push at most (\d+) short items/.exec(tools.find((t) => t.name === "sync_memex")?.description ?? "")?.[1]) || null;

const list = JSON.parse((await rpc("tools/call", { name: "list_thoughts", arguments: { tag: "auto-sync", limit: 100, include_restricted: true } })).content[0].text);
const since = Date.now() - sinceHours * 3600_000;
const notes = list.filter((n) => new Date(n.created_at).getTime() >= since).sort((a, b) => a.created_at.localeCompare(b.created_at));

// Notes saved by one run arrive within seconds of each other; split runs where there is a gap of 2 minutes or more.
const runs = [];
for (const n of notes) {
  const last = runs[runs.length - 1];
  if (last && last.source === n.source && new Date(n.created_at) - new Date(last.notes[last.notes.length - 1].created_at) < 120_000) last.notes.push(n);
  else runs.push({ source: n.source, notes: [n] });
}

console.log(`## Scheduled-sync check, last ${sinceHours} hours\n`);
console.log(`server cap per unattended run: ${cap ?? "unknown"}`);
if (!runs.length) {
  console.log("\nNo notes tagged auto-sync in this window. Either no scheduled run saved anything, or it was a pull-only run.");
  console.log("Check the task's History in your agent for the run and its summary.");
  process.exit(0);
}
let problems = 0;
const flag = (ok, text) => { console.log(`- [${ok ? "x" : " "}] ${text}`); if (!ok) problems++; };
runs.forEach((r, i) => {
  const when = new Date(r.notes[0].created_at).toISOString().replace("T", " ").slice(0, 19) + " UTC";
  console.log(`\nRun ${i + 1}: ${when}, source "${r.source}", ${r.notes.length} note(s) saved`);
  if (cap) flag(r.notes.length <= cap, `within the cap (${r.notes.length} of ${cap})`);
  flag(r.notes.every((n) => (n.tags ?? []).includes("auto-sync")), "every note carries the auto-sync tag");
  flag(r.notes.every((n) => n.sensitivity_tier === "standard"), `none flagged sensitive (${r.notes.filter((n) => n.sensitivity_tier !== "standard").length} flagged)`);
  flag(r.notes.every((n) => n.content.length <= 1000), "none over the length limit");
  const dreamed = r.notes.filter((n) => n.summary).length;
  console.log(`- Dreaming has organized ${dreamed} of ${r.notes.length} (the nightly job runs at 09:00 UTC, so a morning run is organized the next night)`);
  if (show) for (const n of r.notes) console.log(`    ${n.id.slice(0, 8)}  ${n.content.replace(/\s+/g, " ").slice(0, 90)}`);
});
console.log(`\nTo undo a run: ask your agent to "retract what you saved" (retract_thoughts hides only auto-sync notes and is reversible).`);
console.log(problems ? `\n${problems} check(s) need attention.` : "\nAll checks passed.");
process.exit(problems ? 1 : 0);
