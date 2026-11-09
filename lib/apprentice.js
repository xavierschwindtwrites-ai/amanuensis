/*
 * Dictation Apprenticeship, step 1: signals and setup keys. Pure functions, no DOM, no disk.
 * Design: docs/writing-mastery-system.md §16.4 and §16.7.
 *
 * Signals are measured from RAW transcripts only, never from formatted text, and only ever
 * compared within one transcription setup: a different transcriber or pause setting must not
 * look like a change in the author. They are imperfect training indicators, not judgments of
 * writing quality, and nothing here rewards speed or penalises pauses.
 *
 * lib/format.js is used read-only (words, countWords, cleanup). It is never modified.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./format.js'), require('./mastery.js'));
  else root.AmanuensisApprentice = factory(root.AmanuensisFormat, root.AmanuensisMastery);
})(typeof self !== 'undefined' ? self : this, function (F, M) {
  'use strict';

  const KEY_VERSION = 1;
  const MIN_PASSAGE_WORDS = 3;
  const MIN_PASSAGE_SEC = 1;
  const MIN_SAMPLE = 10;           // passages before a summary reports anything
  const TREND_WINDOW = 20;         // passages per window when comparing before and after

  /* ---------------- setup keys ---------------- */

  /**
   * Everything about the transcription setup that can change what the raw transcript looks like,
   * or how passages are cut. Measures are compared only within one key.
   *  provider/model/language: different engines drop or keep fillers and repeats differently
   *  pauseMs:   decides where passages end, so it changes passage length
   *  level:     cleanup level, which changes what reaches the page
   *  ai:        AI formatting on or off
   *  punct:     spoken punctuation puts command words into the raw transcript
   */
  function setupKey(settings, providers) {
    const s = settings || {};
    const provider = s.provider || 'unknown';
    const model = s.model || (providers && providers[provider] && providers[provider].models && providers[provider].models[0]) || 'default';
    const parts = {
      provider, model, language: String(s.language || 'en').toLowerCase(),
      pauseMs: Math.round(Number(s.pauseMs) || 700), level: Number.isInteger(s.level) ? s.level : 1,
      ai: s.formatEnabled ? 1 : 0, punct: s.punctCommands ? 1 : 0,
    };
    const key = ['v' + KEY_VERSION, parts.provider, parts.model, parts.language, parts.pauseMs, 'L' + parts.level, 'ai' + parts.ai, 'pc' + parts.punct].join('|');
    return { key, parts, label: `${parts.provider} ${parts.model}, ${parts.language}, ${parts.pauseMs} ms pause` };
  }

  /* ---------------- per-passage signals ---------------- */

  // A break mark (dash, ellipsis, trailing hyphen) followed within a few words by the phrase's opening word again:
  // "He grabbed the — he took the sword." Conservative by design: no break mark, no count.
  const FALSE_START = /(?:^|[.!?]\s+|,\s+)([\p{L}']+)\b[^.!?—…]{0,60}?(?:\s?[—–]\s?|\s?--\s?|…|\.\.\.|-\s)\s*\1\b/giu;

  /**
   * Counts from one raw transcript. Fillers and doubled words are exactly what the pipeline's own
   * cleanup would remove at Light and Moderate, so these counts can never drift from the guard's rules.
   */
  function passageSignals(raw, notes) {
    const text = String(raw || '');
    const words = F.words(text).length;
    const afterLight = F.words(F.cleanup(text, 1)).length;
    const afterModerate = F.words(F.cleanup(text, 2)).length;
    let falseStarts = 0;
    FALSE_START.lastIndex = 0;
    while (FALSE_START.exec(text)) falseStarts++;
    const artifactNote = (notes || []).some((n) => /collapsed a repeated|boilerplate|likely noise/i.test(String(n)));
    return {
      words,
      fillers: Math.max(0, words - afterLight),
      doubled: Math.max(0, afterLight - afterModerate),
      falseStarts,
      artifact: artifactNote || words === 0,
    };
  }

  /* ---------------- eligibility ---------------- */

  /** Why a passage can't be used for training measures, or null if it can. */
  function exclusion(e) {
    if (e.type !== 'dict') return 'not a passage';
    if (e.src !== 'live') return 'imported';
    if (e.space && e.space !== 'manuscript') return 'practice';
    if (e.retried) return 'retried';
    if (e.artifact) return 'transcriber artifact';
    if (!e.setup) return 'no setup key';
    if ((e.raw || 0) < MIN_PASSAGE_WORDS || (e.speechSec || 0) < MIN_PASSAGE_SEC) return 'too short';
    if (typeof e.fillers !== 'number') return 'no signals';
    return null;
  }

  /* ---------------- summaries ---------------- */

  const median = (xs) => (xs.length ? M.quantile(xs, 0.5) : null);
  const per100 = (count, words) => (words > 0 ? (count / words) * 100 : 0);
  const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

  function measure(passages) {
    const words = passages.reduce((s, e) => s + e.raw, 0);
    return {
      n: passages.length,
      passageWords: round1(median(passages.map((e) => e.raw))),
      passageSec: round1(median(passages.map((e) => e.speechSec))),
      speakingRate: round1(median(passages.map((e) => e.raw / (e.speechSec / 60)))),   // raw words per speaking minute
      fillersPer100: round1(per100(passages.reduce((s, e) => s + e.fillers, 0), words)),
      doubledPer100: round1(per100(passages.reduce((s, e) => s + e.doubled, 0), words)),
      falseStartsPer100: round1(per100(passages.reduce((s, e) => s + e.falseStarts, 0), words)),
    };
  }

  /**
   * Signals per setup key. A key with fewer than MIN_SAMPLE eligible passages reports only its count.
   * Never merges keys.
   */
  function summarize(events, opts = {}) {
    const byKey = new Map();
    const excluded = {};
    for (const e of events) {
      if (e.type !== 'dict') continue;
      if (opts.since && e.t < opts.since) continue;
      const why = exclusion(e);
      if (why) { excluded[why] = (excluded[why] || 0) + 1; continue; }
      if (!byKey.has(e.setup)) byKey.set(e.setup, []);
      byKey.get(e.setup).push(e);
    }
    const keys = {};
    for (const [key, list] of byKey) {
      keys[key] = list.length >= MIN_SAMPLE ? { ready: true, ...measure(list) } : { ready: false, n: list.length, needs: MIN_SAMPLE };
    }
    return { keys, excluded };
  }

  /**
   * Compare the latest window of passages with the one before it, within one setup key.
   * Returns null until both windows are full. Reports differences only; it never says better or worse.
   */
  function trend(events, setup, windowSize = TREND_WINDOW) {
    const list = events.filter((e) => e.type === 'dict' && e.setup === setup && !exclusion(e)).sort((a, b) => a.t - b.t);
    if (list.length < windowSize * 2) return null;
    const after = measure(list.slice(-windowSize));
    const before = measure(list.slice(-windowSize * 2, -windowSize));
    return { setup, before, after };
  }

  /* ---------------- revision while drafting ---------------- */

  /**
   * Revision activity during a sprint's running time, against the half hour after it ended.
   * Used later only by the Continuous Drafting exercise, as "during vs after". Fewer revisions
   * overall is not treated as better.
   */
  function draftingRevision(sprint, events, afterMin = 30) {
    const ranges = sprint.intervals || [];
    const inRun = (t) => ranges.some(([a, b]) => t >= a && t <= b);
    const end = sprint.end != null ? sprint.end : ranges.length ? ranges[ranges.length - 1][1] : sprint.start;
    const inAfter = (t) => t > end && t <= end + afterMin * 60000;
    const out = { during: 0, after: 0, duringEdits: 0, afterEdits: 0 };
    for (const e of events) {
      let amount = 0;
      if (e.type === 'typing' && !e.paste) amount = e.removed || 0;
      else if (e.type === 'revise') amount = Math.abs(e.delta || 0) || 1;
      else continue;
      if (!amount) continue;
      const t = e.type === 'typing' ? e.to || e.t : e.t;
      if (inRun(t)) { out.during += amount; out.duringEdits++; }
      else if (inAfter(t)) { out.after += amount; out.afterEdits++; }
    }
    return out;
  }

  /* ================= Step 2: exercises, attempts, ratings ================= */

  /*
   * The catalogue. Every exercise runs inside an ordinary sprint on the author's own manuscript.
   * Options are choices, not levels. `basis` says honestly how much evidence stands behind it.
   * `question` is an optional, author-answered piece of task evidence shown after the exercise.
   */
  const ABILITIES = [
    { id: 'composition', name: 'Mental Composition', purpose: 'Form each sentence before you say it, so speaking becomes reading out a sentence already made.' },
    { id: 'drafting', name: 'Continuous Drafting', purpose: 'Keep momentum by leaving fixes for later.' },
    { id: 'dialogue', name: 'Dialogue Fluency', purpose: 'Make spoken dialogue as easy as narration.' },
    { id: 'scene', name: 'Scene Development', purpose: 'Carry one scene from its start to its end by voice.' },
    { id: 'endurance', name: 'Writing Endurance', purpose: 'Grow a comfortable, sustainable session, with rest built in.' },
  ];

  const MINUTES = (list, dflt) => ({ key: 'minutes', label: 'Length', options: list.map((m) => ({ value: m, label: m + ' min' })), default: dflt });

  const EXERCISES = [
    { id: 'sentence-in-mind', ability: 'composition', name: 'Sentence in mind',
      how: 'Before each sentence, pause and form it whole in your head, then say it once.',
      basis: 'Planning before writing is supported by research (Kellogg 1988); applying it sentence by sentence is a working hypothesis.',
      params: [{ key: 'hold', label: 'Hold in mind', options: [{ value: 1, label: 'one sentence' }, { value: 2, label: 'two sentences' }, { value: 3, label: 'a short paragraph' }], default: 1 }, MINUTES([10, 15, 20, 30], 15)] },
    { id: 'plan-in-mind', ability: 'composition', name: 'Three moments ahead',
      how: 'Before you start, decide the next three things that happen. Keep them in your head and write toward them.',
      basis: 'Advance planning improved story development in experiments (Quinlan 2004).',
      params: [MINUTES([10, 15, 20, 30], 20)],
      question: { key: 'landed', text: 'How many of the three made it onto the page?', options: [0, 1, 2, 3] } },
    { id: 'draft-now', ability: 'drafting', name: 'Draft now, fix later',
      how: 'Don’t stop to correct anything during the sprint. Keep going; fix what bothers you afterwards.',
      basis: 'One author’s practice (Seth Ring). Rough drafting showed no quality benefit in research, so treat this as a way to keep momentum, not to write better.',
      params: [MINUTES([10, 15, 20, 30], 20)] },
    { id: 'two-voices', ability: 'dialogue', name: 'Two voices',
      how: 'Write a stretch led by dialogue. Say “new paragraph” each time the speaker changes.',
      basis: 'Practice structure drawn from deliberate-practice principles; the exercise itself is a hypothesis.',
      params: [{ key: 'exchanges', label: 'Aim for', options: [{ value: 6, label: '6 exchanges' }, { value: 12, label: '12 exchanges' }, { value: 0, label: 'a full scene' }], default: 6 }, MINUTES([10, 15, 20], 15)] },
    { id: 'beats-not-tags', ability: 'dialogue', name: 'Beats, not tags',
      how: 'Carry the dialogue with small actions instead of “she said”.',
      basis: 'A craft exercise; no direct research on dictation.',
      params: [MINUTES([10, 15, 20], 15)] },
    { id: 'whole-scene', ability: 'scene', name: 'One scene, start to finish',
      how: 'Choose a scene and dictate it from its first moment to its last in this sprint.',
      basis: 'Builds on planning research (Kellogg 1988; Quinlan 2004).',
      params: [MINUTES([10, 20, 30], 20)],
      question: { key: 'reachedEnd', text: 'Did the scene reach its end?', options: ['yes', 'not yet'] } },
    { id: 'one-take', ability: 'scene', name: 'One take',
      how: 'Dictate the scene without stopping the recording. Thinking pauses are fine.',
      basis: 'One author’s practice; a hypothesis.',
      params: [MINUTES([10, 20, 30], 10)] },
    { id: 'sprint-ladder', ability: 'endurance', name: 'Sprint length',
      how: 'Write for the chosen length. Lengthen it only when the current one feels comfortable.',
      basis: 'Goal-setting research supports specific, achievable targets (Locke & Latham 2002).',
      params: [MINUTES([10, 15, 20, 25, 30], 10)] },
    { id: 'session-ladder', ability: 'endurance', name: 'Session length',
      how: 'Several sprints in one session, each followed by a silent break to rest your voice.',
      basis: 'Silent rest reduced vocal effort after long speaking in small studies (Solomon et al. 2003).',
      params: [{ key: 'sprints', label: 'Sprints', options: [2, 3, 4, 6].map((n) => ({ value: n, label: n + ' sprints' })), default: 2 }] },
  ];

  const STAGES = ['learning', 'practising', 'independent'];
  const COMPLETE_SHARE = 0.8;  // of the planned time, for a sprint to count as completed

  function exercise(id) { return EXERCISES.find((x) => x.id === id) || null; }
  function defaults(ex) { const o = {}; for (const p of ex.params) o[p.key] = p.default; return o; }
  function cleanParams(ex, params) {
    const out = defaults(ex);
    for (const p of ex.params) {
      const v = params && params[p.key];
      if (p.options.some((o) => (typeof o === 'object' ? o.value : o) === v)) out[p.key] = v;
    }
    return out;
  }

  /**
   * Attempts rebuilt from `ex` events. Duplicates are already removed by id; a second `end`,
   * rating or evidence for the same attempt is ignored (the first stands).
   */
  function deriveAttempts(events) {
    const map = new Map();
    for (const e of events) {
      if (e.type === 'ex' && e.op === 'start' && !map.has(e.attempt)) {
        map.set(e.attempt, { id: e.attempt, exercise: e.exercise, ability: e.ability, params: e.params || {}, start: e.t, setup: e.setup || null,
          sprints: e.sprint ? [e.sprint] : [], sprintsPlanned: e.sprintsPlanned || 1, end: null, status: null, felt: null, evidence: {}, paraDelta: null, stage: e.stage || null });
      }
    }
    for (const e of events) {
      const a = map.get(e.attempt);
      if (!a) continue;
      if (e.type === 'ex' && e.op === 'sprint' && e.sprint && !a.sprints.includes(e.sprint)) a.sprints.push(e.sprint);
      else if (e.type === 'ex' && e.op === 'end' && a.end == null) { a.end = e.t; a.status = e.status; if (typeof e.paraDelta === 'number') a.paraDelta = e.paraDelta; }
      else if (e.type === 'ex.rating' && !a.felt && ['easy', 'right', 'hard'].includes(e.felt)) a.felt = e.felt;
      else if (e.type === 'ex.evidence' && e.key && !(e.key in a.evidence)) a.evidence[e.key] = e.value;
    }
    return [...map.values()].sort((x, y) => x.start - y.start);
  }

  /**
   * How an attempt ended, from its sprints. `sprints`: derived sprints with stats, keyed by id.
   * Missing ratings never change the status.
   */
  function attemptStatus(attempt, sprintById) {
    const ss = attempt.sprints.map((id) => sprintById.get(id)).filter(Boolean);
    if (!ss.length) return 'interrupted';
    const last = ss[ss.length - 1].sprint;
    if (last.discarded || last.endReason === 'discard' || last.endReason === 'disabled') return 'abandoned';
    const done = ss.filter(({ sprint, stats }) => !sprint.open && !sprint.discarded && stats.runningSec >= sprint.plannedMin * 60 * COMPLETE_SHARE).length;
    if (done >= attempt.sprintsPlanned) return 'completed';
    if (last.endReason === 'interrupted') return 'interrupted';
    return 'ended early';
  }

  /** What an open attempt should do now: keep going, or end with a status. */
  function attemptNext(attempt, sprintById) {
    const ss = attempt.sprints.map((id) => sprintById.get(id)).filter(Boolean);
    if (ss.some(({ sprint }) => sprint.open)) return { op: 'continue' };
    const status = attemptStatus(attempt, sprintById);
    if (status === 'completed' || status === 'abandoned' || status === 'interrupted') return { op: 'end', status };
    const last = ss[ss.length - 1];
    if (attempt.sprintsPlanned > 1 && last && !last.sprint.discarded) {
      const done = ss.filter(({ sprint, stats }) => !sprint.open && stats.runningSec >= sprint.plannedMin * 60 * COMPLETE_SHARE).length;
      if (done === ss.length) return { op: 'continue', between: true, done };   // a session ladder between sprints
    }
    return { op: 'end', status };
  }

  /** Session characteristics for one attempt: training measures, kept apart from productivity figures. */
  function attemptCharacteristics(attempt, sprintById, events) {
    const ss = attempt.sprints.map((id) => sprintById.get(id)).filter(Boolean);
    const sum = (f) => ss.reduce((s, x) => s + (f(x) || 0), 0);
    const runningSec = sum((x) => x.stats.runningSec), activeSec = sum((x) => x.stats.activeSec);
    const composed = sum((x) => x.stats.composed);
    let recordings = 0, during = 0, after = 0;
    for (const { sprint } of ss) {
      recordings += events.filter((e) => e.type === 'rec' && e.op === 'start' && sprint.intervals.some(([a, b]) => e.t >= a && e.t <= b)).length;
      const r = draftingRevision(sprint, events);
      during += r.during; after += r.after;
    }
    return {
      runningMin: Math.round(runningSec / 6) / 10, activeMin: Math.round(activeSec / 6) / 10, speakingMin: Math.round(sum((x) => x.stats.speakingSec) / 6) / 10,
      composed, composedPerActiveMin: activeSec >= 60 ? Math.round((composed / (activeSec / 60)) * 10) / 10 : null,
      recordings, revisedDuring: during, revisedAfter: after, paragraphsAdded: attempt.paraDelta,
    };
  }

  /**
   * Comparable attempts: same exercise, same options, same transcription setup. Reports the
   * earlier and recent halves side by side once there are at least three in each. Differences only.
   */
  function comparable(rows) {
    if (rows.length < 6) return null;
    const half = Math.floor(rows.length / 2);
    const med = (list, f) => { const xs = list.map(f).filter((x) => typeof x === 'number'); return xs.length ? Math.round(M.quantile(xs, 0.5) * 10) / 10 : null; };
    const pick = (list) => ({ n: list.length, composedPerActiveMin: med(list, (r) => r.c.composedPerActiveMin), activeMin: med(list, (r) => r.c.activeMin), revisedDuring: med(list, (r) => r.c.revisedDuring) });
    return { earlier: pick(rows.slice(0, half)), recent: pick(rows.slice(half)) };
  }
  function comparisonKey(a) { return a.exercise + '|' + JSON.stringify(a.params) + '|' + (a.setup || ''); }

  /**
   * The training profile: the structure future personalisation will read (design §16.5, §16.5a).
   * Factual counts only. No scores, no automatic stage changes.
   */
  function trainingProfile(events) {
    const attempts = deriveAttempts(events).filter((a) => a.end != null);
    const stages = {};
    for (const e of events) if (e.type === 'stage' && STAGES.includes(e.stage) && ABILITIES.some((b) => b.id === e.ability)) stages[e.ability] = { stage: e.stage, since: e.t };
    const out = {};
    for (const ab of ABILITIES) {
      const mine = attempts.filter((a) => a.ability === ab.id);
      const felt = { easy: 0, right: 0, hard: 0, unrated: 0 };
      for (const a of mine) felt[a.felt || 'unrated']++;
      const days = new Set(mine.map((a) => M.dayKey(a.start, 4)));
      out[ab.id] = {
        stage: (stages[ab.id] && stages[ab.id].stage) || 'learning', stageSince: stages[ab.id] ? stages[ab.id].since : null,
        attempted: mine.length, completed: mine.filter((a) => a.status === 'completed').length,
        endedEarly: mine.filter((a) => a.status === 'ended early').length, felt, daysPractised: days.size,
        lastPractised: mine.length ? mine[mine.length - 1].start : null,
        exercises: Object.fromEntries(EXERCISES.filter((x) => x.ability === ab.id).map((x) => [x.id, mine.filter((a) => a.exercise === x.id).length])),
      };
    }
    return out;
  }

  // Fields an exercise event may carry. Anything else (text above all) is dropped before it is stored.
  const SAFE_FIELDS = new Set(['id', 't', 'dev', 'type', 'op', 'attempt', 'exercise', 'ability', 'params', 'sprint', 'sprintsPlanned', 'setup', 'space',
    'stage', 'status', 'paraDelta', 'paraStart', 'felt', 'key', 'value', 'by']);
  function safeEvent(e) {
    const out = {};
    for (const [k, v] of Object.entries(e)) {
      if (!SAFE_FIELDS.has(k)) continue;
      if (k === 'value' && typeof v === 'string' && v.length > 12) continue;   // evidence answers are short choices, never prose
      out[k] = v;
    }
    return out;
  }

  return {
    KEY_VERSION, MIN_SAMPLE, TREND_WINDOW, setupKey, passageSignals, exclusion, summarize, trend, draftingRevision,
    ABILITIES, EXERCISES, STAGES, COMPLETE_SHARE, exercise, defaults, cleanParams, deriveAttempts, attemptStatus, attemptNext,
    attemptCharacteristics, comparable, comparisonKey, trainingProfile, safeEvent,
  };
});
