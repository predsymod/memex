# Demo video script (3:00)

Target: under 3:00, screen recording with voice-over. About 400 words of narration. Every number below is one that was measured on this project; don't add others.

Story in one line: **save a fact in one agent, get it in another, watch Meta's model tidy the memory overnight, and see that secrets never leave.**

## Before you record (once)

1. `node scripts/doctor.mjs` is all green.
2. `node demo/reset.mjs --live` for a clean slate. **Warning:** it removes every Dreaming note written since the last seed, including the overviews of your real topics. After the take run `node demo/dream.mjs --synthesize` to rebuild them.
3. `node demo/dream.mjs` **off camera, before seeding.** Dreaming's digest covers every note it organizes in a run. If real notes from a morning sync are still waiting (a dry run found 16), the on-camera run takes about 40 seconds instead of about 20 and the digest would be about your real notes. Running it once first clears them, so the take covers only the demo notes.
4. `node demo/preflight.mjs claude muse` so a pull in Muse only brings the one new note.
5. `node demo/seed.mjs` (nine fictional "Fernwood Trail Club" notes).
6. Rehearse the Muse beat in a **new** Muse chat (not your main one) until it behaves twice in a row.

A tool-level dry run (save in Claude, pull in Muse, recall, the fake password, Dreaming, the superseded note and the overview) passed on 2026-10-28. It does not cover how Claude and Muse behave in their chat windows, so rehearse those.

### Keep off camera
- The claude.ai connector detail page (the key is in its URL), and any Supabase API-keys page.
- The Supabase dashboard header: the org name contains an email address. Rename the org, or crop it out.
- The `thoughts` table editor, and any unfiltered `list_thoughts` or `thought_stats` (your real memory). Search only with the `fernwood` tag or demo queries.
- Your terminal's working directory path if it shows your username.

## Beats and lines

Spoken lines are in quotes. **Type** shows exactly what to type.

### 0:00 to 0:15. The problem (landing page, https://predsymod.github.io/memex/)
Show the headline.
"Every AI agent starts from zero. Your repo remembers the code. Memex remembers you: your preferences, decisions and the reasons behind them. And it lives in your own database, so every agent can use it."

### 0:15 to 0:55. Save in one agent, recall in another (the proof)
Show Claude. **Type:** `save to memex: my favorite color is red`
"I tell Claude once."
Switch to a new Muse chat. **Type:** `pull from memex`
"Muse is a different agent from a different company. It pulls what Claude saved."
**Type:** `what's my favorite color?` Muse answers red.
"Same memory, no copy and paste. And it's mine: one Supabase project, my keys, nothing hosted by anyone else."

If Muse asks what it may save, answer in one line ("work and preferences, pull too") and carry on; then say "Each agent has its own rules, set by me."

### 0:55 to 1:15. How it fits (landing page, diagram)
Scroll to "How the pieces fit".
"Memex is an MCP server on my own Supabase. Agents connect with a URL and a key. Setup is one sentence to an agent: 'set up Memex using this repo', and I tested that end to end on a brand-new project."

### 1:15 to 2:00. Dreaming, powered by Meta's Muse Spark
Terminal. Run `node demo/dream.mjs` (about 20 seconds; start it, then talk).
"Overnight, a job reads what's new and uses Muse Spark through the Meta Model API to organize it: tags, a summary, real dates for things like 'next Saturday', and links between notes."
When it finishes, show the output, including the **token counts**.
"It's cheap. I set the reasoning effort to minimal, about five times cheaper and four times faster. A first pass over 115 of my real notes took about 40 seconds and under a dollar."
Then in Claude. **Type:** `search memex: when does the Fernwood Trail Club meet?`
"A newer note corrected the meeting time, so the old one is marked superseded and ranks lower. Corrections win."
Show the overview note: **Type:** `search memex: Overview of Fernwood Trail Club`
"And when enough notes pile up, Muse writes an overview of the current picture, linked back to its sources. It never deletes or rewrites what I wrote."

### 2:00 to 2:25. Secrets never leave
In Claude, do beat 6 from `demo/README.md`: save a line that states a demo server password, using a made-up fake one (the exact phrase is in that file).
Then **Type:** `search memex for the demo server password` (nothing comes back).
"Anything that looks like a credential gets flagged: never embedded, never sent to a model, hidden from search and sync."

### 2:25 to 2:50. Hands-off, on my terms
Show the landing page section "Hands-off, if you want it".
"I can ask an agent to sync every morning. Pull only, or pull and save. The server itself caps what an unattended run can save, skips anything secret-like and anything it already saved, tags it, and I can retract it with one sentence. And I decide, for each agent, what it may save."

### 2:50 to 3:00. Close
Show the GitHub repo.
"Memex is open source. Everything in this repo was built during the hackathon. It builds on the ideas of Open Brain by Nate B. Jones, with no code reused. Your repo remembers the code. Memex remembers you."

## If something goes wrong on camera
- **An agent answers wrongly or slowly:** stop, retake that beat. Don't narrate over a failure.
- **Muse starts a push list:** answer its question briefly, or restart the chat and use `pull from memex`.
- **Dreaming takes longer than 20 seconds:** keep talking over the output, or cut it in the edit. Don't fake the numbers.
- **Search returns extra demo notes:** add "use the tag fernwood".

## After the take
- `node demo/reset.mjs --live`, then `node demo/dream.mjs --synthesize` to rebuild your real overviews.
- Rotate the access key if the connector page or an API-keys page was ever visible (see SECURITY.md).
- Upload the video (YouTube, unlisted is fine), paste the link in the submission form, tick the consent box and submit before Nov 4, 9 PM ET.

## What to say if asked
- **Why not the built-in memory in Claude or ChatGPT?** It's one vendor's silo. Memex is portable across agents, I own the data, and secrets are fenced off.
- **Is Meta essential?** Muse Spark runs the nightly job, and Muse is one of the agents sharing the memory. The job has an optional fallback, but the cost and speed that make it practical came from Meta's model.
- **What's new in the hackathon?** The whole repo. My own earlier private setup existed before; what's new is a repo anyone can deploy with one sentence to an agent.
