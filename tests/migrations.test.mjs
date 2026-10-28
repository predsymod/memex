import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import fs from 'node:fs';

// Runs every migration on a throwaway in-process Postgres (PGlite): once on an empty database, and once on top of the
// original Open Brain table shape. Run with: npm install && npm test   (from this folder)
const DIR = new URL('../supabase/migrations', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  -> ' + detail}`);
};

// A unit vector with a 1 at position i: cosine similarity is 1 with itself and 0 with any other.
const vec = (i) => '[' + Array.from({ length: 1536 }, (_, k) => (k === i ? 1 : 0)).join(',') + ']';

async function fresh() {
  // No pgcrypto on purpose: on Supabase it lives in the `extensions` schema, off the migration search path, so a
  // migration that calls digest() works here with it loaded and then fails on a fresh project.
  const db = new PGlite({ extensions: { vector } });
  await db.exec('create role anon nologin; create role authenticated nologin;'); // exist on Supabase
  return db;
}
async function run(db, label) {
  for (const f of files) {
    try {
      await db.exec(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
      check(`${label}: ${f}`, true);
    } catch (e) {
      check(`${label}: ${f}`, false, e.message.split('\n')[0]);
      return false;
    }
  }
  return true;
}
const q = async (db, sql, params) => (await db.query(sql, params)).rows;

// ---------------------------------------------------------------- A: empty database
console.log('\n=== A. Fresh install on an empty database');
{
  const db = await fresh();
  if (await run(db, 'apply')) {
    await run(db, 're-run (idempotent)');

    const tables = (await q(db, "select table_name from information_schema.tables where table_schema='public'")).map((r) => r.table_name);
    for (const t of ['thoughts', 'thought_links', 'sync_cursors', 'dream_log']) check(`table ${t} exists`, tables.includes(t));
    const cols = (await q(db, "select column_name from information_schema.columns where table_name='thoughts'")).map((r) => r.column_name);
    for (const c of ['content_hash', 'source', 'tags', 'topic', 'merged_into', 'dreamed_at', 'summary', 'entities', 'type', 'importance', 'sensitivity_tier', 'fts', 'retracted_at'])
      check(`thoughts.${c}`, cols.includes(c));

    // hash trigger and uniqueness
    await db.query("insert into thoughts (content, embedding, source) values ($1, $2, 'claude')", ['Alpha note about quokkas', vec(0)]);
    const h = await q(db, 'select content_hash from thoughts');
    check('trigger fills content_hash', h.length === 1 && /^[0-9a-f]{64}$/.test(h[0].content_hash));
    let dup = false;
    try { await db.query("insert into thoughts (content, source) values ($1, 'x')", ['  ALPHA note   about quokkas ']); } catch { dup = true; }
    check('duplicate (case/whitespace) rejected by unique hash', dup);

    // seed for search
    await db.query("insert into thoughts (content, embedding, source) values ('Beta note about quokkas and joeys', $1, 'codex')", [vec(0)]);
    await db.query("insert into thoughts (content, embedding, source) values ('The zebra crossing project uses ZXQ-7731', $1, 'muse')", [vec(5)]);
    await db.query("insert into thoughts (content, source, sensitivity_tier) values ('the staging password is hunter2xyz', 'muse', 'restricted')");

    // hybrid search: keyword-only hit must appear even though its vector is unrelated to the query vector
    const s1 = await q(db, 'select * from search_memex($1, $2::vector, 10, 0.3, false, 0, 90)', ['ZXQ-7731', vec(0)]);
    check('keyword finds exact id despite unrelated vector', s1.some((r) => r.content.includes('ZXQ-7731') && r.keyword_hit === true));
    check('semantic still returns vector neighbors', s1.some((r) => r.content.startsWith('Alpha note')) && s1.some((r) => r.content.startsWith('Beta note')));
    // keyword-only (null embedding), the outage fallback
    const s2 = await q(db, 'select * from search_memex($1, null::vector, 10, 0.3, false, 0, 90)', ['zebra']);
    check('null embedding falls back to keyword search', s2.length === 1 && s2[0].content.includes('zebra') && s2[0].similarity === null);
    // restricted
    const s3 = await q(db, 'select * from search_memex($1, null::vector, 10, 0.3, false)', ['hunter2xyz']);
    check('restricted hidden by default', s3.length === 0);
    const s4 = await q(db, 'select * from search_memex($1, null::vector, 10, 0.3, true)', ['hunter2xyz']);
    check('restricted shown with include_restricted', s4.length === 1);
    // superseded penalty
    const ids = Object.fromEntries((await q(db, 'select id, left(content, 5) as k from thoughts')).map((r) => [r.k, r.id]));
    await db.query("insert into thought_links (from_id, to_id, kind) values ($1, $2, 'supersedes')", [ids['Beta '], ids['Alpha']]);
    const s5 = await q(db, 'select content, superseded, score from search_memex($1, $2::vector, 10, 0.3)', ['quokkas', vec(0)]);
    const a = s5.find((r) => r.content.startsWith('Alpha')), b = s5.find((r) => r.content.startsWith('Beta'));
    check('older note flagged superseded and ranked below the newer', a?.superseded === true && b?.superseded === false && a.score < b.score, JSON.stringify(s5.map((r) => [r.content.slice(0, 5), r.superseded, r.score])));
    // autosync_match: repeat guard for unattended saves. Only the same source's own auto-sync notes count.
    await db.query("insert into thoughts (content, embedding, source, tags) values ('Autosave one', $1, 'agentA', array['auto-sync'])", [vec(40)]);
    await db.query("insert into thoughts (content, embedding, source, tags) values ('Autosave retracted', $1, 'agentA', array['auto-sync'])", [vec(41)]);
    await db.query("update thoughts set retracted_at = now() where content = 'Autosave retracted'");
    await db.query("insert into thoughts (content, embedding, source) values ('Typed by the user', $1, 'agentA')", [vec(42)]);
    await db.query("insert into thoughts (content, embedding, source, tags) values ('Other agent autosave', $1, 'agentB', array['auto-sync'])", [vec(43)]);
    const m1 = await q(db, "select * from autosync_match('agentA', $1::vector, 0.85)", [vec(40)]);
    check('autosync_match finds the same source\'s earlier auto-save', m1.length === 1 && m1[0].retracted === false && m1[0].similarity > 0.99);
    const m2 = await q(db, "select * from autosync_match('agentA', $1::vector, 0.85)", [vec(41)]);
    check('autosync_match also finds an auto-save the user retracted, and says so', m2.length === 1 && m2[0].retracted === true);
    check('autosync_match ignores notes the user wrote (no auto-sync tag)', (await q(db, "select * from autosync_match('agentA', $1::vector, 0.85)", [vec(42)])).length === 0);
    check('autosync_match ignores another source\'s auto-saves', (await q(db, "select * from autosync_match('agentA', $1::vector, 0.85)", [vec(43)])).length === 0);
    check('autosync_match returns nothing for an unrelated vector', (await q(db, "select * from autosync_match('agentA', $1::vector, 0.85)", [vec(99)])).length === 0);
    const gp = await q(db, "select has_function_privilege('anon', 'autosync_match(text,vector,float)', 'execute') as a");
    check('anon cannot execute autosync_match', gp[0].a === false);
    await db.query("delete from thoughts where source in ('agentA', 'agentB')");

    // disputed: a note that contradicts a note beginning "Correction" is flagged and ranks below an untouched note
    await db.query("insert into thoughts (content, embedding, source) values ('Correction: quokkas are marsupials, not rodents', $1, 'claude')", [vec(0)]);
    await db.query("insert into thoughts (content, embedding, source) values ('Quokkas are rodents and eat nuts', $1, 'claude')", [vec(0)]);
    const cid = (await q(db, "select id from thoughts where content like 'Correction: quokkas%'"))[0].id;
    const sid = (await q(db, "select id from thoughts where content like 'Quokkas are rodents%'"))[0].id;
    await db.query("insert into thought_links (from_id, to_id, kind) values ($1, $2, 'contradicts')", [sid, cid]);
    const ds = await q(db, 'select content, disputed, score from search_memex($1, $2::vector, 10, 0.3)', ['quokkas', vec(0)]);
    const stale = ds.find((r) => r.content.startsWith('Quokkas are rodents')), corr = ds.find((r) => r.content.startsWith('Correction: quokkas'));
    check('note contradicting a Correction is flagged disputed and ranks below it', stale?.disputed === true && corr?.disputed === false && stale.score < corr.score, JSON.stringify(ds.map((r) => [r.content.slice(0, 12), r.disputed, r.score])));
    check('a note that is not disputed is not flagged', ds.filter((r) => r.disputed).length === 1);
    await db.query('delete from thoughts where id in ($1, $2)', [cid, sid]);

    // merged_into hides
    await db.query('update thoughts set merged_into = $1 where id = $2', [ids['Beta '], ids['The z']]);
    const s6 = await q(db, 'select * from search_memex($1, null::vector, 10, 0.3)', ['zebra']);
    check('merged_into hides a thought from search', s6.length === 0);

    // neighbors
    const n = await q(db, 'select * from neighbors_of($1, 5, 0.5)', [ids['Alpha']]);
    check('neighbors_of returns the near thought with created_at', n.length === 1 && n[0].content.startsWith('Beta') && n[0].created_at);

    // retraction: a retracted note disappears from search (both sides) and from Dreaming's neighbor lookup, and comes back on restore
    await db.query('update thoughts set retracted_at = now() where id = $1', [ids['Beta ']]);
    const rs = await q(db, 'select content from search_memex($1, $2::vector, 10, 0.3)', ['quokkas', vec(0)]);
    check('retracted note hidden from semantic and keyword search', !rs.some((r) => r.content.startsWith('Beta')) && rs.some((r) => r.content.startsWith('Alpha')), JSON.stringify(rs));
    const rn = await q(db, 'select * from neighbors_of($1, 5, 0.5)', [ids['Alpha']]);
    check('retracted note hidden from neighbors_of', rn.length === 0);
    await db.query('update thoughts set retracted_at = null where id = $1', [ids['Beta ']]);
    const rr = await q(db, 'select content from search_memex($1, $2::vector, 10, 0.3)', ['quokkas', vec(0)]);
    check('restored note is searchable again', rr.some((r) => r.content.startsWith('Beta')));
    // other tables
    await db.query("insert into sync_cursors (source) values ('muse')");
    await db.query("insert into dream_log (run_id, action) values (gen_random_uuid(), 'enrich')");
    check('sync_cursors and dream_log accept rows', true);

    // security posture
    const rls = await q(db, "select relname, relrowsecurity from pg_class where relname in ('thoughts','thought_links','sync_cursors','dream_log')");
    check('row-level security on all 4 tables', rls.length === 4 && rls.every((r) => r.relrowsecurity));
    const priv = await q(db, "select has_function_privilege('anon', 'search_memex(text,vector,int,float,boolean,float,float)', 'execute') as a, has_function_privilege('authenticated', 'neighbors_of(uuid,int,float)', 'execute') as b");
    check('anon/authenticated cannot execute search or neighbors', priv[0].a === false && priv[0].b === false);
    const grants = await q(db, "select count(*)::int as c from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_name in ('thoughts','thought_links','sync_cursors','dream_log')");
    check('no table grants for anon/authenticated', grants[0].c === 0, String(grants[0].c));
  }
  await db.close();
}

// ---------------------------------------------------------------- B: upgrade from the original Open Brain table
console.log('\n=== B. Upgrade from the original Open Brain schema (what a live project looks like)');
{
  const db = await fresh();
  await db.exec(`
    create extension vector;
    create table thoughts (
      id uuid primary key default gen_random_uuid(), content text not null, embedding vector(1536),
      metadata jsonb default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
    create function match_thoughts(query_embedding vector(1536), match_threshold float default 0.7, match_count int default 10, filter jsonb default '{}')
      returns table (id uuid, content text, metadata jsonb, similarity float, created_at timestamptz) language sql stable as $$
      select t.id, t.content, t.metadata, 1 - (t.embedding <=> query_embedding), t.created_at from thoughts t
      where 1 - (t.embedding <=> query_embedding) > match_threshold order by t.embedding <=> query_embedding limit match_count; $$;
    alter table thoughts enable row level security;`);
  await db.query(`insert into thoughts (content, embedding, metadata) values
    ('Old note one', $1, '{"type":"idea","topics":["Alpha","Beta"],"source":"mcp"}'),
    ('Old note two', $2, '{"type":"nonsense","topics":["Gamma"],"source":"mcp"}'),
    ('Old note three, no topics', $2, '{"source":"mcp"}')`, [vec(1), vec(2)]);
  if (await run(db, 'upgrade')) {
    const rows = await q(db, 'select content, content_hash, source, tags, type, importance, sensitivity_tier from thoughts order by content');
    check('all 3 rows kept', rows.length === 3);
    check('content_hash backfilled for every row', rows.every((r) => r.content_hash));
    check('source carried over from metadata', rows.every((r) => r.source === 'mcp'));
    check('valid type carried over, invalid ignored', rows[0].type === 'idea' && rows[1].type === null && rows[2].type === null, JSON.stringify(rows.map((r) => r.type)));
    check('tags backfilled from metadata topics', rows[0].tags.length === 2 && rows[1].tags.length === 0 && rows[2].tags.length === 1, JSON.stringify(rows.map((r) => r.tags)));
    check('tags are lowercase (Dreaming normalizes to lowercase)', rows[0].tags.every((t) => t === t.toLowerCase()), JSON.stringify(rows[0].tags));
    // the old server keeps working: its insert has no content_hash and it still calls match_thoughts
    let ok = true;
    try { await db.query("insert into thoughts (content, embedding, metadata) values ('Written by the old server', $1, '{}')", [vec(3)]); } catch (e) { ok = false; }
    check('old-server style insert still works (trigger supplies the hash)', ok);
    const m = await q(db, 'select * from match_thoughts($1::vector, 0.5, 5)', [vec(1)]);
    check('old match_thoughts still works untouched', m.length === 1 && m[0].content === 'Old note one');
    const s = await q(db, 'select * from search_memex($1, $2::vector, 5, 0.3)', ['note', vec(1)]);
    check('new hybrid search works on migrated data', s.length >= 1);
  }
  await db.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

