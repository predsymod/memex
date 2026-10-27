#!/usr/bin/env node
// Runs Dreaming now (it normally runs nightly) and prints counts only, never memory content.
//
//   node demo/dream.mjs
import { loadEnv } from "./lib.mjs";

const cfg = loadEnv();
for (let i = 1; i <= 4; i++) {
  const t0 = Date.now();
  const res = await fetch(cfg.dreamUrl, { method: "POST", headers: { "x-brain-key": cfg.key } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) { console.error(`Dreaming failed: HTTP ${res.status} ${j.error ?? ""}`); process.exit(1); }
  if (j.skipped) { console.log("Dreaming is off: no model key is configured."); break; }
  console.log(`run ${i}: ${j.processed} organized, ${j.links} links, ${j.merged} merged, ${j.remaining} left, digest=${j.digest}, ${((Date.now() - t0) / 1000).toFixed(1)}s, tokens in/out ${j.tokens?.input}/${j.tokens?.output}`);
  if (j.remaining === 0) break;
}
