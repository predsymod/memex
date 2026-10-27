-- Typed, ranked and sensitivity-aware memories.
--   type             what kind of memory it is (filled by Dreaming)
--   importance       1 to 5, clustered around 3 (filled by Dreaming)
--   sensitivity_tier standard | personal | restricted. Restricted memories (secrets, credentials, government or
--                    card numbers) are never sent to an LLM, never embedded, and are hidden from search and sync
--                    unless explicitly requested.

alter table thoughts add column if not exists type text
  check (type in ('idea','task','decision','lesson','meeting','journal','person_note','reference','observation'));
alter table thoughts add column if not exists importance smallint not null default 3 check (importance between 1 and 5);
alter table thoughts add column if not exists sensitivity_tier text not null default 'standard'
  check (sensitivity_tier in ('standard','personal','restricted'));

create index if not exists thoughts_type_idx on thoughts (type);
create index if not exists thoughts_importance_idx on thoughts (importance);
create index if not exists thoughts_restricted_idx on thoughts (id) where sensitivity_tier = 'restricted';

-- Carry over types written by the original Open Brain server.
update thoughts set type = metadata->>'type'
 where type is null
   and metadata->>'type' in ('idea','task','decision','lesson','meeting','journal','person_note','reference','observation');

-- Deterministic first pass for existing rows. Mirrors supabase/functions/_shared/sensitivity.ts; the edge
-- functions apply the same patterns to every new thought. Errs toward flagging.
update thoughts set sensitivity_tier = 'restricted'
 where sensitivity_tier = 'standard'
   and (   content ~ '\m\d{3}-\d{2}-\d{4}\M'
        or content ~ '\m(?:\d[ -]?){13,19}\M'
        or content ~ '(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})'
        or content ~ '-----BEGIN [A-Z ]*PRIVATE KEY-----'
        or content ~* '\m(password|passwd|api[_ -]?key|secret|token)\s*(is|[:=])\s*\S{6,}'
        or content ~* '\m[0-9a-f]{40,}\M');

-- (The neighbor lookup and search both exclude restricted thoughts by default; they are defined in 0004 and 0005.)
