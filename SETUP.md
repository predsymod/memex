# SETUP.md: instructions for an AI agent

The user asked you to set up Memex, a personal memory they own and any agent can use. Follow these steps in order, verify each one, and stop to ask the user wherever a step says HUMAN.

## Rules

- Never print, log or commit secrets. Show the access key to the user once so they can save it, then don't repeat it.
- Never put a secret in a command you show back, a file in the repo, or an issue report. Use environment variables or the gitignored `.env`.
- Prefer the `x-brain-key` header for the key. Use `?key=` in a URL only for a client that can't send headers (see step 8).
- Never ask the user to paste the key or a URL containing it into the chat: the chat goes to a model provider. Have them set an environment variable themselves and reference it (for example `{env:MEMEX_KEY}` in opencode).
- If you cannot run shell commands, give the user the exact commands and ask them to run them.
- On Windows PowerShell, use `npx.cmd supabase ...` if `npx supabase` is blocked by the execution policy. Do not change system security settings.

## 1. Prerequisites
Check that `git --version` and either `supabase --version` or `npx supabase --version` work. If the Supabase CLI is missing, `npx supabase` is enough. Deno is optional, only for type-checking.

## 2. Accounts (HUMAN)
- A Supabase account and a new, empty project. Ask for the project ref (the id in the project URL). Free projects pause after about a week of inactivity. When creating the project, the defaults are fine; unchecking "Automatically expose new tables" is good hygiene (Memex locks its own tables down either way).
- Recommended: an OpenRouter account with a little credit, and an API key. It is used for embeddings (fractions of a cent per thousand thoughts), which is what lets search find notes by meaning. Without it Memex still works, but notes are saved unembedded and search is keyword-only; scheduled (unattended) saves are skipped because they need embeddings to check for repeats. Tell the user this trade-off and let them choose.
- Optional, for Dreaming: a Meta Model API key from https://dev.meta.ai. Dreaming sends new memories to that provider, so tell the user this before enabling it.

Have the user put secrets in the repo's gitignored `.env` themselves (copy `.env.example`), or type them into the Supabase dashboard under Edge Functions → Secrets. Do not ask them to paste secrets into the chat.

## 3. Get the code
Clone this repo into a new folder and enter it.

## 4. Link and migrate
```
supabase login            # HUMAN: opens a browser
supabase link --project-ref <PROJECT_REF>
supabase db push --linked # applies every file in supabase/migrations in order (0001 to 0006 at the time of writing)
```
`db push` normally needs no database password, because the CLI signs in with a temporary role. If it does ask, the user sets or resets it in the dashboard (Project Settings → Database). The migrations are idempotent and safe to re-run.
Verify: the `thoughts`, `thought_links`, `sync_cursors` and `dream_log` tables exist.

## 5. Generate the access key
Run `scripts/generate-key.sh` (or `scripts/generate-key.ps1` on Windows). Show it to the user once and tell them to save it in a password manager, and put it in `.env` as `MCP_ACCESS_KEY`.

## 6. Set secrets
Have the user fill in `.env` (copy `.env.example`; it is git-ignored) with `MCP_ACCESS_KEY` and, unless they chose to skip embeddings, `OPENROUTER_API_KEY`. Every `NAME=` line in the file is sent as a secret, so a blank one becomes an empty secret: delete the lines you are not using (or leave them commented out). If the user later changes a secret in the dashboard, that is fine too; saving a new value under the same name replaces it. Then:
```
supabase secrets set --env-file .env
```
Reading from the file keeps keys out of the command line, shell history and process lists. (The CLI skips names it reserves.) Never type a key into a `supabase secrets set NAME=value` command.

Only if a client can pass the key in the URL and nothing else, add `ALLOW_URL_KEY=true` to `.env` before running it. The key then appears in server logs, so tell the user.

## 7. Deploy
```
supabase functions deploy memex-mcp --no-verify-jwt
supabase functions deploy memex-dream --no-verify-jwt
```
The server URL is `https://<PROJECT_REF>.supabase.co/functions/v1/memex-mcp`.

## 8. Connect this agent and any others
- Claude Code: `claude mcp add --transport http memex <URL> --header "x-brain-key: <KEY>"`
- Other agents: add an MCP server of type HTTP with that URL and the `x-brain-key` header.
- opencode: in `opencode.json`, `"mcp": {"memex": {"type": "remote", "url": "{env:MEMEX_URL}", "headers": {"x-brain-key": "{env:MEMEX_KEY}"}, "enabled": true}}`. The user sets `MEMEX_URL` and `MEMEX_KEY` in their own terminal and restarts opencode.
- Clients that only take a URL (such as claude.ai custom connectors): use `<URL>?key=<KEY>` and set `ALLOW_URL_KEY=true` in step 6.
- Give each tool its own copy of the key; there is no per-tool setup on the server.
- Make agents consult Memex without being told. The server's instructions and the `search_thoughts` description already tell an agent to search Memex whenever an answer could depend on the user's past context. An agent with built-in memory or past-chat search (claude.ai and Muse are two) tends to answer from that alone and never call Memex. Memex is meant to add to an agent's own memory, not replace it, so tell the user and offer to fix it with one sentence they say to that agent in chat, with no settings menus: "Going forward, my personal context also lives in Memex. For anything about me, my family, my projects or my past decisions, use your own memory and also search Memex, and combine what you find. Please save this as a standing preference." The agent saves it as a standing preference. For a client that has a persistent-instructions file instead (`CLAUDE.md`, `AGENTS.md`, custom instructions), put the same sentence there. Do this only if the user agrees. Some clients ask for approval on each Memex call; "Allow once" is fine, and "Always allow" is the user's choice.

## 9. Verify
Call `capture_thought` with "Memex setup test", then `search_thoughts` for "setup test". Both must succeed. (If the result says `Saved without an embedding`, the `OPENROUTER_API_KEY` secret is missing or wrong, which is fine only if the user chose to skip embeddings. The doctor cannot catch this, because search quietly falls back to keywords when embeddings are down.) Then delete the test thought, or tell the user it is safe to delete. Tell the user setup is done and that they can say "sync memex" in any agent (see SYNC.md).

## 10. Optional: Dreaming
A nightly job that tags, summarizes and connects memories. Skip it if the user has no Meta or OpenRouter key; Memex works without it.
Have the user add `META_API_KEY` and `META_REASONING_EFFORT=minimal` to `.env`, then run `supabase secrets set --env-file .env` again.

Then substitute `<PROJECT_REF>` and `<DREAM_KEY>` (the access key) in `supabase/schedule-dreaming.sql` and run it once, for example with `supabase db query --linked --file <file>`. Do not commit the substituted file; delete it afterwards. Dreaming runs daily at 09:00 UTC. If the user later rotates the access key, update the `memex_dream_key` secret in Supabase Vault too, or the nightly call gets a 401.

## 11. If anything went wrong: offer a setup report
If any step failed, needed a retry, or was confusing, tell the user and offer to write a short report so the repo can improve. Keep it to:
- which step, and what happened
- the error text, trimmed
- what fixed it, and a suggested change to these instructions
- your agent name and version, and the operating system

Strip everything sensitive first: keys, URLs containing keys, the project ref, email addresses, usernames in file paths, and any memory content. Show the user the finished report. Only they decide whether to post it: give them the repository's Issues link and let them paste it, or not. Never post it yourself.
