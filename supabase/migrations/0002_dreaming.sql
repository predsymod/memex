-- Dreaming: enrichment and connections. Original thought content is never edited; everything here is derived
-- data that can be inspected (dream_log) and undone.

alter table thoughts add column if not exists summary  text;                       -- one-line summary written by Dreaming
alter table thoughts add column if not exists entities jsonb not null default '{}'; -- {people:[], projects:[], places:[], dates:[{text,date}]}

-- Typed connections between thoughts. from_id is the later or derived thought, to_id the earlier or source one.
--   related | elaborates | supersedes | contradicts | duplicate | derived_from
create table if not exists thought_links (
  id         bigint generated always as identity primary key,
  from_id    uuid not null references thoughts(id) on delete cascade,
  to_id      uuid not null references thoughts(id) on delete cascade,
  kind       text not null check (kind in ('related','elaborates','supersedes','contradicts','duplicate','derived_from')),
  score      real,
  reason     text,
  run_id     uuid,
  created_at timestamptz not null default now(),
  unique (from_id, to_id, kind),
  check (from_id <> to_id)
);
create index if not exists thought_links_from_idx on thought_links (from_id);
create index if not exists thought_links_to_idx on thought_links (to_id);

-- (The neighbor lookup Dreaming uses is defined in 0004, and search in 0005.)

alter table thought_links enable row level security;
revoke all on thought_links from anon, authenticated;
