// One embeddings call for both edge functions, so the model and the error handling cannot drift apart.
// Notes embedded at capture and notes embedded by Dreaming's backfill must come from the same model.
export const EMBED_MODEL = "openai/text-embedding-3-small";

// Throws on a missing key, a network error, a timeout or a non-ok answer. `retry` tries once more after a rate limit
// or server error (for saves, where a missed embedding is permanent until backfilled); search passes no retry and a
// short timeout, so a slow provider falls back to keyword search quickly.
export async function embedText(
  apiKey: string | undefined,
  text: string,
  opts: { retry?: boolean; timeoutMs?: number } = {},
): Promise<number[]> {
  if (!apiKey) throw new Error("embedding failed: no OPENROUTER_API_KEY secret set");
  const call = () =>
    fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
  let res = await call();
  if (opts.retry && (res.status === 429 || res.status >= 500)) {
    await new Promise((r) => setTimeout(r, 500));
    res = await call();
  }
  if (!res.ok) throw new Error(`embedding failed: ${res.status}${res.status === 401 ? " (check the OPENROUTER_API_KEY secret)" : ""}`);
  return (await res.json()).data[0].embedding;
}
