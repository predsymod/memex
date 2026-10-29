// Unit tests for the pure helpers in supabase/functions/_shared. Node strips the TypeScript types itself.
import { timingSafeEqual, matchesAny, parseClientKeys } from '../supabase/functions/_shared/auth.ts';
import { isReservedSource, stripReservedTags, fetchAll } from '../supabase/functions/_shared/guards.ts';
import { scanTier, maxTier, asTier, clean } from '../supabase/functions/_shared/sensitivity.ts';

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check('timingSafeEqual: equal strings', timingSafeEqual('abc123', 'abc123'));
check('timingSafeEqual: different strings', !timingSafeEqual('abc123', 'abc124'));
check('timingSafeEqual: prefix is not a match', !timingSafeEqual('abc', 'abc123') && !timingSafeEqual('abc123', 'abc'));
check('matchesAny: hit, miss and empty', matchesAny('b', ['a', 'b']) && !matchesAny('c', ['a', 'b']) && !matchesAny('', ['']) && !matchesAny(null, ['a']));

check('parseClientKeys: named pairs', same(parseClientKeys('claude:k1,codex:k2'), [['claude', 'k1'], ['codex', 'k2']]));
check('parseClientKeys: key may contain a colon', same(parseClientKeys('claude:a:b'), [['claude', 'a:b']]));
check('parseClientKeys: drops entry with no colon', same(parseClientKeys('badentry,claude:k1'), [['claude', 'k1']]));
check('parseClientKeys: drops empty name or empty key', same(parseClientKeys(':k1,claude:,,'), []));
check('parseClientKeys: trims spaces and a Windows line ending', same(parseClientKeys('claude: k1\r\n,codex:k2 '), [['claude', 'k1'], ['codex', 'k2']]));
check('parseClientKeys: unset', same(parseClientKeys(undefined), []));

check('scanTier: ordinary note is standard', scanTier('Prefers dark mode and uses Railway for hosting') === 'standard');
for (const [label, s] of [
  ['SSN', 'ssn 123-45-6789'],
  ['card number', 'card 4111 1111 1111 1111'],
  ['OpenAI-style key', 'key sk-abcdefghijklmnopqrstuvwxyz123456'],
  ['AWS key', 'AKIAABCDEFGHIJKLMNOP'],
  ['private key block', '-----BEGIN RSA PRIVATE KEY-----'],
  ['password assignment', 'the password is hunter2hunter2'],
  ['long hex', 'a'.repeat(40)],
]) check(`scanTier: ${label} is restricted`, scanTier(s) === 'restricted');

check('maxTier picks the stricter tier', maxTier('standard', 'personal') === 'personal' && maxTier('restricted', 'personal') === 'restricted');
check('asTier: unknown values become standard', asTier('nonsense') === 'standard' && asTier('personal') === 'personal' && asTier(undefined) === 'standard');
check('clean: strips control characters and caps length', clean('a\u0000b\u0007c', 10) === 'abc' && clean('abcdef', 3) === 'abc' && clean(null, 5) === '');

check('isReservedSource: dream in any case or padding', isReservedSource('dream') && isReservedSource(' Dream ') && !isReservedSource('claude'));
check('stripReservedTags: drops server-only tags, keeps the rest', same(stripReservedTags(['work', 'auto-sync', 'Synthesis', 'digest', 'sync-prefs']), ['work', 'sync-prefs']));
const rows = Array.from({ length: 2500 }, (_, i) => i);
const paged = await fetchAll((a, b) => Promise.resolve({ data: rows.slice(a, b + 1) }));
check('fetchAll: reads past the 1000-row cap', paged.length === 2500 && paged[2499] === 2499);
let threw = false;
try { await fetchAll(() => Promise.resolve({ data: null, error: { message: 'boom' } })); } catch { threw = true; }
check('fetchAll: a failed page throws instead of returning a short list', threw);
check('fetchAll: exact page boundary and empty result',
  (await fetchAll((a, b) => Promise.resolve({ data: rows.slice(0, 2000).slice(a, b + 1) }))).length === 2000 &&
  (await fetchAll(() => Promise.resolve({ data: null }))).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
