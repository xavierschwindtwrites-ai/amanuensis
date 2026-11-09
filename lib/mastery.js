/*
 * Writing Mastery engine. Pure functions over the ledger: no DOM, no disk, no network.
 * Loaded by the main process (require), the window (window.AmanuensisMastery) and the tests.
 *
 * It observes the manuscript and never changes it. Nothing here imports lib/format.js.
 * Design: docs/writing-mastery-system.md (§7–§9).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AmanuensisMastery = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    enabled: false, sprintMin: 30, breakMin: 10, dayStartHour: 4, goalWords: 0,
    writingDays: [1, 2, 3, 4, 5], windowStart: '09:00', windowMin: 120, restDates: [],
  });
  const ACTIVE_GAP_SEC = 120;        // thinking time bridged inside active composition
  const CALIBRATION = 10;            // qualifying sprints before figures stop being provisional
  const PROVISIONAL_FROM = 3;
  const QUALIFY_MIN_SEC = 10 * 60;
  const MILESTONES = [500, 1000, 2000, 3000, 5000, 7500, 10000];

  /* ---------------- ledger ---------------- */

  /** Many device files -> one list of events, deduplicated by id, sorted by time. Bad lines are skipped. */
  function parseLedger(texts) {
    const byId = new Map();
    let skipped = 0;
    for (const text of [].concat(texts || [])) {
      for (const line of String(text || '').split('\n')) {
        if (!line.trim()) continue;
        let e;
        try { e = JSON.parse(line); } catch { skipped++; continue; }
        if (!e || typeof e !== 'object' || !e.id || typeof e.t !== 'number' || !e.type) { skipped++; continue; }
        if (!byId.has(e.id)) byId.set(e.id, e);
      }
    }
    const events = [...byId.values()].sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
    return { events, skipped };
  }

  /* ---------------- profile ---------------- */

  /** [{device, fields: {key: {v, t}}}] -> effective profile. Newest stamp wins per field; ties go to the higher device id. */
  function mergeProfiles(files) {
    const best = {};
    for (const f of files || []) {
      for (const [k, cell] of Object.entries((f && f.fields) || {})) {
        if (!cell || typeof cell.t !== 'number' || !(k in DEFAULTS)) continue;
        const cur = best[k];
        if (!cur || cell.t > cur.t || (cell.t === cur.t && String(f.device) > String(cur.device))) best[k] = { v: cell.v, t: cell.t, device: f.device };
      }
    }
    const out = { ...DEFAULTS };
    for (const k of Object.keys(best)) out[k] = best[k].v;
    return sanitizeProfile(out);
  }

  function sanitizeProfile(p) {
    const n = (x, lo, hi, d) => (typeof x === 'number' && isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
    return {
      enabled: !!p.enabled,
      sprintMin: n(p.sprintMin, 0.05, 90, 30),
      breakMin: n(p.breakMin, 0, 60, 10),
      dayStartHour: Math.round(n(p.dayStartHour, 0, 12, 4)),
      goalWords: Math.round(n(p.goalWords, 0, 100000, 0)),
      writingDays: Array.isArray(p.writingDays) ? p.writingDays.filter((d) => d >= 0 && d <= 6) : [...DEFAULTS.writingDays],
      windowStart: /^\d{2}:\d{2}$/.test(p.windowStart) ? p.windowStart : '09:00',
      windowMin: Math.round(n(p.windowMin, 0, 24 * 60, 120)),
      restDates: Array.isArray(p.restDates) ? p.restDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [],
    };
  }

  /** This device's stamped fields with `patch` applied at time t. */
  function patchFields(fields, patch, t) {
    const out = { ...(fields || {}) };
    for (const [k, v] of Object.entries(patch || {})) if (k in DEFAULTS) out[k] = { v, t };
    return out;
  }

  /* ---------------- time ---------------- */

  /** 'take-2026-11-04-21-37-09' (UTC, from toISOString) -> ms. */
  function parseSessionTime(session) {
    const m = String(session || '').match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }

  /** The writing day an instant belongs to, local time, rolling over at dayStartHour. */
  function dayKey(t, dayStartHour = 4) {
    const d = new Date(t - dayStartHour * 3600000);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function weekday(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getDay(); }
  function isRestDay(profile, key) {
    return (profile.restDates || []).includes(key) || !(profile.writingDays || []).includes(weekday(key));
  }

  /** When a passage was spoken (live) or imported (import). */
  function eventTime(e) {
    if (e.type === 'dict' && e.src === 'live' && typeof e.spokenAt === 'number') return e.spokenAt;
    if (e.type === 'typing' && typeof e.to === 'number') return e.to;
    return e.t;
  }

  /* ---------------- sprints ---------------- */

  /**
   * Rebuild sprints from their lifecycle events.
   * opts.liveId: the sprint the window is running now (its open interval runs to opts.now).
   */
  function deriveSprints(events, opts = {}) {
    const map = new Map();
    for (const e of events) {
      if (e.type !== 'sprint' || !e.sprint) continue;
      if (!map.has(e.sprint)) map.set(e.sprint, []);
      map.get(e.sprint).push(e);
    }
    const out = [];
    for (const [id, evs] of map) {
      evs.sort((a, b) => a.t - b.t);
      const start = evs.find((e) => e.op === 'start');
      if (!start) continue;
      const s = { id, start: start.t, plannedMin: start.plannedMin || 30, intervals: [], pauses: [], end: null, endReason: null, discarded: false, open: false, lastEvent: start.t, ticks: 0 };
      let runFrom = start.t, pausedAt = null;
      for (const e of evs) {
        s.lastEvent = Math.max(s.lastEvent, e.t);
        if (e.op === 'pause' && runFrom != null) { s.intervals.push([runFrom, e.t]); runFrom = null; pausedAt = { t: e.t, reason: e.reason || 'author' }; }
        else if (e.op === 'resume' && runFrom == null) { if (pausedAt) s.pauses.push([pausedAt.t, e.t, pausedAt.reason]); runFrom = e.t; pausedAt = null; }
        else if (e.op === 'end') { if (runFrom != null) s.intervals.push([runFrom, e.t]); runFrom = null; s.end = e.t; s.endReason = e.reason || 'author'; break; }
        else if (e.op === 'discard') s.discarded = true;
        else if (e.op === 'tick') s.ticks++;
      }
      if (evs.some((e) => e.op === 'discard')) s.discarded = true;
      if (s.end == null) {
        s.open = true;
        s.paused = runFrom == null;
        s.pausedReason = pausedAt ? pausedAt.reason : null;
        if (runFrom != null) s.intervals.push([runFrom, id === opts.liveId && opts.now ? opts.now : s.lastEvent]);
      }
      out.push(s);
    }
    return out.sort((a, b) => a.start - b.start);
  }

  /** Last moment of real activity at or after `since` (typing, speech, recording, sprint ticks). */
  function lastActivity(events, since, until = Infinity) {
    let last = since;
    for (const e of events) {
      if (e.t < since || e.t > until) continue;
      if (e.type === 'typing') last = Math.max(last, e.to || e.t);
      else if (e.type === 'dict' && e.src === 'live') last = Math.max(last, (e.spokenAt || e.t) + (e.speechSec || 0) * 1000);
      else if (e.type === 'rec' || (e.type === 'sprint' && e.op !== 'end')) last = Math.max(last, e.t);
    }
    return last;
  }

  /** What to do with a sprint left open by a quit or crash: pause it (same day) or close it (earlier day). */
  function recoverOpenSprint(sprint, events, now, dayStartHour = 4) {
    if (!sprint || !sprint.open) return null;
    const at = lastActivity(events, sprint.start);
    if (dayKey(at, dayStartHour) !== dayKey(now, dayStartHour)) return { op: 'end', at, reason: 'interrupted' };
    if (sprint.paused) return null;
    return { op: 'pause', at, reason: 'restart' };
  }

  /* ---------------- measures ---------------- */

  const within = (t, ranges, slackMs = 0) => ranges.some(([a, b]) => t >= a - slackMs && t <= b + slackMs);
  const SLACK_MS = 1500; // session ids are stamped to the second

  /** The instant that places an event in a sprint: the middle of the speech for a live passage. */
  function placeTime(e) {
    if (e.type === 'dict' && e.src === 'live' && typeof e.spokenAt === 'number') return e.spokenAt + (e.speechSec || 0) * 500;
    return eventTime(e);
  }

  /**
   * Give each passage and typing batch to exactly one sprint, so back-to-back sprints never
   * share words: the sprint whose running time contains it, else the nearest within the slack.
   */
  function ownership(sprints, events) {
    const owner = new Map();
    for (const e of events) {
      if (e.type !== 'dict' && e.type !== 'typing') continue;
      const t = e.type === 'dict' && e.src === 'import' ? e.t : placeTime(e);
      let best = null, bestDist = Infinity;
      for (const s of sprints) {
        for (const [a, b] of s.intervals) {
          const d = t < a ? a - t : t > b ? t - b : 0;
          if (d < bestDist) { bestDist = d; best = s.id; }
        }
      }
      if (best && bestDist <= SLACK_MS) owner.set(e.id, best);
    }
    return owner;
  }

  function mergeIntervals(list, gapMs) {
    const xs = list.filter(([a, b]) => b >= a).sort((x, y) => x[0] - y[0]);
    const out = [];
    for (const [a, b] of xs) {
      const last = out[out.length - 1];
      if (last && a - last[1] <= gapMs) last[1] = Math.max(last[1], b);
      else out.push([a, b]);
    }
    return out;
  }
  function clip(intervals, ranges) {
    let total = 0;
    for (const [a, b] of intervals) for (const [c, d] of ranges) total += Math.max(0, Math.min(b, d) - Math.max(a, c));
    return total;
  }

  /**
   * Growth over a period, two ways.
   *  raw:      what the manuscript actually did between the period's first and last word-count snapshot.
   *  composed: what the author composed in the period. Starts from raw, then
   *            - removes what landed inside the window but wasn't composed then: passages spoken in
   *              another period (late arrivals, retries), imported recordings, pastes and cuts,
   *              version switches, restores and chapter deletions;
   *            - adds passages composed in the period that landed after its last snapshot.
   * `owns(e)` says whether a live passage was spoken in this period.
   */
  function growth(counts, events, owns) {
    const win = new Map();
    for (const c of counts) {
      const w = win.get(c.book);
      if (!w) win.set(c.book, { t0: c.t, first: c.total, t1: c.t, last: c.total });
      else { w.t1 = c.t; w.last = c.total; }
    }
    let raw = 0;
    for (const w of win.values()) raw += w.last - w.first;
    let adj = 0;
    for (const e of events) {
      const w = win.get(e.book);
      const inside = !!w && e.t > w.t0 && e.t <= w.t1;
      if (e.type === 'dict' && e.src === 'live') {
        const mine = owns(e);
        if (inside && !mine) adj -= e.words || 0;
        else if (!inside && mine) adj += e.words || 0;
      } else if (!inside) continue;
      else if (e.type === 'dict' && e.src === 'import') adj -= e.words || 0;
      else if (e.type === 'typing' && e.paste) adj -= (e.added || 0) - (e.removed || 0);
      else if (e.type === 'revise' || e.type === 'structure') adj -= e.delta || 0;
    }
    return { raw, composed: raw + adj };
  }

  function netFromCounts(counts) {
    const byBook = new Map();
    for (const c of counts) {
      if (!byBook.has(c.book)) byBook.set(c.book, { first: c.total, last: c.total });
      else byBook.get(c.book).last = c.total;
    }
    let net = 0;
    for (const v of byBook.values()) net += v.last - v.first;
    return net;
  }

  /** Every measure in §7.3 for one sprint. Pass `owner` (from ownership()) when measuring several sprints. */
  function sprintStats(sprint, events, owner) {
    const mine = (e) => (owner ? owner.get(e.id) === sprint.id : within(e.type === 'dict' && e.src === 'import' ? e.t : placeTime(e), sprint.intervals, SLACK_MS));
    const ranges = sprint.intervals;
    const st = { wallSec: 0, runningSec: 0, speakingSec: 0, activeSec: 0, gross: 0, liveWords: 0, rawWords: 0, typedWords: 0, pasted: 0, imported: 0, removed: 0, net: 0, composed: 0, wpm: 0, mode: 'typing' };
    const endT = sprint.end != null ? sprint.end : ranges.length ? ranges[ranges.length - 1][1] : sprint.start;
    st.wallSec = Math.max(0, (endT - sprint.start) / 1000);
    st.runningSec = ranges.reduce((s, [a, b]) => s + (b - a), 0) / 1000;
    const activity = [];
    const counts = [];
    for (const e of events) {
      if (e.type === 'count' && e.sprint === sprint.id) counts.push(e);
      else if (e.type === 'dict' && e.src === 'live' && mine(e)) {
        st.liveWords += e.words || 0; st.rawWords += e.raw || 0; st.speakingSec += e.speechSec || 0;
        activity.push([e.spokenAt, e.spokenAt + (e.speechSec || 0) * 1000]);
      } else if (e.type === 'dict' && e.src === 'import' && mine(e)) st.imported += e.words || 0;
      else if (e.type === 'typing' && mine(e)) {
        if (e.paste) st.pasted += e.added || 0; else st.typedWords += e.added || 0;
        st.removed += e.removed || 0;
        activity.push([e.from || e.t, e.to || e.t]);
      } else if ((e.type === 'revise' || e.type === 'structure') && within(e.t, ranges, 1000) && e.delta < 0) st.removed += -e.delta;
    }
    st.gross = st.liveWords + st.typedWords;
    const g = growth(counts, events, (e) => mine(e));
    st.net = g.raw;
    st.composed = g.composed;
    st.activeSec = clip(mergeIntervals(activity, ACTIVE_GAP_SEC * 1000), ranges) / 1000;
    st.mode = st.liveWords >= st.typedWords && st.liveWords > 0 ? 'dictation' : 'typing';
    st.wpm = st.activeSec >= 30 ? st.gross / (st.activeSec / 60) : 0;
    return st;
  }

  /** Measures for one writing day (all writing, inside sprints or not). */
  function dayStats(events, key, dayStartHour = 4) {
    const st = { net: 0, composed: 0, gross: 0, liveWords: 0, typedWords: 0, imported: 0, removed: 0, speakingSec: 0, sprints: 0 };
    const counts = [];
    let legacy = 0;
    for (const e of events) {
      if (dayKey(eventTime(e), dayStartHour) !== key) continue;
      if (e.type === 'count') counts.push(e);
      else if (e.type === 'dict' && e.src === 'live') { st.liveWords += e.words || 0; st.speakingSec += e.speechSec || 0; }
      else if (e.type === 'dict' && e.src === 'import') st.imported += e.words || 0;
      else if (e.type === 'typing') { if (!e.paste) st.typedWords += e.added || 0; st.removed += e.removed || 0; }
      else if ((e.type === 'revise' || e.type === 'structure') && e.delta < 0) st.removed += -e.delta;
      else if (e.type === 'sprint' && e.op === 'end') st.sprints++;
      else if (e.type === 'legacy') legacy += e.added || 0;
    }
    st.gross = st.liveWords + st.typedWords;
    // Counts are placed by when they were taken; passages by when they were spoken.
    const dayCounts = events.filter((e) => e.type === 'count' && dayKey(e.t, dayStartHour) === key);
    const g = growth(dayCounts, events, (e) => dayKey(eventTime(e), dayStartHour) === key);
    st.net = g.raw + legacy;
    st.composed = g.composed + legacy;
    return st;
  }

  /* ---------------- baseline & estimates ---------------- */

  function quantile(xs, q) {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }

  function qualifies(sprint, st) {
    return !sprint.discarded && !sprint.open && st.runningSec >= QUALIFY_MIN_SEC && st.imported <= st.gross;
  }

  /** Baseline from completed sprints. `withStats`: [{sprint, stats}]. */
  function baseline(withStats, plannedMin) {
    const q = withStats.filter(({ sprint, stats }) => qualifies(sprint, stats));
    const comparable = q.filter(({ sprint }) => !plannedMin || Math.abs(sprint.plannedMin - plannedMin) <= plannedMin * 0.25).slice(-10);
    const pool = comparable.length >= PROVISIONAL_FROM ? comparable : q.slice(-10);
    const speeds = (mode) => pool.filter(({ stats }) => stats.mode === mode && stats.wpm > 0).map(({ stats }) => stats.wpm);
    // Productivity figures use composed growth: imports, pastes and revision can't inflate them.
    const nets = pool.map(({ stats }) => (typeof stats.composed === 'number' ? stats.composed : stats.net));
    return {
      qualifying: q.length,
      calibrated: q.length >= CALIBRATION,
      provisional: q.length >= PROVISIONAL_FROM && q.length < CALIBRATION,
      sample: pool.length,
      medianNet: Math.round(quantile(nets, 0.5)),
      p25Net: Math.round(quantile(nets, 0.25)),
      p75Net: Math.round(quantile(nets, 0.75)),
      speed: { dictation: Math.round(quantile(speeds('dictation'), 0.5)), typing: Math.round(quantile(speeds('typing'), 0.5)) },
      medianActiveMin: Math.round(quantile(pool.map(({ stats }) => stats.activeSec / 60), 0.5)),
    };
  }

  /** How many sprints a target needs, from the author's own yield. Never changes anything. */
  function estimate(target, base, profile, doneToday = 0) {
    if (!target || !base || base.qualifying < PROVISIONAL_FROM || base.medianNet <= 0) return null;
    const remaining = Math.max(0, target - doneToday);
    if (!remaining) return { remaining: 0, sprints: 0, low: 0, high: 0, minutes: 0, fits: true };
    const n = (y) => (y > 0 ? Math.ceil(remaining / y) : Infinity);
    const sprints = n(base.medianNet), low = n(base.p75Net), high = n(base.p25Net);
    const minutes = sprints * profile.sprintMin + Math.max(0, sprints - 1) * profile.breakMin;
    return { remaining, sprints, low, high, minutes: Math.round(minutes), fits: !profile.windowMin || minutes <= profile.windowMin, provisional: !base.calibrated };
  }

  /* ---------------- legacy import ---------------- */

  function legacyEvents(bookId, sessions) {
    return (sessions || []).filter((s) => s && typeof s.start === 'number').map((s) => ({
      id: 'legacy:' + bookId + ':' + s.start, t: s.end || s.start, type: 'legacy', book: bookId, start: s.start, end: s.end || s.start, added: s.added || 0,
    }));
  }

  return {
    DEFAULTS, MILESTONES, CALIBRATION, PROVISIONAL_FROM, ACTIVE_GAP_SEC,
    parseLedger, mergeProfiles, sanitizeProfile, patchFields, parseSessionTime, dayKey, weekday, isRestDay, eventTime,
    deriveSprints, lastActivity, recoverOpenSprint, ownership, growth, sprintStats, dayStats, quantile, baseline, estimate, legacyEvents,
  };
});
