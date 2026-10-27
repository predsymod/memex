-- Repeat guard for unattended saves.
--
-- A scheduled agent re-reads its own memory every day and tends to save the same facts again, reworded, so the plain
-- "identical text" check never fires. This finds the closest earlier note that the SAME source saved automatically
-- (tag 'auto-sync'), including notes the user later retracted, so the server can skip an item that repeats something
-- already saved, or something the user said was wrong.
--
-- It only looks at that source's own automatic saves, not at the whole memory, so it cannot block a genuinely new fact
-- that merely resembles something the user wrote themselves.
create or replace function autosync_match(p_source text, p_embedding vector(1536), p_min float default 0.85)
returns table (id uuid, similarity float, retracted boolean)
language sql stable as $$
  select t.id, 1 - (t.embedding <=> p_embedding) as similarity, (t.retracted_at is not null) as retracted
  from thoughts t
  where t.source = p_source
    and t.tags @> array['auto-sync']
    and t.embedding is not null
    and 1 - (t.embedding <=> p_embedding) >= p_min
  order by t.embedding <=> p_embedding
  limit 1;
$$;

revoke execute on function autosync_match from public, anon, authenticated;
