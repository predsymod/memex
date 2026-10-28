-- Memex schema. Idempotent and additive: works on an empty project and on a project that already has a
-- compatible `thoughts` table (id, content, embedding, metadata, created_at, updated_at).
-- Raw thoughts are the source of truth; Dreaming only adds metadata and links.

create extension if not exists vector;

create table if not exists thoughts (
  id         uuid primary key default gen_random_uuid(),
  content    text not null,
  embedding  vector(1536),
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table thoughts add column if not exists content_hash text;                      -- sha-256 of normalized content; lets sync skip duplicates
alter table thoughts add column if not exists source       text not null default 'unknown'; -- which agent wrote it: claude, codex, muse, ...
alter table thoughts add column if not exists tags         text[] not null default '{}';
alter table thoughts add column if not exists topic        text;
alter table thoughts add column if not exists merged_into  uuid references thoughts(id);    -- set by Dreaming; never deletes the original
alter table thoughts add column if not exists dreamed_at   timestamptz;                      -- null = not yet processed by Dreaming
-- Set by the retract tool, which can only touch notes saved by an unattended sync (tag 'auto-sync'). A retracted
-- note is hidden everywhere (search, list, sync, Dreaming) but never deleted, and can be restored.
alter table thoughts add column if not exists retracted_at timestamptz;

-- Backfill rows that predate these columns. The hash normalization matches the edge function:
-- trim, collapse whitespace, lowercase. Uses the built-in sha256(): pgcrypto's digest() lives in the `extensions`
-- schema on Supabase and is not on the migration's search path, so it would fail on a fresh project.
update thoughts
   set content_hash = encode(sha256(convert_to(lower(regexp_replace(btrim(content), '\s+', ' ', 'g')), 'UTF8')), 'hex')
 where content_hash is null;

update thoughts
   set source = metadata->>'source'
 where source = 'unknown' and metadata ? 'source';

update thoughts
   set tags = array(select lower(jsonb_array_elements_text(metadata->'topics')))
 where tags = '{}' and jsonb_typeof(metadata->'topics') = 'array';

-- Compute the hash on insert when the writer didn't supply one, so older clients keep working.
create or replace function thoughts_set_hash() returns trigger language plpgsql as $$
begin
  if new.content_hash is null then
    new.content_hash := encode(sha256(convert_to(lower(regexp_replace(btrim(new.content), '\s+', ' ', 'g')), 'UTF8')), 'hex');
  end if;
  return new;
end $$;

drop trigger if exists thoughts_set_hash_trg on thoughts;
create trigger thoughts_set_hash_trg before insert on thoughts
  for each row execute function thoughts_set_hash();

alter table thoughts alter column content_hash set not null;
create unique index if not exists thoughts_content_hash_key on thoughts (content_hash);
create index if not exists thoughts_created_idx on thoughts (created_at desc);
create index if not exists thoughts_undreamed_idx on thoughts (created_at) where dreamed_at is null;
create index if not exists thoughts_tags_idx on thoughts using gin (tags);
create index if not exists thoughts_embedding_idx on thoughts using hnsw (embedding vector_cosine_ops);

-- One row per agent: the last time it synced, so each sync only moves what changed.
create table if not exists sync_cursors (
  source         text primary key,
  last_synced_at timestamptz not null default 'epoch'
);

-- Every change Dreaming makes, so any pass can be inspected and undone.
create table if not exists dream_log (
  id         bigint generated always as identity primary key,
  run_id     uuid not null,
  thought_id uuid references thoughts(id),
  action     text not null,                    -- tag | link_duplicate | flag_contradiction | aborted
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Search and neighbor functions are defined once, in the migrations that own their final form (0004 and 0005), so
-- that re-running any migration never recreates an old signature. An existing match_thoughts is left untouched.

-- Lock everything down. Only the edge functions (service role) touch these tables.
alter table thoughts enable row level security;
alter table sync_cursors enable row level security;
alter table dream_log enable row level security;
revoke all on thoughts, sync_cursors, dream_log from anon, authenticated;
