#!/usr/bin/env node
// Runs Dreaming now (it normally runs nightly) and prints counts only, never memory content.
//
//   node demo/dream.mjs
import { loadEnv } from "./lib.mjs";

const cfg = loadEnv();
// --synthesize also writes topic overviews even when nothing new was processed.
const url = cfg.dreamUrl + (process.argv.includes("--synthesize") ? "?synthesize=1" : "");
for (let i = 1; i <= 4; i++) {
  const t0 = Date.now();
  const res = await fetch(url, { method: "POST", headers: { "x-brain-key": cfg.key } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) { console.error(`Dreaming failed: HTTP ${res.status} ${j.error ?? ""}`); process.exit(1); }
  if (j.skipped) { console.log("Dreaming is off: no model key is configured."); break; }
  console.log(`run ${i}: ${j.processed} organized, ${j.links} links, ${j.merged} merged, ${j.remaining} left, digest=${j.digest}, ${((Date.now() - t0) / 1000).toFixed(1)}s, tokens in/out ${j.tokens?.input}/${j.tokens?.output}, overviews: ${j.synthesis?.created ?? 0} new, ${j.synthesis?.updated ?? 0} refreshed${j.synthesis && Object.keys(j.synthesis.skipped).length ? ` (skipped: ${Object.entries(j.synthesis.skipped).map(([k, v]) => `${k}=${v}`).join(", ")})` : ""}`);
  if (j.remaining === 0) break;
}
