#!/usr/bin/env node
// Run before recording. A sync pulls everything saved since that agent's last sync, so an agent that has never synced
// under its name would pull the whole real memory on camera. This catches the agents up silently first.
//
//   node demo/preflight.mjs claude muse        (use the source names your agents actually use)
//
// It prints counts only, never memory content, and it does not write any memory.
import { loadEnv, callTool } from "./lib.mjs";

const cfg = loadEnv();
const sources = process.argv.slice(2);
if (!sources.length) { console.error("Give the source names, e.g.: node demo/preflight.mjs claude muse"); process.exit(1); }

for (const source of sources) {
  let pulled = 0, pages = 0, more = true;
  while (more && pages < 20) {
    const r = JSON.parse(await callTool(cfg, "sync_memex", { source, push: [], max_items: 200 }));
    pulled += r.incoming.length; pages++; more = r.has_more;
  }
  console.log(`${source}: caught up (${pulled} item(s) skipped over, ${pages} page(s)). Its next sync returns only what is new.`);
}
