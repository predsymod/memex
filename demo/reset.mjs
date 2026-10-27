#!/usr/bin/env node
// Removes the demo notes and what Dreaming made from them, so a take can start over.
//
//   node demo/reset.mjs          removes notes tagged "memex-demo", plus digests written since the last seed
//   node demo/reset.mjs --live   also removes the notes made live on camera since the last seed: anything mentioning
//                                "favorite color" and anything flagged restricted (the fake secret)
//
// It never touches older notes, and never touches sync cursors.
import { sql, readMarker } from "./lib.mjs";

const live = process.argv.includes("--live");
const marker = readMarker();
if (!marker) console.warn("No .last-seed marker found: removing tagged demo notes only.");
if (marker && !/^[0-9T:.\-Z+]+$/.test(marker)) { console.error("Marker looks wrong; delete demo/.last-seed."); process.exit(1); }

const parts = ["tags @> array['memex-demo']"];
if (marker) parts.push(`(source = 'dream' and created_at >= '${marker}')`);
if (marker && live) parts.push(`(created_at >= '${marker}' and (content ilike '%favorite color%' or sensitivity_tier = 'restricted'))`);
const cond = parts.join(" or ");

const before = sql(`select count(*)::int as n from thoughts where ${cond}`)[0]?.n ?? 0;
// dream_log rows point at thoughts, links cascade.
sql(`delete from dream_log where thought_id in (select id from thoughts where ${cond});\ndelete from thoughts where ${cond};`);
const left = sql(`select count(*)::int as n from thoughts where ${cond}`)[0]?.n ?? 0;
const total = sql("select count(*)::int as n from thoughts")[0]?.n ?? 0;
console.log(`Removed ${before - left} note(s). ${left} matching left. ${total} memories in total.`);
