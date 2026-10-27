-- Dreaming needs each neighbor's date so the model can tell which of two thoughts is the later revision.
-- Return type changes, so drop first.
drop function if exists neighbors_of(uuid, int, float);
create function neighbors_of(p_id uuid, p_k int default 5, p_min float default 0.5)
returns table (id uuid, content text, created_at timestamptz, similarity float)
language sql stable as $$
  select t.id, t.content, t.created_at, 1 - (t.embedding <=> s.embedding) as similarity
  from thoughts s
  join thoughts t on t.id <> s.id and t.merged_into is null and t.retracted_at is null and t.embedding is not null
                 and t.sensitivity_tier <> 'restricted'
  where s.id = p_id and s.embedding is not null
    and 1 - (t.embedding <=> s.embedding) >= p_min
  order by t.embedding <=> s.embedding
  limit p_k;
$$;

revoke execute on function neighbors_of from public, anon, authenticated;
