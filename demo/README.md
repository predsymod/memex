# Demo kit

Everything here is fictional: a made-up hiking club, so nothing from a real memory has to appear on screen.

## One-time

```
npx supabase login
npx supabase link --project-ref <your project ref>      # the CLI is used to backdate and to reset
node scripts/doctor.mjs                                  # must be all green
```

## Before each take

```
node demo/reset.mjs --live          # clean slate (safe to run when there is nothing to remove)
node demo/preflight.mjs claude muse # catch each agent up so a live "sync memex" pulls only the new note
node demo/seed.mjs                  # 9 fictional notes, backdated over the last 40 days
```

## The live beats (type only these)

Say "memex" when you save. On claude.ai, plain "remember that ..." goes to Claude's own built-in memory, not to Memex
(found while testing). "save to memex: ..." is just as short and always reaches Memex.

| Beat | Where | You type |
|---|---|---|
| 1. Save a fact | Claude | `save to memex: my favorite color is red` |
| 2. Sync | Muse | `hi, sync memex` |
| 3. Recall | Muse | `what's my favorite color?` |
| 4. Dreaming | terminal | `node demo/dream.mjs` (about 20 seconds) |
| 5. Search the club | any agent | `search memex: when does the Fernwood Trail Club meet?` |
| 6. Secret | Claude | `save to memex: the demo server password is` followed by any made-up password (invent one; it must be fake) |
| 7. Search for it | Claude | `search memex for the demo server password` (it won't come back) |

For beat 5, the answer should be **7am**, with the older 8am note marked superseded right behind it. Other phrasings
(for example "what time does the hiking club meet") also answer 7am but may not surface the stale note, so use the
phrasing above. If an agent doesn't scope the search, ask it to use the tag `fernwood` so only demo notes appear.

## What Dreaming should show after beat 4

- Tags, a one-line summary and a type on each note (`decision` for the group-size cap, `person_note` for the treasurer, `idea` or `reference` for the rest).
- "next Saturday" in the cleanup note turned into a real date.
- A `supersedes` link from the 7am correction to the 8am note, and from the "moved" update to the original cleanup note.
- The two group-size notes linked as duplicates.
- A one-paragraph digest. Note: the digest covers every note Dreaming organized in that run, so keep a take to the demo notes plus the favorite-color note.

## Privacy checklist

- Search and list only with the `fernwood` tag or demo queries. Do not run an unfiltered list or stats on camera.
- Don't show the Supabase dashboard's table editor on the `thoughts` table.
- The Meta dashboard usage panel is safe to show (token counts only).
- After a take: `node demo/reset.mjs --live`.

## Files

`notes.json` the notes. `seed.mjs` creates them through the real MCP server. `dream.mjs` runs Dreaming. `reset.mjs` removes
only what the demo made. `preflight.mjs` catches agents up before recording. `.last-seed` (git-ignored) marks when the last seed ran.
