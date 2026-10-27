-- Schedules the nightly Dreaming run. NOT a migration: it needs your project ref and a Memex key, which must
-- never be committed. SETUP.md has the agent substitute the two placeholders and run it once.
--
--   <PROJECT_REF>  your Supabase project ref
--   <DREAM_KEY>    your Memex access key (the same MCP_ACCESS_KEY the clients use)
--
-- Skip this entirely if you have no Meta or OpenRouter key. Dreaming then stays off.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Keep the key in Supabase Vault, not in the job definition.
select vault.create_secret('<DREAM_KEY>', 'memex_dream_key')
where not exists (select 1 from vault.secrets where name = 'memex_dream_key');

select cron.unschedule('memex-dream') where exists (select 1 from cron.job where jobname = 'memex-dream');

-- Every day at 09:00 UTC (early morning in the Americas), then again at :10 and :20. Each call handles up to
-- 100 thoughts, so the extra runs only matter after a big import; a run with nothing to do makes no model calls.
select cron.schedule(
  'memex-dream',
  '0,10,20 9 * * *',
  $$ select net.http_post(
       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/memex-dream',
       headers := jsonb_build_object(
         'x-brain-key', (select decrypted_secret from vault.decrypted_secrets where name = 'memex_dream_key')
       ),
       timeout_milliseconds := 120000
     ) $$
);
