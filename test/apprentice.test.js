const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const AP = require('../lib/apprentice.js');
const M = require('../lib/mastery.js');

const PROVIDERS = { groq: { models: ['whisper-large-v3-turbo'] }, deepgram: { models: ['nova-3'] }, custom: { models: ['whisper-1'] } };
const base = { provider: 'groq', model: '', language: 'en', pauseMs: 700, level: 1, formatEnabled: true, punctCommands: false };
let k = 0;
function passage(o = {}) {
  const raw = o.rawText || 'She walked to the window and looked out at the rain for a while.';
  const sig = AP.passageSignals(raw, o.notes);
  return {
    id: 'dict:b:' + k++, type: 'dict', book: 'b', seg: 's' + k, src: o.src || 'live', t: 1e12 + k * 1000,
    spokenAt: 1e12 + k * 1000, speechSec: o.speechSec ?? 6, raw: sig.words, words: sig.words,
    setup: o.setup === undefined ? AP.setupKey(base, PROVIDERS).key : o.setup,
    fillers: sig.fillers, doubled: sig.doubled, falseStarts: sig.falseStarts, artifact: sig.artifact,
    retried: !!o.retried, space: o.space || 'manuscript',
  };
}

/* ---------- setup keys ---------- */

test('setup keys separate everything that changes the raw transcript or passage boundaries', () => {
  const key = (patch) => AP.setupKey({ ...base, ...patch }, PROVIDERS).key;
  const k0 = key({});
  assert.equal(k0, key({}), 'same settings, same key');
  assert.equal(k0, key({ model: 'whisper-large-v3-turbo' }), 'the default model resolves to its name');
  for (const patch of [{ provider: 'deepgram' }, { model: 'whisper-large-v3' }, { language: 'fr' }, { pauseMs: 900 },
    { level: 3 }, { formatEnabled: false }, { punctCommands: true }]) {
    assert.notEqual(key(patch), k0, 'differs for ' + JSON.stringify(patch));
  }
  assert.match(k0, /^v1\|groq\|whisper-large-v3-turbo\|en\|700\|L1\|ai1\|pc0$/);
});

/* ---------- per-passage signals ---------- */

test('signals come from the raw transcript, matching what the pipeline would remove', () => {
  assert.deepEqual(AP.passageSignals('Um, I think, uh, she left.'), { words: 6, fillers: 2, doubled: 0, falseStarts: 0, artifact: false });
  assert.equal(AP.passageSignals('She opened the the door.').doubled, 1);
  assert.equal(AP.passageSignals('She had had enough.').doubled, 0, '"had had" is English, not a stutter');
  assert.equal(AP.passageSignals('He grabbed the — he took the sword.').falseStarts, 1);
  assert.equal(AP.passageSignals('I went- I walked home.').falseStarts, 1);
  assert.equal(AP.passageSignals('The rain had not stopped for three days.').falseStarts, 0);
  assert.equal(AP.passageSignals('He paused — and then he spoke.').falseStarts, 0, 'a dash alone is not a false start');
});

test('transcriber artifacts are flagged from the preprocessing notes', () => {
  assert.equal(AP.passageSignals('and then do she left', ['collapsed a repeated "do"']).artifact, true);
  assert.equal(AP.passageSignals('The ship sank.', ['dropped transcriber boilerplate']).artifact, true);
  assert.equal(AP.passageSignals('').artifact, true);
  assert.equal(AP.passageSignals('A clean sentence.', []).artifact, false);
});

/* ---------- eligibility ---------- */

test('imports, practice, retries, artifacts, short passages and unkeyed passages are excluded', () => {
  assert.equal(AP.exclusion(passage()), null);
  assert.equal(AP.exclusion(passage({ src: 'import' })), 'imported');
  assert.equal(AP.exclusion(passage({ space: 'practice' })), 'practice');
  assert.equal(AP.exclusion(passage({ retried: true })), 'retried');
  assert.equal(AP.exclusion(passage({ notes: ['collapsed a repeated "the"'] })), 'transcriber artifact');
  assert.equal(AP.exclusion(passage({ rawText: 'Yes.' })), 'too short');
  assert.equal(AP.exclusion(passage({ speechSec: 0.4 })), 'too short');
  assert.equal(AP.exclusion(passage({ setup: null })), 'no setup key');
  assert.equal(AP.exclusion({ type: 'dict', src: 'live', setup: 'x', raw: 10, speechSec: 5 }), 'no signals', 'passages from before step 1 are left out');
});

/* ---------- summaries ---------- */

test('summaries never mix setups, and report nothing until there are enough passages', () => {
  const whisper = AP.setupKey(base, PROVIDERS).key;
  const dg = AP.setupKey({ ...base, provider: 'deepgram' }, PROVIDERS).key;
  const events = [];
  for (let i = 0; i < 12; i++) events.push(passage({ setup: whisper, rawText: 'She walked to the window and looked out at the rain.' }));
  for (let i = 0; i < 12; i++) events.push(passage({ setup: dg, rawText: 'Um, she walked, uh, to the the window and looked out.' }));
  for (let i = 0; i < 4; i++) events.push(passage({ setup: 'v1|openai|whisper-1|en|700|L1|ai1|pc0' }));
  events.push(passage({ src: 'import' }), passage({ retried: true }));
  const { keys, excluded } = AP.summarize(events);
  assert.equal(keys[whisper].fillersPer100, 0);
  assert.ok(keys[dg].fillersPer100 > 15, 'the Deepgram setup keeps its fillers to itself');
  assert.ok(keys[dg].doubledPer100 > 0);
  assert.equal(keys[whisper].n, 12);
  assert.deepEqual(keys['v1|openai|whisper-1|en|700|L1|ai1|pc0'], { ready: false, n: 4, needs: AP.MIN_SAMPLE });
  assert.deepEqual(excluded, { imported: 1, retried: 1 });
  assert.equal(keys[whisper].speakingRate, Math.round((11 / 6) * 60 * 10) / 10, 'raw words per speaking minute');
});

test('a change of transcriber does not show up as a trend', () => {
  const whisper = AP.setupKey(base, PROVIDERS).key;
  const dg = AP.setupKey({ ...base, provider: 'deepgram' }, PROVIDERS).key;
  const events = [];
  for (let i = 0; i < 20; i++) events.push(passage({ setup: dg, rawText: 'Um, she walked, uh, to the window and looked out at it.' }));
  for (let i = 0; i < 20; i++) events.push(passage({ setup: whisper, rawText: 'She walked to the window and looked out at the rain.' }));
  assert.equal(AP.trend(events, whisper), null, 'one window of Whisper passages is not enough');
  assert.equal(AP.trend(events, dg), null);
  for (let i = 0; i < 20; i++) events.push(passage({ setup: whisper, rawText: 'She walked, um, to the window and looked out at the rain.' }));
  const t = AP.trend(events, whisper);
  assert.equal(t.before.fillersPer100, 0);
  assert.ok(t.after.fillersPer100 > 0);
  assert.ok(!('better' in t) && !('worse' in t), 'reports differences only');
});

/* ---------- revision while drafting ---------- */

test('revision during a sprint is separated from revision after it', () => {
  const T = 1e12;
  const sprint = { start: T, end: T + 600000, intervals: [[T, T + 600000]] };
  const events = [
    { type: 'typing', added: 30, removed: 5, to: T + 60000, t: T + 60000 },
    { type: 'revise', delta: -3, t: T + 120000 },
    { type: 'typing', added: 0, removed: 40, paste: true, to: T + 130000, t: T + 130000 },   // a cut: not revision
    { type: 'typing', added: 2, removed: 12, to: T + 900000, t: T + 900000 },
    { type: 'typing', added: 2, removed: 99, to: T + 600000 + 31 * 60000, t: T + 600000 + 31 * 60000 }, // too late
  ];
  assert.deepEqual(AP.draftingRevision(sprint, events), { during: 8, after: 12, duringEdits: 2, afterEdits: 1 });
});

/* ---------- the pipeline is untouched ---------- */

test('lib/format.js is not modified by the apprenticeship', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'apprentice.js'), 'utf8');
  assert.ok(!/F\.\w+\s*=/.test(src), 'never assigns into the formatter');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'lib', 'format.js'))).digest('hex');
  assert.equal(hash, '2b3b5c2acf66fb4368a4fdccd9f5875e5fe647a30b73c1fa5c1b827a2763ea12');
});

/* ================= Step 2: exercises, attempts, ratings ================= */

const T = Date.UTC(2026, 10, 5, 15, 0, 0);
const mins = (n) => n * 60000;
let q = 0;
const E = (o) => ({ id: o.id || 'x' + q++, ...o });
const sp = (sprint, op, t, plannedMin = 20, extra = {}) => E({ type: 'sprint', sprint, op, t, plannedMin, ...extra });
function mapOf(events) {
  const sprints = M.deriveSprints(events);
  const owner = M.ownership(sprints, events);
  return new Map(sprints.map((s) => [s.id, { sprint: s, stats: M.sprintStats(s, events, owner) }]));
}

test('catalogue: five abilities, practical exercises, valid defaults, honest basis', () => {
  assert.deepEqual(AP.ABILITIES.map((a) => a.name), ['Mental Composition', 'Continuous Drafting', 'Dialogue Fluency', 'Scene Development', 'Writing Endurance']);
  for (const ab of AP.ABILITIES) assert.ok(AP.EXERCISES.some((x) => x.ability === ab.id), ab.id + ' has exercises');
  for (const ex of AP.EXERCISES) {
    assert.ok(ex.how && ex.basis, ex.id + ' explains itself');
    for (const p of ex.params) assert.ok(p.options.some((o) => (typeof o === 'object' ? o.value : o) === p.default), ex.id + '.' + p.key + ' default is an option');
  }
  assert.deepEqual(AP.cleanParams(AP.exercise('two-voices'), { exchanges: 12, minutes: 999, junk: 'x' }), { exchanges: 12, minutes: 15 }, 'unknown or invalid options fall back');
  assert.ok(!AP.EXERCISES.some((x) => /level|xp|badge|score/i.test(JSON.stringify(x.params))), 'options are choices, not levels');
});

test('attempts: duplicate events count once, first rating stands, missing rating is not failure', () => {
  const events = [
    sp('s1', 'start', T), sp('s1', 'end', T + mins(20)),
    E({ type: 'ex', op: 'start', attempt: 'a1', exercise: 'two-voices', ability: 'dialogue', params: { exchanges: 6, minutes: 20 }, sprint: 's1', setup: 'k', t: T }),
    E({ id: 'exend:a1', type: 'ex', op: 'end', attempt: 'a1', status: 'completed', paraDelta: 9, t: T + mins(20) }),
    E({ type: 'ex', op: 'end', attempt: 'a1', status: 'ended early', t: T + mins(21) }),       // a stray second end
    E({ id: 'rating:a1', type: 'ex.rating', attempt: 'a1', felt: 'right', t: T + mins(21) }),
    E({ type: 'ex.rating', attempt: 'a1', felt: 'hard', t: T + mins(22) }),                    // a second rating
    E({ type: 'ex', op: 'start', attempt: 'a2', exercise: 'sprint-ladder', ability: 'endurance', params: { minutes: 10 }, sprint: 's2', t: T + mins(30) }),
    E({ type: 'ex', op: 'end', attempt: 'a2', status: 'completed', t: T + mins(40) }),
  ];
  const [a1, a2] = AP.deriveAttempts(events);
  assert.equal(a1.status, 'completed');
  assert.equal(a1.felt, 'right');
  assert.equal(a1.paraDelta, 9);
  assert.equal(a2.felt, null);
  const prof = AP.trainingProfile(events);
  assert.equal(prof.endurance.completed, 1, 'an unrated attempt still counts as completed');
  assert.equal(prof.endurance.felt.unrated, 1);
  assert.equal(prof.dialogue.felt.right, 1);
});

test('completion follows how long the sprint ran, not whether it was rated', () => {
  const att = (sprints, n = 1) => ({ sprints, sprintsPlanned: n });
  const ev1 = [sp('a', 'start', T, 20), sp('a', 'end', T + mins(17), 20)];           // 85% of planned
  assert.equal(AP.attemptStatus(att(['a']), mapOf(ev1)), 'completed');
  const ev2 = [sp('b', 'start', T, 20), sp('b', 'end', T + mins(8), 20)];
  assert.equal(AP.attemptStatus(att(['b']), mapOf(ev2)), 'ended early');
  const ev3 = [sp('c', 'start', T, 20), sp('c', 'discard', T + mins(5), 20), sp('c', 'end', T + mins(5), 20, { reason: 'discard' })];
  assert.equal(AP.attemptStatus(att(['c']), mapOf(ev3)), 'abandoned');
  const ev4 = [sp('d', 'start', T, 20), sp('d', 'end', T + mins(3), 20, { reason: 'interrupted' })];
  assert.equal(AP.attemptStatus(att(['d']), mapOf(ev4)), 'interrupted');
  assert.equal(AP.attemptStatus(att(['missing']), new Map()), 'interrupted');
});

test('a session-length exercise spans several sprints and waits between them', () => {
  const evs = [sp('s1', 'start', T, 10), sp('s1', 'end', T + mins(10), 10)];
  const a = { sprints: ['s1'], sprintsPlanned: 3 };
  assert.deepEqual(AP.attemptNext(a, mapOf(evs)), { op: 'continue', between: true, done: 1 });
  evs.push(sp('s2', 'start', T + mins(20), 10));
  assert.deepEqual(AP.attemptNext({ sprints: ['s1', 's2'], sprintsPlanned: 3 }, mapOf(evs)), { op: 'continue' }, 'a sprint is running');
  evs.push(sp('s2', 'end', T + mins(30), 10), sp('s3', 'start', T + mins(40), 10), sp('s3', 'end', T + mins(50), 10));
  assert.deepEqual(AP.attemptNext({ sprints: ['s1', 's2', 's3'], sprintsPlanned: 3 }, mapOf(evs)), { op: 'end', status: 'completed' });
  const short = [sp('t1', 'start', T, 10), sp('t1', 'end', T + mins(2), 10)];
  assert.deepEqual(AP.attemptNext({ sprints: ['t1'], sprintsPlanned: 3 }, mapOf(short)), { op: 'end', status: 'ended early' }, 'stopping early ends the session exercise');
});

test('session characteristics are training measures: time, composed words, revision during and after', () => {
  const evs = [
    sp('s1', 'start', T, 20), E({ type: 'count', book: 'b', total: 100, t: T, sprint: 's1' }),
    E({ type: 'rec', op: 'start', t: T + mins(1) }), E({ type: 'rec', op: 'stop', t: T + mins(9) }), E({ type: 'rec', op: 'start', t: T + mins(10) }),
    E({ type: 'typing', book: 'b', added: 300, removed: 12, from: T + mins(2), to: T + mins(18), t: T + mins(18) }),
    E({ type: 'count', book: 'b', total: 388, t: T + mins(20), sprint: 's1' }), sp('s1', 'end', T + mins(20), 20),
    E({ type: 'typing', book: 'b', added: 0, removed: 20, from: T + mins(25), to: T + mins(26), t: T + mins(26) }),
  ];
  const c = AP.attemptCharacteristics({ sprints: ['s1'], paraDelta: 4 }, mapOf(evs), evs);
  assert.equal(c.recordings, 2);
  assert.equal(c.composed, 288);
  assert.equal(c.revisedDuring, 12);
  assert.equal(c.revisedAfter, 20);
  assert.equal(c.paragraphsAdded, 4);
  assert.equal(c.runningMin, 20);
});

test('comparisons need the same exercise, options and setup, and three sessions in each half', () => {
  const a = (exercise, params, setup) => ({ exercise, params, setup });
  assert.notEqual(AP.comparisonKey(a('two-voices', { exchanges: 6 }, 'k1')), AP.comparisonKey(a('two-voices', { exchanges: 12 }, 'k1')));
  assert.notEqual(AP.comparisonKey(a('two-voices', { exchanges: 6 }, 'k1')), AP.comparisonKey(a('two-voices', { exchanges: 6 }, 'k2')));
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ c: { composedPerActiveMin: 20 + i, activeMin: 15, revisedDuring: 10 - i } }));
  assert.equal(AP.comparable(rows(5)), null);
  const cmp = AP.comparable(rows(6));
  assert.deepEqual(cmp.earlier, { n: 3, composedPerActiveMin: 21, activeMin: 15, revisedDuring: 9 });
  assert.deepEqual(cmp.recent, { n: 3, composedPerActiveMin: 24, activeMin: 15, revisedDuring: 6 });
  assert.ok(!('better' in cmp) && !('score' in cmp));
});

test('stages are set by the author only; the default is Learning', () => {
  const evs = [E({ type: 'stage', ability: 'dialogue', stage: 'practising', by: 'author', t: T }), E({ type: 'stage', ability: 'nonsense', stage: 'independent', t: T })];
  const p = AP.trainingProfile(evs);
  assert.equal(p.dialogue.stage, 'practising');
  assert.equal(p.composition.stage, 'learning');
  assert.ok(!('nonsense' in p));
});

test('exercise events cannot carry text into the ledger', () => {
  const e = AP.safeEvent({ type: 'ex.evidence', attempt: 'a', key: 'reachedEnd', value: 'yes', text: 'The rain fell on the city all night', raw: 'secret', note: 'prose' });
  assert.deepEqual(e, { type: 'ex.evidence', attempt: 'a', key: 'reachedEnd', value: 'yes' });
  assert.equal(AP.safeEvent({ type: 'ex.evidence', value: 'a long sentence of manuscript prose' }).value, undefined);
});
