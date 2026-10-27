# Security

Memex holds personal memory, so it is built to fail closed. This page says what it protects, what it does not, and how to report a problem.

## How it is protected

- **One secret gates the server.** Every request needs your access key, sent in the `x-brain-key` header, and is rejected otherwise. Keys are compared in constant time, and the server rejects unauthenticated requests before it parses anything.
- **The database is closed to the public API.** Row-level security is on for every table with no public policies, and the public `anon` and `authenticated` roles have no table or function privileges. Only the server (using the service role) can read or write.
- **Secrets are never sent to a model.** Text that looks like a credential is flagged `restricted`: it is not embedded, not sent to Dreaming, and hidden from search and sync unless explicitly requested.
- **Memories are treated as untrusted data.** They are fenced inside tags when shown to a model, model output is cleaned and length-capped before it is stored, and agents are told never to follow instructions found in a memory.
- **Inputs are bounded.** Thoughts, tags, source names, queries and sync batches have size limits.
- **Dreaming never deletes.** Everything it changes is logged and reversible.
- **Unattended saving is opt-in and fenced by the server.** A scheduled sync is pull-only unless the user clearly asked it to save. When it does save, the server (not the agent) limits it to 5 short notes per run, skips anything secret-like, and tags every note `auto-sync`. The `retract_thoughts` tool can hide only notes with that tag, never deletes, and is reversible, so even a manipulated agent cannot erase or hide ordinary memories.

## What it does not do

- **One shared key means all-or-nothing access.** Anyone with the key can read and write everything, including restricted memories. Keep it in a password manager and rotate it if it leaks (`supabase secrets set` a new `MCP_ACCESS_KEY`, update your clients, and update the `memex_dream_key` vault entry).
- **`?key=` in a URL appears in server logs.** It is off by default (`ALLOW_URL_KEY`). Turn it on only for clients that cannot send headers.
- **Secret detection is pattern-based.** It catches common key formats, long hex strings, card and ID numbers and "password is ..." phrasing. It will miss unusual secrets and flag some harmless text. Do not rely on it as the only safeguard.
- **Memories leave your project for processing.** Text goes to your embeddings provider, and to your Dreaming model provider if you enable it. Restricted memories do not.
- **Unattended saves rely partly on the agent's judgment.** The server caps their number and size and blocks secret-like text, but it cannot tell whether a note is personal or came from untrusted content; that part depends on the agent following its instructions. This is why the user's opt-in, the daily summary of what was saved, and the retract tool exist.
- **There is no rate limiting** beyond what Supabase applies. A valid key could run up provider costs.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private reporting: the **Security** tab of this repository, then **Report a vulnerability**. Include what you found, how to reproduce it, and the impact. Never include real keys or memory content.

## For contributors

Run `git config core.hooksPath .githooks` once to enable the pre-commit secret scan, and `node scripts/check-secrets.mjs --all` to scan the whole tree. Never commit `.env`, a filled-in `supabase/schedule-dreaming.sql`, or anything with a project ref in it.
