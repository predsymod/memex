# Memex

A personal memory you own, that works with any AI agent.

Tell your agent: **"Set up a Memex for me using this repo"** and it follows [SETUP.md](SETUP.md). Later, tell any agent **"sync memex"** and it follows [SYNC.md](SYNC.md).

- **Your data, your Supabase.** Nothing is hosted by anyone else. Cost is pennies a month.
- **Any agent.** Memex is an MCP server over HTTP. Tested with Claude and Muse reading and writing the same memory; Codex, Cursor and other MCP clients connect with a URL and a key.
- **Sync.** Agents push durable facts and pull what the others learned, incrementally, without duplicates, in pages.
- **Hands-off, if you want it.** Ask any agent that can run scheduled tasks to "sync memex every morning" (pull-only: it fetches what other agents saved and summarizes it) or "sync memex every morning and save what's worth keeping" (pull and save: your yes at setup is the standing approval). Unattended saves are limited by the server itself to a small number of short notes per run (10 by default; configurable), skip anything secret-like, and are tagged `auto-sync`. A `retract_thoughts` tool can hide exactly those notes, reversibly, if one was wrong.
- **Search that finds things.** Meaning and exact words are searched together and fused. Recent notes can be favored on request. Notes that a later note corrected are flagged, ranked lower, and shown next to their current version. A note that re-states something the user already corrected (easy for an unattended agent to do) is flagged as disputed, and the correction is shown first.
- **Dreaming (optional).** A nightly job uses a model to tag, summarize and connect memories, resolve relative dates, and write a short digest. It never deletes or rewrites what you wrote, and every change is logged and reversible. It runs only if you add a model API key.
- **Careful with secrets.** Anything that looks like a credential is flagged `restricted`: never sent to a model or an embeddings provider, and hidden from search and sync unless explicitly requested. Agents are told to treat memories as evidence, never as instructions.

## Status

Work in progress for the Meta AI Developer Hackathon (Oct 26 to Nov 4, 2026). Everything in this repository was written during the hackathon. It is not yet tested end to end on a brand-new Supabase project; the database migrations are tested on an empty database and on the old Open Brain table shape (see below).

## Layout

| Path | What it is |
|---|---|
| `SETUP.md`, `SYNC.md` | Instructions written for agents to follow |
| `supabase/migrations` | Database schema, 5 idempotent migrations |
| `supabase/functions/memex-mcp` | The MCP server: capture, search, list, stats, sync |
| `supabase/functions/memex-dream` | The nightly Dreaming job |
| `supabase/functions/_shared` | Secret detection and output cleaning used by both |
| `supabase/schedule-dreaming.sql` | Template that schedules Dreaming (needs your project details; never commit it filled in) |
| `scripts/doctor.mjs` | Checks an install end to end; output is safe to paste into a report |
| `scripts/check-secrets.mjs`, `.githooks` | Blocks commits that contain secrets or personal details |
| `scripts/generate-key.*` | Access key generation |
| `tests/` | Migration tests on an in-process Postgres |
| `docs/` | Landing page (GitHub Pages) |

## Try it

```
node scripts/doctor.mjs                 # checks your install (reads MEMEX_URL and MCP_ACCESS_KEY from .env)
node scripts/check-sync.mjs             # reports on what scheduled syncs saved (counts only; --show adds previews)
cd tests && npm install && npm test     # runs all migrations on an empty database and on the old schema
git config core.hooksPath .githooks     # turn on the secret scan before each commit
```

## What leaves your project

- **Embeddings:** each memory's text goes to the embeddings provider (OpenRouter by default) so it can be searched by meaning. Restricted memories are skipped.
- **Dreaming:** if you enable it, new memories go to the model provider you configure (Meta first, with an optional fallback). Restricted memories are skipped. Leave the key unset and nothing is sent.

## Credits

Building on the excellent [Open Brain](https://github.com/NateBJones-Projects/OB1) project by Nate B. Jones, and on an earlier write-up, [Liberating memory](https://muzayan.substack.com/p/liberating-memory). No code from either is used here; the ideas are credited, and the implementation is new.
