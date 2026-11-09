const test = require('node:test');
const assert = require('node:assert');
const M = require('../lib/mastery.js');

const T0 = Date.UTC(2026, 10, 4, 15, 0, 0); // a Wednesday afternoon
const min = (n) => n * 60000;
let k = 0;
const ev = (o) => ({ id: o.id || 'e' + k++, ...o });
const sprintEv = (sprint, op, t, extra = {}) => ev({ type: 'sprint', sprint, op, t, plannedMin: 30, ...extra });
const count = (sprint, t, total, book = 'b') => ev({ type: 'count', book, total, t, sprint });

/* ---------- ledger ---------- */

test('ledger: partial last line and junk are skipped; duplicates across devices count once', () => {
  const a = JSON.stringify({ id: 'x1', t: 1, type: 'count', book: 'b', total: 10 }) + '\n' + '{"id":"x2","t":2,"ty';
  const b = JSON.stringify({ id: 'x1', t: 1, type: 'count', book: 'b', total: 10 }) + '\nnot json\n' + JSON.stringify({ id: 'x3', t: 3, type: 'count', book: 'b', total: 12 });
  const { events, skipped } = M.parseLedger([a, b]);
  assert.deepEqual(events.map((e) => e.id), ['x1', 'x3']);
  assert.equal(skipped, 2);
});

/* ---------- profile ---------- */

test('profile: newest stamp wins per field, ties resolve the same on every device', () => {
  const p = M.mergeProfiles([
    { device: 'mac-a', fields: { goalWords: { v: 1000, t: 5 }, sprintMin: { v: 25, t: 9 } } },
    { device: 'mac-b', fields: { goalWords: { v: 1500, t: 7 }, sprintMin: { v: 45, t: 9 }, bogus: { v: 1, t: 99 } } },
  ]);
  assert.equal(p.goalWords, 1500);
  assert.equal(p.sprintMin, 45, 'tie goes to the higher device id');
  assert.equal(p.enabled, false, 'off by default');
  assert.ok(!('bogus' in p));
  const fields = M.patchFields({ goalWords: { v: 1, t: 1 } }, { goalWords: 2000, nope: 3 }, 10);
  assert.deepEqual(fields, { goalWords: { v: 2000, t: 10 } });
});

/* ---------- time ---------- */

test('session ids parse to the recording start; writing days roll over at 4 a.m.', () => {
  assert.equal(M.parseSessionTime('take-2026-11-04-21-37-09'), Date.UTC(2026, 10, 4, 21, 37, 9));
  assert.equal(M.parseSessionTime('import-2026-11-04-21-37-09'), Date.UTC(2026, 10, 4, 21, 37, 9));
  assert.equal(M.parseSessionTime('nonsense'), null);
  const lateNight = new Date(2026, 10, 5, 2, 30).getTime();
  assert.equal(M.dayKey(lateNight, 4), '2026-11-04');
  assert.equal(M.dayKey(lateNight, 0), '2026-11-05');
});

test('rest days: planned weekdays and one-off dates', () => {
  const p = M.sanitizeProfile({ writingDays: [1, 2, 3, 4, 5], restDates: ['2026-11-04'] });
  assert.equal(M.isRestDay(p, '2026-11-04'), true, 'one-off rest date');
  assert.equal(M.isRestDay(p, '2026-11-05'), false, 'a Thursday');
  assert.equal(M.isRestDay(p, '2026-11-07'), true, 'a Saturday');
});

/* ---------- sprint lifecycle ---------- */

test('stopping and restarting dictation does not end a sprint; pauses are excluded from running time', () => {
  const events = [
    sprintEv('s1', 'start', T0),
    ev({ type: 'rec', op: 'start', t: T0 + min(1) }), ev({ type: 'rec', op: 'stop', t: T0 + min(8) }),
    ev({ type: 'rec', op: 'start', t: T0 + min(10) }), ev({ type: 'rec', op: 'stop', t: T0 + min(20) }),
    sprintEv('s1', 'pause', T0 + min(20)), sprintEv('s1', 'resume', T0 + min(30)),
    ev({ type: 'rec', op: 'start', t: T0 + min(31) }),
  ];
  const [s] = M.deriveSprints(events, { liveId: 's1', now: T0 + min(45) });
  assert.equal(s.open, true, 'still running after two recordings stopped');
  assert.equal(s.end, null);
  const st = M.sprintStats(s, events);
  assert.equal(st.runningSec, 35 * 60);
  assert.equal(st.wallSec, 45 * 60);
});

test('planned time passing does not end a sprint (overtime)', () => {
  const events = [sprintEv('s1', 'start', T0, { plannedMin: 30 })];
  const [s] = M.deriveSprints(events, { liveId: 's1', now: T0 + min(50) });
  assert.equal(s.open, true);
  assert.equal(M.sprintStats(s, events).runningSec, 50 * 60);
});

test('a sprint left open by a crash: paused if today, closed at last activity if an earlier day', () => {
  const events = [sprintEv('s1', 'start', T0), ev({ type: 'typing', book: 'b', added: 40, removed: 0, from: T0 + min(2), to: T0 + min(6), t: T0 + min(6) })];
  const [s] = M.deriveSprints(events, {});
  assert.deepEqual(M.recoverOpenSprint(s, events, T0 + min(30), 4), { op: 'pause', at: T0 + min(6), reason: 'restart' });
  const r = M.recoverOpenSprint(s, events, T0 + min(60 * 26), 4);
  assert.equal(r.op, 'end');
  assert.equal(r.at, T0 + min(6));
});

test('discarded sprints never qualify for the baseline', () => {
  const events = [sprintEv('s1', 'start', T0), sprintEv('s1', 'discard', T0 + min(20)), sprintEv('s1', 'end', T0 + min(20))];
  const [s] = M.deriveSprints(events);
  assert.equal(s.discarded, true);
  assert.equal(M.baseline([{ sprint: s, stats: M.sprintStats(s, events) }]).qualifying, 0);
});

/* ---------- measures ---------- */

function sampleSprint() {
  const session = 'take-2026-11-04-15-01-00';
  const at = M.parseSessionTime(session);
  return [
    sprintEv('s1', 'start', T0), count('s1', T0, 1000),
    ev({ id: 'dict:b:a', type: 'dict', book: 'b', seg: 'a', src: 'live', session, spokenAt: at + 5000, speechSec: 20, raw: 62, words: 60, t: at + 30000 }),
    ev({ id: 'dict:b:a', type: 'dict', book: 'b', seg: 'a', src: 'live', session, spokenAt: at + 5000, speechSec: 20, raw: 62, words: 60, t: at + 90000 }), // re-emitted: same id
    ev({ id: 'dict:b:c', type: 'dict', book: 'b', seg: 'c', src: 'live', session, spokenAt: at + 60000, speechSec: 30, raw: 85, words: 80, t: at + 99000 }),
    ev({ type: 'revise', book: 'b', seg: 'a', kind: 'switch', delta: 4, t: T0 + min(5) }),
    ev({ type: 'revise', book: 'b', seg: 'a', kind: 'switch', delta: -4, t: T0 + min(6) }),
    ev({ type: 'typing', book: 'b', added: 30, removed: 10, from: T0 + min(8), to: T0 + min(10), t: T0 + min(10) }),
    ev({ type: 'typing', book: 'b', added: 500, removed: 0, paste: true, from: T0 + min(11), to: T0 + min(11), t: T0 + min(11) }),
    ev({ id: 'dict:b:i', type: 'dict', book: 'b', seg: 'i', src: 'import', session: 'import-2026-11-04-15-12-00', spokenAt: null, speechSec: 300, raw: 700, words: 690, t: T0 + min(12) }),
    count('s1', T0 + min(25), 1000 + 60 + 80 + 30 - 10 + 500 + 690),
    sprintEv('s1', 'end', T0 + min(25)),
  ];
}

test('gross, net, imported, pasted and removed are kept apart; retries and switches never add', () => {
  const { events } = M.parseLedger(sampleSprint().map((e) => JSON.stringify(e)).join('\n'));
  const [s] = M.deriveSprints(events);
  const st = M.sprintStats(s, events);
  assert.equal(st.liveWords, 140, 'the re-emitted passage counts once');
  assert.equal(st.typedWords, 30);
  assert.equal(st.gross, 170, 'pasted and imported words are not gross production');
  assert.equal(st.pasted, 500);
  assert.equal(st.imported, 690);
  assert.equal(st.removed, 10 + 4, 'typed deletions plus the switch that lost words');
  assert.equal(st.net, 60 + 80 + 20 + 500 + 690, 'net is what the manuscript actually grew by');
  assert.equal(st.rawWords, 147);
  assert.equal(st.speakingSec, 50);
  assert.equal(st.mode, 'dictation');
});

test('active composition time bridges short thinking gaps and drops long ones', () => {
  const events = [
    sprintEv('s1', 'start', T0),
    ev({ type: 'typing', book: 'b', added: 20, removed: 0, from: T0, to: T0 + min(2), t: T0 + min(2) }),
    ev({ type: 'typing', book: 'b', added: 20, removed: 0, from: T0 + min(3), to: T0 + min(5), t: T0 + min(5) }),   // 1-min gap: bridged
    ev({ type: 'typing', book: 'b', added: 20, removed: 0, from: T0 + min(15), to: T0 + min(17), t: T0 + min(17) }), // 10-min gap: not
    sprintEv('s1', 'end', T0 + min(20)),
  ];
  const [s] = M.deriveSprints(events);
  const st = M.sprintStats(s, events);
  assert.equal(st.activeSec, 7 * 60);
  assert.ok(Math.abs(st.wpm - 60 / 7) < 1e-9, 'gross words per active minute');
});

test('a delayed transcription belongs to when it was spoken: its sprint and its writing day', () => {
  const session = 'take-2026-11-05-03-50-00'; // spoken before the 4 a.m. rollover... in UTC
  const spokenAt = M.parseSessionTime(session) + 10000;
  const late = ev({ id: 'dict:b:z', type: 'dict', book: 'b', seg: 'z', src: 'live', session, spokenAt, speechSec: 15, raw: 40, words: 40, t: spokenAt + min(90) });
  const key = M.dayKey(spokenAt, 4);
  assert.equal(M.dayStats([late], key, 4).liveWords, 40);
  assert.equal(M.dayStats([late], M.dayKey(late.t + min(60 * 24), 4), 4).liveWords, 0);
  const events = [sprintEv('s9', 'start', spokenAt - min(1)), sprintEv('s9', 'end', spokenAt + min(1)), late];
  const [s] = M.deriveSprints(events);
  assert.equal(M.sprintStats(s, events).liveWords, 40, 'counted in the sprint even though the text arrived 90 minutes later');
});

test('day stats include writing outside sprints and legacy sessions', () => {
  const day = M.dayKey(T0, 4);
  const events = [count(undefined, T0, 100), ev({ type: 'typing', book: 'b', added: 50, removed: 5, from: T0, to: T0 + 1000, t: T0 + 1000 }), count(undefined, T0 + min(30), 145),
    ...M.legacyEvents('b', [{ start: T0 - min(60), end: T0 - min(30), added: 200 }])];
  const st = M.dayStats(events, day, 4);
  assert.equal(st.net, 45 + 200);
  assert.equal(st.typedWords, 50);
  assert.equal(st.removed, 5);
});

/* ---------- baseline and estimates ---------- */

function completed(n, net, plannedMin = 30, mode = 'dictation') {
  const out = [];
  for (let i = 0; i < n; i++) {
    const start = T0 + i * min(60);
    const sprint = { id: 's' + i, start, end: start + min(plannedMin), plannedMin, intervals: [[start, start + min(plannedMin)]], discarded: false, open: false };
    out.push({ sprint, stats: { runningSec: plannedMin * 60, imported: 0, gross: net, net, wpm: net / plannedMin, mode, activeSec: plannedMin * 60 } });
  }
  return out;
}

test('baseline: calibrating, provisional from 3, calibrated at 10; short sprints do not qualify', () => {
  assert.equal(M.baseline(completed(2, 1000)).provisional, false);
  assert.equal(M.baseline(completed(3, 1000)).provisional, true);
  const b = M.baseline(completed(10, 1250));
  assert.equal(b.calibrated, true);
  assert.equal(b.medianNet, 1250);
  assert.equal(b.speed.dictation, Math.round(1250 / 30));
  assert.equal(M.baseline(completed(10, 300, 5)).qualifying, 0, '5-minute sprints are too short to qualify');
});

test('estimate: 1,250 per sprint and a 5,000 target means four sprints, against the window', () => {
  const p = M.sanitizeProfile({ sprintMin: 30, breakMin: 10, windowMin: 120 });
  const e = M.estimate(5000, M.baseline(completed(10, 1250)), p);
  assert.equal(e.sprints, 4);
  assert.equal(e.minutes, 4 * 30 + 3 * 10);
  assert.equal(e.fits, false, '150 minutes does not fit a 120-minute window');
  assert.equal(M.estimate(5000, M.baseline(completed(10, 1250)), p, 4000).sprints, 1, 'counts what is already written today');
  assert.equal(M.estimate(5000, M.baseline(completed(2, 1250)), p), null, 'no estimate before 3 sprints');
});

test('nothing in the engine changes a goal', () => {
  const p = M.sanitizeProfile({ goalWords: 1000 });
  const frozen = JSON.stringify(p);
  M.estimate(5000, M.baseline(completed(10, 2000)), p);
  M.baseline(completed(10, 2000));
  assert.equal(JSON.stringify(p), frozen);
});

test('legacy import ids are stable, so importing on two Macs yields one event each', () => {
  const sessions = [{ start: 1, end: 2, added: 30 }, { start: 5, end: 9, added: 40 }];
  const a = M.legacyEvents('Book', sessions), b = M.legacyEvents('Book', sessions);
  const { events } = M.parseLedger([a.map(JSON.stringify).join('\n'), b.map(JSON.stringify).join('\n')]);
  assert.equal(events.length, 2);
});

test('back-to-back sprints never share a passage', () => {
  const session = 'take-2026-11-04-15-00-01';
  const at = M.parseSessionTime(session);
  const events = [
    sprintEv('a', 'start', at - 1300), sprintEv('a', 'end', at - 1000),           // an empty sprint just before speaking
    sprintEv('b', 'start', at - 400),
    ev({ id: 'dict:b:1', type: 'dict', book: 'b', seg: '1', src: 'live', session, spokenAt: at + 900, speechSec: 2.4, raw: 8, words: 8, t: at + 5000 }),
    ev({ id: 'dict:b:2', type: 'dict', book: 'b', seg: '2', src: 'live', session, spokenAt: at + 4400, speechSec: 3.7, raw: 10, words: 10, t: at + 9000 }),
    sprintEv('b', 'end', at + 16000),
  ];
  const sprints = M.deriveSprints(events);
  const owner = M.ownership(sprints, events);
  const [a, b] = sprints.map((s) => M.sprintStats(s, events, owner));
  assert.equal(a.liveWords, 0, 'the empty sprint gets nothing');
  assert.equal(b.liveWords, 18);
  assert.equal(M.sprintStats(sprints[0], events).liveWords, 0, 'also without an ownership map');
});

/* ---------- regression: things that must not distort productivity ---------- */

function liveDict(seg, session, offsetSec, speechSec, words, landedAt, book = 'b') {
  const spokenAt = M.parseSessionTime(session) + offsetSec * 1000;
  return ev({ id: `dict:${book}:${seg}`, type: 'dict', book, seg, src: 'live', session, spokenAt, speechSec, raw: words, words, t: landedAt });
}
function oneSprint(events, id = 's1') {
  const sprints = M.deriveSprints(events);
  const owner = M.ownership(sprints.filter((s) => !s.discarded), events);
  return M.sprintStats(sprints.find((s) => s.id === id), events, owner);
}

test('a passage landing long after the sprint closed still counts as composed in that sprint', () => {
  const session = 'take-2026-11-04-15-00-00', at = M.parseSessionTime(session);
  const events = [
    sprintEv('s1', 'start', at), count('s1', at, 1000),
    liveDict('a', session, 10, 20, 50, at + min(1)),
    count('s1', at + min(10), 1050), sprintEv('s1', 'end', at + min(10)),
    liveDict('b', session, 500, 30, 80, at + min(25)),        // spoken at 8:20 in, landed 15 minutes after the end
  ];
  const st = oneSprint(events);
  assert.equal(st.net, 50, 'raw growth only saw what landed before the closing count');
  assert.equal(st.composed, 130, 'composed growth adds the late passage');
  assert.equal(st.liveWords, 130);
});

test('a late passage from sprint A landing during sprint B is not credited to B', () => {
  const session = 'take-2026-11-04-15-00-00', at = M.parseSessionTime(session);
  const events = [
    sprintEv('A', 'start', at), count('A', at, 0), count('A', at + min(10), 0), sprintEv('A', 'end', at + min(10)),
    sprintEv('B', 'start', at + min(12)), count('B', at + min(12), 0),
    liveDict('lateA', session, 300, 20, 70, at + min(13)),     // spoken in A, landed in B
    count('B', at + min(20), 70), sprintEv('B', 'end', at + min(20)),
  ];
  assert.equal(oneSprint(events, 'B').net, 70);
  assert.equal(oneSprint(events, 'B').composed, 0, 'B composed nothing');
  assert.equal(oneSprint(events, 'A').composed, 70, 'A gets its words');
});

test('imports, pastes, version switches, restores and chapter deletions do not change composed growth', () => {
  const t = T0;
  const events = [
    sprintEv('s1', 'start', t), count('s1', t, 5000),
    ev({ type: 'typing', book: 'b', added: 40, removed: 0, from: t + min(1), to: t + min(2), t: t + min(2) }),
    ev({ id: 'dict:b:imp', type: 'dict', book: 'b', seg: 'imp', src: 'import', session: 'import-2026-11-04-15-03-00', spokenAt: null, speechSec: 600, raw: 1500, words: 1500, t: t + min(3) }),
    ev({ type: 'typing', book: 'b', added: 800, removed: 0, paste: true, from: t + min(4), to: t + min(4), t: t + min(4) }),
    ev({ type: 'revise', book: 'b', seg: 'x', kind: 'switch', delta: 6, t: t + min(5) }),
    ev({ type: 'structure', book: 'b', kind: 'history.restore', delta: 300, t: t + min(6) }),
    ev({ type: 'structure', book: 'b', kind: 'chapter.trash', delta: -2000, t: t + min(7) }),
    count('s1', t + min(15), 5000 + 40 + 1500 + 800 + 6 + 300 - 2000), sprintEv('s1', 'end', t + min(15)),
  ];
  const st = oneSprint(events);
  assert.equal(st.net, 646, 'raw growth reflects everything that happened to the manuscript');
  assert.equal(st.composed, 40, 'only the typed words were composed');
  assert.equal(st.gross, 40);
});

test('a cut-and-paste move is neutral', () => {
  const events = [
    sprintEv('s1', 'start', T0), count('s1', T0, 1000),
    ev({ type: 'typing', book: 'b', added: 0, removed: 120, paste: true, from: T0 + min(1), to: T0 + min(1), t: T0 + min(1) }),
    ev({ type: 'typing', book: 'b', added: 120, removed: 0, paste: true, from: T0 + min(2), to: T0 + min(2), t: T0 + min(2) }),
    count('s1', T0 + min(5), 1000), sprintEv('s1', 'end', T0 + min(5)),
  ];
  assert.equal(oneSprint(events).composed, 0);
});

test('a retry done days later is credited to the day it was spoken, not the retry day', () => {
  const session = 'take-2026-11-04-15-00-00', at = M.parseSessionTime(session);
  const spokenDay = M.dayKey(at, 4);
  const retryAt = at + min(60 * 48);
  const retryDay = M.dayKey(retryAt, 4);
  const events = [
    count(undefined, at - min(1), 100), count(undefined, at + min(5), 100),   // the passage failed that day
    count(undefined, retryAt - min(1), 100),
    liveDict('failed1', session, 30, 12, 45, retryAt),                         // retried two days later
    count(undefined, retryAt + min(1), 145),
  ];
  assert.equal(M.dayStats(events, spokenDay, 4).composed, 45);
  assert.equal(M.dayStats(events, retryDay, 4).net, 45, 'the manuscript did grow on the retry day');
  assert.equal(M.dayStats(events, retryDay, 4).composed, 0, 'but nothing was composed that day');
  assert.equal(M.dayStats(events, spokenDay, 4).liveWords, 45);
});

test('the baseline uses composed growth, so an import-heavy sprint cannot inflate it', () => {
  const runs = [];
  for (let i = 0; i < 10; i++) {
    const t = T0 + i * min(60), id = 'r' + i;
    runs.push(sprintEv(id, 'start', t), count(id, t, 0),
      ev({ type: 'typing', book: 'b', added: 500, removed: 0, from: t + min(1), to: t + min(20), t: t + min(20) }));
    if (i === 9) runs.push(ev({ id: 'dict:b:big', type: 'dict', book: 'b', seg: 'big', src: 'import', session: 'import-x', spokenAt: null, speechSec: 0, raw: 400, words: 400, t: t + min(21) }));
    runs.push(count(id, t + min(30), i === 9 ? 900 : 500), sprintEv(id, 'end', t + min(30)));
  }
  const sprints = M.deriveSprints(runs);
  const owner = M.ownership(sprints, runs);
  const base = M.baseline(sprints.map((s) => ({ sprint: s, stats: M.sprintStats(s, runs, owner) })), 30);
  assert.equal(base.calibrated, true);
  assert.equal(base.medianNet, 500);
  assert.equal(base.p75Net, 500, 'the 900-word import sprint does not raise the spread');
});
