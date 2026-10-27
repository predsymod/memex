#!/usr/bin/env node
// Seeds the demo notes (a made-up hiking club, nothing personal) through the real MCP server, then backdates them so
// Dreaming sees a believable timeline (corrections come after the notes they correct). Every note is tagged
// "memex-demo" so `reset.mjs` can remove exactly these and nothing else.
//
//   node demo/seed.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_DIR, loadEnv, callTool, sql, writeMarker } from "./lib.mjs";

const cfg = loadEnv();
const notes = JSON.parse(readFileSync(join(DEMO_DIR, "notes.json"), "utf8"));

const existing = sql("select count(*)::int as n from thoughts where tags @> array['memex-demo']");
if (existing[0]?.n > 0) {
  console.error(`${existing[0].n} demo notes already exist. Run: node demo/reset.mjs`);
  process.exit(1);
}

writeMarker(new Date().toISOString());
const made = [];
for (const n of notes) {
  const out = JSON.parse(await callTool(cfg, "capture_thought", { content: n.content, source: "claude", tags: ["memex-demo", "fernwood"] }));
  // The id goes into SQL below, so insist it really is a UUID.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(out.id) || !Number.isInteger(n.daysAgo)) {
    console.error("Unexpected id or daysAgo; stopping."); process.exit(1);
  }
  made.push({ id: out.id, daysAgo: n.daysAgo });
  console.log(`${out.status.padEnd(9)} ${n.content.slice(0, 64)}`);
}

// Spread the timestamps over the past weeks so "next Saturday" and "Correction:" resolve against real dates.
sql(made.map((m, i) => `update thoughts set created_at = now() - interval '${m.daysAgo} days' + interval '${i} minutes', updated_at = now() where id = '${m.id}';`).join("\n"));
console.log(`\nSeeded ${made.length} demo notes, backdated. Next: node demo/dream.mjs`);
