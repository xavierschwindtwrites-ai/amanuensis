/*
 * Writing Mastery, window side. Observes the manuscript through hooks called by app.js and
 * never changes it. Every hook returns immediately when Writing Mastery is off.
 * Design: docs/writing-mastery-system.md. Pure rules live in lib/mastery.js.
 */
'use strict';
(function () {
  const M = window.AmanuensisMastery;
  const AP = window.AmanuensisApprentice;
  const MD = window.amanuensis;
  const A = () => window.__amanuensis;
  const AWAY_MS = 15 * 60000;           // no activity -> sprint pauses itself (backdated)
  const OVERTIME_IDLE_MS = 5 * 60000;   // overtime + this idle -> sprint finishes at last activity
  const SETTLE_MS = 60000;              // wait this long for in-flight transcription before the closing count
  const TYPING_FLUSH_MS = 30000, TYPING_PAUSE_MS = 4000;

  const MS = {
    loaded: false, device: null, profile: { ...M.DEFAULTS }, events: [], ids: new Set(), queue: [],
    live: null,        // { id, plannedMin, state: 'running'|'paused', reason, runMs, runFrom }
    brk: null,         // { until }
    typing: null,      // { book, added, removed, from, to }
    dayCounted: new Set(), lastActivity: 0, recording: false, closing: null, goalSaid: new Set(), todayShown: false,
  };
  const on = () => MS.loaded && MS.profile.enabled;
  const book = () => A().S.book;
  const bookTotal = () => (book() ? book().chapters.reduce((s, c) => s + (c.words || 0), 0) : 0);
  const today = () => M.dayKey(Date.now(), MS.profile.dayStartHour);
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  /* ---------------- ledger ---------------- */

  function emit(e) {
    if (!on()) return null;
    e.id = e.id || uid(e.type[0]);
    if (MS.ids.has(e.id)) return null;           // passages, legacy sessions: once each
    e.t = e.t || Date.now();
    e.dev = MS.device;
    if (MS.live && !e.sprint && (e.type === 'count' || e.type === 'typing' || e.type === 'revise')) e.sprint = MS.live.id;
    MS.ids.add(e.id);
    MS.events.push(e);
    MS.queue.push(e);
    persistSoon();
    return e;
  }
  let persistTimer;
  function persistSoon() { clearTimeout(persistTimer); persistTimer = setTimeout(persist, 1500); }
  async function persist() {
    clearTimeout(persistTimer);
    if (!MS.queue.length) return;
    const batch = MS.queue.splice(0);
    try { await MD.masteryAppend(batch); } catch (e) { MS.queue.unshift(...batch); }
  }
  function count(sprintId) {
    if (!book()) return;
    emit({ type: 'count', book: book().id, total: bookTotal(), ...(sprintId ? { sprint: sprintId } : {}) });
  }
  const sorted = () => MS.events.slice().sort((a, b) => a.t - b.t);

  /* ---------------- load / enable ---------------- */

  async function load() {
    const r = await MD.masteryRead();
    try { providersCache = (await MD.settings()).providers; } catch {}
    MS.device = r.device;
    MS.profile = M.mergeProfiles(r.profiles);
    const { events } = M.parseLedger(r.ledgers);
    MS.events = events;
    MS.ids = new Set(events.map((e) => e.id));
    MS.loaded = true;
    if (on()) await afterEnable(false);
    if (on() && book()) { MS.todayShown = false; showToday(); }   // a book may already be open
    render();
  }

  async function afterEnable(fresh) {
    for (const e of MS.events) if (e.type === 'count') MS.dayCounted.add(e.book + '|' + M.dayKey(e.t, MS.profile.dayStartHour));
    // Phase 1 sessions, once (stable ids make this safe on every Mac).
    try { for (const e of await MD.masteryLegacy()) emit({ ...e }); } catch {}
    recover();
    if (fresh && book()) count();
    showToday();
    tick();
  }

  /** A sprint left open by a quit or crash. */
  function recover() {
    for (const s of M.deriveSprints(sorted())) {
      if (!s.open || (MS.live && MS.live.id === s.id)) continue;
      const r = M.recoverOpenSprint(s, sorted(), Date.now(), MS.profile.dayStartHour);
      if (r && r.op === 'end') emit({ type: 'sprint', sprint: s.id, op: 'end', reason: r.reason, t: r.at, plannedMin: s.plannedMin });
      else {
        if (r && r.op === 'pause') emit({ type: 'sprint', sprint: s.id, op: 'pause', reason: r.reason, t: r.at, plannedMin: s.plannedMin });
        const runMs = s.intervals.reduce((a, [x, y]) => a + (y - x), 0);
        MS.live = { id: s.id, plannedMin: s.plannedMin, state: 'paused', reason: 'restart', runMs, runFrom: null };
      }
    }
  }

  async function setProfile(patch) {
    const wasOn = on();
    if (patch.enabled === false && MS.live) await finish('disabled');
    await MD.masterySetProfile(patch);
    const r = await MD.masteryRead();
    MS.profile = M.mergeProfiles(r.profiles);
    if (!wasOn && on()) await afterEnable(true);
    if (!on()) { MS.live = null; MS.brk = null; MS.typing = null; MS.label = null; hideToday(); notify('reset'); }
    render();
  }

  /* ---------------- hooks from app.js ---------------- */

  function activity(kind) {
    if (!on() || !book()) return;
    const now = Date.now();
    MS.lastActivity = now;
    const key = book().id + '|' + today();
    if (!MS.dayCounted.has(key)) { MS.dayCounted.add(key); count(); }   // the day's baseline, before the change
    if (MS.live && MS.live.state === 'paused' && (MS.live.reason === 'away' || kind === 'record')) resume();
    hideToday();
  }

  function typed(delta, paste) {
    if (!on() || !book() || !delta) return;
    const now = Date.now();
    if (paste) {
      flushTyping();
      emit({ type: 'typing', book: book().id, added: Math.max(0, delta), removed: Math.max(0, -delta), from: now, to: now, paste: true });
      return;
    }
    if (MS.typing && MS.typing.book !== book().id) flushTyping();
    const b = MS.typing || (MS.typing = { book: book().id, added: 0, removed: 0, from: now, to: now });
    if (delta > 0) b.added += delta; else b.removed -= delta;
    b.to = now;
    MS.lastActivity = now;
    clearTimeout(typed.pause); typed.pause = setTimeout(flushTyping, TYPING_PAUSE_MS);
    if (now - b.from > TYPING_FLUSH_MS) flushTyping();
  }
  function flushTyping() {
    clearTimeout(typed.pause);
    const b = MS.typing; MS.typing = null;
    if (b && (b.added || b.removed)) emit({ type: 'typing', ...b });
  }

  /** The transcription setup in effect now (Apprenticeship §16.4). */
  let providersCache = null;
  function currentSetup() {
    const st = A().S.settings || {};
    if (st.providers) providersCache = st.providers;
    return AP.setupKey(st, st.providers || providersCache).key;
  }
  /** The setup a recording was made with: from its rec:start event, else the current one. */
  function setupForSession(session) {
    for (let i = MS.events.length - 1; i >= 0; i--) {
      const e = MS.events[i];
      if (e.type === 'rec' && e.op === 'start' && e.session === session && e.setup) return e.setup;
    }
    return currentSetup();
  }

  /** A passage reached the page for the first time. Retries, switches and re-emits can't add it twice. */
  function dictationApplied(rec, opts = {}) {
    if (!on() || !book() || !rec || !rec.id) return;
    const W = window.AmanuensisFormat;
    const imported = /^import-/.test(rec.session || '');
    const start = M.parseSessionTime(rec.session);
    const spokenAt = !imported && start != null ? start + (rec.startSec || 0) * 1000 : null;
    const speechSec = Math.max(0, (rec.endSec || 0) - (rec.startSec || 0));
    emit({
      id: 'dict:' + book().id + ':' + rec.id, type: 'dict', book: book().id, seg: rec.id, src: imported ? 'import' : 'live',
      session: rec.session || null, spokenAt, speechSec: Math.round(speechSec * 10) / 10,
      raw: W.words(rec.raw || '').length, words: W.countWords(rec.appliedText || ''),
      // Apprenticeship signals: counts only (never text), from the raw transcript, tagged with the setup.
      ...signalFields(rec, imported, opts),
    });
    if (spokenAt) MS.lastActivity = Math.max(MS.lastActivity, spokenAt + speechSec * 1000);
  }
  function signalFields(rec, imported, opts) {
    const sig = AP.passageSignals(rec.raw || '', rec.notes);
    return {
      setup: imported ? currentSetup() : setupForSession(rec.session),
      fillers: sig.fillers, doubled: sig.doubled, falseStarts: sig.falseStarts,
      artifact: sig.artifact, retried: !!opts.retried, space: 'manuscript',
    };
  }
  function revised(rec, kind, delta) { if (on() && book() && delta) emit({ type: 'revise', book: book().id, seg: rec && rec.id, kind, delta }); }
  function structure(kind, delta) { if (on() && book()) emit({ type: 'structure', book: book().id, kind, delta: delta || 0 }); }
  function recording(op, session) {
    if (!on()) return;
    MS.recording = op === 'start';
    MS.lastActivity = Date.now();
    emit({ type: 'rec', op, session: session || null, ...(op === 'start' ? { setup: currentSetup() } : {}) });
  }
  function recordingSettled() { if (MS.closing) completeClosing(); }

  function bookLeaving() { if (!on()) return; flushTyping(); count(); }
  function bookOpened() { if (!on()) return; if (MS.live) count(MS.live.id); MS.todayShown = false; showToday(); }

  /** Called by Phase 1's end-of-session line; returns a suffix (or ''). */
  function sessionEnded() {
    if (!on() || !book()) return '';
    flushTyping(); count();
    const key = today();
    if (!MS.profile.goalWords || M.isRestDay(MS.profile, key) || MS.goalSaid.has(key)) return '';
    const d = M.dayStats(sorted(), key, MS.profile.dayStartHour);
    if (d.net >= MS.profile.goalWords) { MS.goalSaid.add(key); return ' · today’s goal reached'; }
    return '';
  }

  async function flush() { if (!on()) return; flushTyping(); count(MS.live && MS.live.state === 'running' ? MS.live.id : undefined); await persist(); }

  /* ---------------- sprint lifecycle (design §8.2) ---------------- */

  // Listeners for the training layer (renderer/apprentice.js). They observe; they never change the manuscript.
  const listeners = { sprintStart: [], sprintComplete: [], reset: [] };
  const notify = (name, payload) => { for (const fn of listeners[name]) { try { fn(payload); } catch (e) { console.error(e); } } };

  function start(opts = {}) {
    if (!on() || !book() || MS.live) return null;
    const id = uid('sp');
    const plannedMin = opts.plannedMin || MS.profile.sprintMin;
    MS.brk = null;
    MS.live = { id, plannedMin, state: 'running', reason: null, runMs: 0, runFrom: Date.now() };
    MS.lastActivity = Date.now();
    lastTickEmit = Date.now();
    emit({ type: 'sprint', sprint: id, op: 'start', plannedMin, setup: currentSetup(), ...(opts.landing ? { landing: true } : {}) });
    count(id);
    notify('sprintStart', { id, plannedMin });
    render();
    return id;
  }
  function pause(reason = 'author', at = Date.now()) {
    const l = MS.live;
    if (!l || l.state !== 'running') return;
    flushTyping();
    l.runMs += Math.max(0, at - l.runFrom); l.runFrom = null; l.state = 'paused'; l.reason = reason;
    emit({ type: 'sprint', sprint: l.id, op: 'pause', reason, t: at, plannedMin: l.plannedMin });
    count(l.id);
    render();
  }
  function resume() {
    const l = MS.live;
    if (!l || l.state !== 'paused') return;
    l.state = 'running'; l.reason = null; l.runFrom = Date.now();
    MS.lastActivity = Date.now();
    emit({ type: 'sprint', sprint: l.id, op: 'resume', plannedMin: l.plannedMin });
    count(l.id);
    render();
  }
  async function finish(reason = 'author', at = Date.now()) {
    const l = MS.live;
    if (!l) return;
    flushTyping();
    emit({ type: 'sprint', sprint: l.id, op: 'end', reason, t: at, plannedMin: l.plannedMin });
    MS.live = null;
    MS.closing = { id: l.id, reason, timer: setTimeout(completeClosing, SETTLE_MS) };
    // Wait for words still being transcribed, so the closing count includes them.
    const busy = document.body.classList.contains('finishing') || document.body.classList.contains('recording');
    if (!busy || reason === 'disabled') completeClosing();
    render();
  }
  function completeClosing() {
    const c = MS.closing;
    if (!c) return;
    clearTimeout(c.timer);
    MS.closing = null;
    count(c.id);
    persist();
    notify('sprintComplete', { id: c.id, reason: c.reason });
    if (c.reason === 'disabled' || c.reason === 'discard') return;
    const evs = sorted();
    const s = M.deriveSprints(evs).find((x) => x.id === c.id);
    if (!s) return;
    const st = withStats(evs).find((x) => x.sprint.id === c.id).stats;
    const n = M.deriveSprints(evs).filter((x) => !x.discarded && !x.open && M.dayKey(x.start, MS.profile.dayStartHour) === M.dayKey(s.start, MS.profile.dayStartHour)).length;
    const words = Math.max(0, st.composed);
    const mins = Math.max(1, Math.round(st.runningSec / 60));
    let msg = `Sprint ${n} · ${fmtNum(words)} word${words === 1 ? '' : 's'} in ${mins} minute${mins === 1 ? '' : 's'}.`;
    if (st.imported) msg = msg.replace(/\.$/, '') + ` (including ${fmtNum(st.imported)} imported).`;
    if (A().S.settings.ackEnabled !== false) showAck(msg);
    if (MS.profile.breakMin > 0) MS.brk = { until: Date.now() + MS.profile.breakMin * 60000 };
    render();
  }
  async function discard() {
    const l = MS.live;
    if (!l) return;
    emit({ type: 'sprint', sprint: l.id, op: 'discard', plannedMin: l.plannedMin });
    emit({ type: 'sprint', sprint: l.id, op: 'end', reason: 'discard', plannedMin: l.plannedMin });
    MS.live = null;
    MS.closing = { id: l.id, reason: 'discard', timer: 0 };
    completeClosing();
    render();
  }
  function toggle() { if (!on()) return; if (MS.live) finish('author'); else start(); }
  function togglePause() { if (!MS.live) return; if (MS.live.state === 'running') pause('author'); else resume(); }

  function runningMs() { const l = MS.live; return l ? l.runMs + (l.state === 'running' ? Date.now() - l.runFrom : 0) : 0; }

  let lastTickEmit = 0;
  function tick() {
    clearTimeout(tick.t);
    if (!on()) return;
    const now = Date.now();
    if (MS.recording) MS.lastActivity = now;
    const l = MS.live;
    if (l && l.state === 'running') {
      if (now - lastTickEmit >= 60000) { lastTickEmit = now; emit({ type: 'sprint', sprint: l.id, op: 'tick', plannedMin: l.plannedMin }); count(l.id); }
      const idle = now - MS.lastActivity;
      const busy = MS.recording || document.body.classList.contains('finishing');
      const over = runningMs() > l.plannedMin * 60000;
      if (!busy && over && idle >= OVERTIME_IDLE_MS) finish('idle', MS.lastActivity);
      else if (!busy && idle >= AWAY_MS) pause('away', Math.max(l.runFrom, MS.lastActivity));
    }
    if (MS.brk && now >= MS.brk.until) MS.brk = null;
    render();
    tick.t = setTimeout(tick, 1000);
  }

  /* ---------------- quiet UI ---------------- */

  function render() {
    const el = $('#sprint'), btn = $('#sprint-btn');
    if (!el) return;
    btn.hidden = !on() || !!MS.live || !!MS.brk;
    $('#sprint-options').hidden = btn.hidden;
    if (!on()) { el.hidden = true; return; }
    const l = MS.live;
    const n = M.deriveSprints(MS.events).filter((x) => !x.discarded && M.dayKey(x.start, MS.profile.dayStartHour) === today()).length;
    if (l) {
      const left = l.plannedMin * 60000 - runningMs();
      el.textContent = (MS.label ? MS.label : `Sprint ${n}`) + ' · ' + (l.state === 'paused' ? 'paused' : left >= 0 ? mmss(left) : '+' + mmss(-left));
      el.classList.toggle('over', l.state === 'running' && left < 0);
      el.hidden = false;
    } else if (MS.brk) {
      el.textContent = 'Break · ' + mmss(MS.brk.until - Date.now());
      el.classList.remove('over');
      el.hidden = false;
    } else el.hidden = true;
  }

  async function sprintMenu() {
    if (window.Apprentice && window.Apprentice.sprintMenuItems) {
      const extra = window.Apprentice.sprintMenuItems();
      if (extra) MS.extraMenu = extra; else MS.extraMenu = null;
    }
    const l = MS.live;
    const items = l
      ? [l.state === 'running' ? { id: 'pause', label: 'Pause Sprint' } : { id: 'resume', label: 'Resume Sprint' }, { id: 'finish', label: 'Finish Sprint' }, { type: 'separator' }, { id: 'discard', label: 'Discard Sprint' }]
      : MS.brk ? [{ id: 'start', label: 'Start Next Sprint' }, { id: 'skip', label: 'Skip Break' }] : [{ id: 'start', label: 'Start Sprint' }];
    if (!l) items.push({ id: 'landing', label: 'Begin with two minutes' });
    if (MS.extraMenu) items.push({ type: 'separator' }, ...MS.extraMenu.items);
    const pick = await MD.menu(items);
    if (MS.extraMenu && MS.extraMenu.handle(pick)) return;
    if (pick === 'pause') pause('author');
    if (pick === 'resume') resume();
    if (pick === 'finish') finish('author');
    if (pick === 'discard') discard();
    if (pick === 'start') start();
    if (pick === 'landing') start({ plannedMin: M.LANDING_MIN, landing: true });
    if (pick === 'skip') { MS.brk = null; render(); }
  }

  function showToday() {
    const el = $('#today');
    if (!el || !on() || !book() || MS.todayShown) return;
    const p = MS.profile, key = today();
    if (!p.goalWords || M.isRestDay(p, key)) return hideToday();
    const evs = sorted();
    const done = M.dayStats(evs, key, p.dayStartHour).net;
    if (done >= p.goalWords) return hideToday();
    const base = baseNow(evs);
    const est = M.estimate(p.goalWords, base, p, done);
    el.textContent = `Today: ${fmtNum(p.goalWords - done)} ${done ? 'more ' : ''}words` + (est && est.sprints ? ` · about ${est.sprints} sprint${est.sprints === 1 ? '' : 's'}` : '');
    el.hidden = false;
    MS.todayShown = true;
  }
  function hideToday() { const el = $('#today'); if (el) el.hidden = true; }

  function withStats(evs) {
    const sprints = M.deriveSprints(evs, { liveId: MS.live && MS.live.id, now: Date.now() });
    const owner = M.ownership(sprints.filter((s) => !s.discarded), evs);
    return sprints.map((s) => ({ sprint: s, stats: M.sprintStats(s, evs, owner) }));
  }
  function baseNow(evs) { return M.baseline(withStats(evs).filter((x) => !x.sprint.open), MS.profile.sprintMin); }

  /* ---------------- Progress sheet ---------------- */

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const minutes = (sec) => (sec >= 60 ? Math.round(sec / 60) + ' min' : Math.round(sec) + ' s');

  function openProgress() {
    if (!on()) return toast('Turn on Writing Mastery in Settings first.');
    flushTyping();
    const p = MS.profile, evs = sorted(), key = today();
    const d = M.dayStats(evs, key, p.dayStartHour);
    const all = withStats(evs);
    const base = M.baseline(all.filter((x) => !x.sprint.open), p.sprintMin);
    const est = M.estimate(p.goalWords, base, p, d.net);
    // This week: the last 7 writing days ending today.
    let weekNet = 0, weekDays = 0, weekSprints = 0;
    for (let i = 0; i < 7; i++) {
      const k = M.dayKey(Date.now() - i * 86400000, p.dayStartHour);
      const s = M.dayStats(evs, k, p.dayStartHour);
      weekNet += s.net; weekSprints += s.sprints;
      if (s.net > 0 || s.gross > 0) weekDays++;
    }
    const recent = all.filter((x) => !x.sprint.open && !x.sprint.discarded).slice(-8).reverse();
    const row = (label, val) => `<tr><td>${label}</td><td>${val}</td></tr>`;
    const calib = base.calibrated ? `Based on your last ${base.sample} comparable sprints.`
      : `Calibrating · ${base.qualifying} of ${M.CALIBRATION} sprints of 10 minutes or more${base.provisional ? ' · figures are provisional' : ''}.`;
    modal(`<h2>Progress</h2>
      <h3>Today</h3>
      <table class="mtable">
        ${row('Manuscript growth (net)', fmtNum(d.net) + ' words' + (p.goalWords && !M.isRestDay(p, key) ? ` of ${fmtNum(p.goalWords)}` : ''))}
        ${d.composed !== d.net ? row('Composed today', fmtNum(d.composed) + ' words <span class="dim">(not counting imports, pastes or revision)</span>') : ''}
        ${row('Dictated', fmtNum(d.liveWords) + ' words · ' + minutes(d.speakingSec) + ' speaking')}
        ${row('Typed', fmtNum(d.typedWords) + ' words')}
        ${d.imported ? row('From imported recordings', fmtNum(d.imported) + ' words') : ''}
        ${row('Removed in revision', fmtNum(d.removed) + ' words')}
        ${row('Sprints', d.sprints)}
      </table>
      <h3>Last 7 days</h3>
      <table class="mtable">${row('Days written', weekDays)}${row('Manuscript growth', fmtNum(weekNet) + ' words')}${row('Sprints', weekSprints)}</table>
      <h3>Your pace</h3>
      <p class="help">${calib}</p>
      ${base.qualifying >= M.PROVISIONAL_FROM ? `<table class="mtable">
        ${row('Typical sprint', fmtNum(base.medianNet) + ' words of manuscript growth' + (base.p25Net !== base.p75Net ? ` (usually ${fmtNum(base.p25Net)}–${fmtNum(base.p75Net)})` : ''))}
        ${base.speed.dictation ? row('Dictating', fmtNum(base.speed.dictation) + ' words per active minute') : ''}
        ${base.speed.typing ? row('Typing', fmtNum(base.speed.typing) + ' words per active minute') : ''}
        ${row('Active composition', 'about ' + base.medianActiveMin + ' min per sprint')}
      </table>` : ''}
      ${recent.length ? `<h3>Recent sprints</h3>
      <table class="mtable grid"><tr><th>When</th><th>Time</th><th>Speaking</th><th>Active</th><th>Produced</th><th>Composed</th><th>Removed</th></tr>
      ${recent.map(({ sprint: s, stats: st }) => `<tr><td>${new Date(s.start).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</td><td>${minutes(st.runningSec)}</td><td>${minutes(st.speakingSec)}</td><td>${minutes(st.activeSec)}</td><td>${fmtNum(st.gross)}${st.imported ? ` <span class="dim">+${fmtNum(st.imported)} imp.</span>` : ''}</td><td>${fmtNum(st.composed)}</td><td>${fmtNum(st.removed)}</td></tr>`).join('')}
      </table>
      <p class="help">Produced counts words you dictated live or typed, not pastes, imports or revisions. Composed is how much the manuscript grew from what you wrote in that sprint: imports, pastes and revision are left out, and passages that finished transcribing late are added back. Active time is an estimate: speaking and typing, with pauses of up to two minutes counted as thinking.</p>` : ''}
      <h3>Goal</h3>
      <label>Daily goal (net words, blank for none)</label>
      <div class="row"><input type="text" id="mg-goal" value="${p.goalWords || ''}" placeholder="e.g. 1000" inputmode="numeric"><span class="dim" style="white-space:nowrap">${M.MILESTONES.map((m) => `<button class="link quiet" data-m="${m}">${m >= 1000 ? m / 1000 + 'k' : m}</button>`).join(' ')}</span></div>
      <p class="help" id="mg-est">${estimateText(est, base, p)}</p>
      <label>Writing days</label>
      <div class="row days">${DAYS.map((n, i) => `<label class="check"><input type="checkbox" data-day="${i}" ${p.writingDays.includes(i) ? 'checked' : ''}> ${n}</label>`).join('')}</div>
      <label>Writing window</label>
      <div class="row"><input type="text" id="mg-start" value="${esc(p.windowStart)}" style="width:90px"> <span class="dim">for</span> <input type="text" id="mg-win" value="${p.windowMin}" style="width:70px"> <span class="dim">minutes</span></div>
      <label>Rest days</label>
      <div class="row"><input type="text" id="mg-rest" placeholder="YYYY-MM-DD" style="width:140px"><button class="btn" id="mg-rest-add">Add</button></div>
      <p class="help" id="mg-rests">${restText(p)}</p>
      <p class="help">Your goal changes only when you change it. Missed days are never counted against you.</p>
      <div class="actions"><button class="btn primary" data-close>Done</button></div>`);

    const save = async (patch) => { await setProfile(patch); $('#mg-est').textContent = estimateText(M.estimate(MS.profile.goalWords, base, MS.profile, d.net), base, MS.profile); $('#mg-rests').textContent = restText(MS.profile); };
    const setGoal = (words) => { emit({ type: 'goal', words }); save({ goalWords: words }); };
    $('#mg-goal').onchange = (e) => setGoal(Math.max(0, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0));
    $('#modal-box').querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { $('#mg-goal').value = b.dataset.m; setGoal(+b.dataset.m); }));
    $('#modal-box').querySelectorAll('[data-day]').forEach((c) => (c.onchange = () => save({ writingDays: [...$('#modal-box').querySelectorAll('[data-day]:checked')].map((x) => +x.dataset.day) })));
    $('#mg-start').onchange = (e) => /^\d{1,2}:\d{2}$/.test(e.target.value.trim()) && save({ windowStart: e.target.value.trim().padStart(5, '0') });
    $('#mg-win').onchange = (e) => save({ windowMin: Math.max(0, parseInt(e.target.value, 10) || 0) });
    $('#mg-rest-add').onclick = () => {
      const v = $('#mg-rest').value.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return toast('Use the form 2026-12-25.');
      $('#mg-rest').value = '';
      save({ restDates: [...new Set([...MS.profile.restDates, v])].sort() });
    };
  }
  function estimateText(est, base, p) {
    if (!p.goalWords) return 'No goal set. You can write without one.';
    if (!est) return base.qualifying < M.PROVISIONAL_FROM ? `After ${M.PROVISIONAL_FROM} sprints, Amanuensis can estimate how many sprints a day like this takes.` : '';
    if (!est.remaining) return 'Reached today.';
    const range = est.low !== est.high && isFinite(est.high) ? ` (${est.low}–${est.high})` : '';
    return `About ${est.sprints} sprint${est.sprints === 1 ? '' : 's'}${range} for the rest of today, roughly ${est.minutes} minutes with breaks` +
      (p.windowMin ? (est.fits ? ', which fits your window.' : `, more than your ${p.windowMin}-minute window.`) : '.') + (est.provisional ? ' Provisional while calibrating.' : '');
  }
  function restText(p) { return p.restDates.length ? 'Rest days: ' + p.restDates.join(', ') : 'Rest days are honoured: no goal, no reminders.'; }

  /* ---------------- settings section ---------------- */

  function settingsHtml() {
    const p = MS.profile;
    return `<h3>Writing Mastery</h3>
      <label class="check"><input type="checkbox" id="mm-on" ${p.enabled ? 'checked' : ''}> Sprints, goals and a private record of your writing sessions</label>
      <p class="help">Off by default. Stored in this library’s folder, never in your manuscripts. Nothing is recorded while it is off.</p>
      <div id="mm-more" ${p.enabled ? '' : 'hidden'}>
        <div class="row"><label style="margin:0">Sprint</label><input type="text" id="mm-sprint" value="${p.sprintMin}" style="width:60px"><span class="dim">minutes · break</span><input type="text" id="mm-break" value="${p.breakMin}" style="width:60px"><span class="dim">minutes</span></div>
        <div class="row" style="margin-top:8px"><label style="margin:0">A writing day starts at</label><select id="mm-day" style="width:110px">${Array.from({ length: 13 }, (_, h) => `<option value="${h}" ${h === p.dayStartHour ? 'selected' : ''}>${h === 0 ? 'midnight' : h === 12 ? 'noon' : h + ' a.m.'}</option>`).join('')}</select></div>
        <p class="help">Goals, writing days and rest days are in Progress (⌥⌘P).</p>
      </div>
      <div class="row" style="margin-top:8px"><button class="btn" id="mm-delete">Delete Writing Mastery data…</button></div>`;
  }
  function wireSettings() {
    const el = (id) => document.getElementById(id);
    if (!el('mm-on')) return;
    el('mm-on').onchange = async (e) => { await setProfile({ enabled: e.target.checked }); el('mm-more').hidden = !e.target.checked; };
    el('mm-sprint').onchange = (e) => { const v = Math.min(90, Math.max(5, parseInt(e.target.value, 10) || 30)); e.target.value = v; setProfile({ sprintMin: v }); };
    el('mm-break').onchange = (e) => { const v = Math.min(60, Math.max(0, parseInt(e.target.value, 10) || 0)); e.target.value = v; setProfile({ breakMin: v }); };
    el('mm-day').onchange = (e) => setProfile({ dayStartHour: +e.target.value });
    el('mm-delete').onclick = async () => {
      if (!(await MD.masteryDelete())) return;
      clearTimeout(persistTimer); MS.queue = []; MS.live = null; MS.brk = null; MS.typing = null;
      MS.events = []; MS.ids = new Set(); MS.dayCounted = new Set(); MS.profile = { ...M.DEFAULTS }; MS.label = null;
      notify('reset');
      el('mm-on').checked = false; el('mm-more').hidden = true; hideToday(); render();
      toast('Writing Mastery data deleted.');
    };
  }

  /* ---------------- wiring ---------------- */

  $('#sprint').addEventListener('click', sprintMenu);
  $('#sprint-btn').addEventListener('click', () => start());
  $('#sprint-options').addEventListener('click', sprintMenu);

  window.Mastery = {
    load, on, activity, typed, dictationApplied, revised, structure, recording, recordingSettled,
    bookLeaving, bookOpened, sessionEnded, flush, toggle, togglePause, openProgress, settingsHtml, wireSettings,
    // for tests
    _state: MS, _start: start, _pause: pause, _resume: resume, _finish: finish, _discard: discard, _setProfile: setProfile, _persist: persist,
    _signals: () => AP.summarize(sorted()),
    // For renderer/apprentice.js
    api: {
      on, emit, sorted, withStats, currentSetup, book, today: () => today(),
      live: () => MS.live, startSprint: start, finishSprint: finish, render,
      setLabel: (t) => { MS.label = t || null; render(); },
      listen: (name, fn) => listeners[name].push(fn),
      loaded: () => MS.loaded,
    },
    _stats: () => { const evs = sorted(); return { day: M.dayStats(evs, today(), MS.profile.dayStartHour), sprints: withStats(evs) }; },
  };
  // Load on our own: this script can finish loading after app.js has already opened a book.
  window.Mastery.ready = load().catch((e) => { console.error('Writing Mastery could not load:', e); });
})();
