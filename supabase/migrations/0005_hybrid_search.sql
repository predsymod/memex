-- Hybrid search: keyword (full-text) and semantic (vector) results fused by reciprocal rank, with optional
-- recency weighting and a penalty for notes that a later note has superseded.
--
-- Why: vector search alone ranks by meaning, so exact names, ids and rare terms can be missed or outranked by
-- vaguely related text. Full-text search nails those. Fusing the two rankings gets both.

-- Searchable text: the thought plus Dreaming's summary and topic. (Tags are not included: array_to_string is not
-- immutable, which a generated column requires.)
alter table thoughts add column if not exists fts tsvector
  generated always as (
    to_tsvector('english', coalesce(content, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(topic, ''))
  ) stored;
create index if not exists thoughts_fts_idx on thoughts using gin (fts);

-- Arguments and return type change, so drop the previous versions first (also makes this file safe to re-run).
drop function if exists search_memex(vector, int, float, boolean);
drop function if exists search_memex(text, vector, int, float, boolean, float, float);

create function search_memex(
  query_text text,
  query_embedding vector(1536),          -- null is fine: keyword-only, used when embedding is unavailable
  match_count int default 10,
  min_similarity float default 0.3,      -- applies to the semantic side only; keyword hits are not gated by it
  include_restricted boolean default false,
  recency_weight float default 0,        -- 0 = ignore age, 1 = age dominates; 0.2 is a gentle nudge
  half_life_days float default 90        -- a memory this old counts half as recent as a new one
) returns table (
  id uuid, content text, summary text, source text, type text, importance smallint, sensitivity_tier text,
  tags text[], topic text, created_at timestamptz,
  similarity float, keyword_hit boolean, superseded boolean, score float
)
language sql stable as $$
  with params as (
    select websearch_to_tsquery('english', coalesce(query_text, '')) as q,
           least(greatest(coalesce(recency_weight, 0), 0), 1) as w,
           case when coalesce(half_life_days, 0) > 0 then half_life_days else 90 end as hl
  ),
  sem as (
    select t.id, row_number() over (order by t.embedding <=> query_embedding) as r
    from thoughts t
    where query_embedding is not null
      and t.merged_into is null and t.retracted_at is null and t.embedding is not null
      and (include_restricted or t.sensitivity_tier <> 'restricted')
      and 1 - (t.embedding <=> query_embedding) >= min_similarity
    order by t.embedding <=> query_embedding
    limit 50
  ),
  kw as (
    select t.id, row_number() over (order by ts_rank_cd(t.fts, p.q) desc) as r
    from thoughts t cross join params p
    where p.q <> ''::tsquery and t.fts @@ p.q
      and t.merged_into is null and t.retracted_at is null
      and (include_restricted or t.sensitivity_tier <> 'restricted')
    order by ts_rank_cd(t.fts, p.q) desc
    limit 50
  ),
  fused as (
    select coalesce(s.id, k.id) as id,
           coalesce(1.0 / (60 + s.r), 0) + coalesce(1.0 / (60 + k.r), 0) as rrf,
           (k.id is not null) as keyword_hit
    from sem s full join kw k on k.id = s.id
  )
  select t.id, t.content, t.summary, t.source, t.type, t.importance, t.sensitivity_tier, t.tags, t.topic, t.created_at,
         case when t.embedding is null or query_embedding is null then null
              else 1 - (t.embedding <=> query_embedding) end as similarity,
         f.keyword_hit,
         sup.is_superseded as superseded,
         f.rrf
           * (case when t.source = 'dream'
                   then (1 - p.w)  -- digests get no recency boost: they are always new but never the specific answer
                   else (1 - p.w) + p.w * power(0.5, greatest(extract(epoch from (now() - t.created_at)) / 86400.0, 0) / p.hl)
              end)
           * (case when sup.is_superseded then 0.5 else 1 end)   -- replaced by a later note: stale
           * (case when t.source = 'dream' then 0.7 else 1 end)  -- auto-written digests are broad and match everything weakly
           as score
  from fused f
  join thoughts t on t.id = f.id
  cross join params p
  cross join lateral (
    select exists (select 1 from thought_links l where l.to_id = t.id and l.kind = 'supersedes') as is_superseded
  ) sup
  order by score desc
  limit match_count;
$$;

revoke execute on function search_memex from public, anon, authenticated;
