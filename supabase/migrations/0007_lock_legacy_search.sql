-- Lock down a leftover search function from the original Open Brain setup.
--
-- Projects that started from Open Brain have a match_thoughts() that Postgres leaves executable by everyone
-- (including the public API roles) by default. It reads with the caller's rights, so on the locked tables it returns
-- nothing to those roles, but nothing should be callable by them. The old server and this one call it with the
-- service role, which keeps its own access. Does nothing on a fresh project, where the function does not exist.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'match_thoughts'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
