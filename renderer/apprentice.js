/*
 * Dictation Apprenticeship, step 2: the Training sheet, exercises run inside ordinary sprints on the
 * author's own manuscript, and an optional rating afterwards. No recommendations, no automatic
 * progression, no scores. Everything here observes; nothing changes the manuscript.
 * Design: docs/writing-mastery-system.md §16. Rules: lib/apprentice.js.
 */
'use strict';
(function () {
  const AP = window.AmanuensisApprentice;
  const M = window.AmanuensisMastery;
  const api = () => (window.Mastery && window.Mastery.api) || null;
  const on = () => !!api() && api().on();
  const AS = { live: null, pending: null, waitTimer: null };
  const uid = () => 'ex' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const FELT = [['easy', 'Easy'], ['right', 'About right'], ['hard', 'Hard']];
  const STATUS_WORDS = { completed: 'done', 'ended early': 'ended early', interrupted: 'interrupted' };

  function emitEx(e) { return on() ? api().emit(AP.safeEvent(e)) : null; }
  function paragraphs() { return [...document.querySelectorAll('#text > p:not(.scene)')].filter((p) => p.textContent.trim()).length; }
  function chapterId() { const S = window.__amanuensis && window.__amanuensis.S; return S && S.ch ? S.ch.id : null; }
  function sprintMap() { const m = new Map(); for (const x of api().withStats(api().sorted())) m.set(x.sprint.id, x); return m; }
  function stageOf(ability) { return AP.trainingProfile(api().sorted())[ability].stage; }
  function optionLabel(p, v) { const o = p.options.find((x) => (typeof x === 'object' ? x.value : x) === v); return o ? (typeof o === 'object' ? o.label : String(o)) : String(v); }
  function describe(ex, params) { return ex.params.map((p) => optionLabel(p, params[p.key])).join(', '); }
  function label() {
    const l = AS.live;
    if (!l) return null;
    const ex = AP.exercise(l.exercise);
    return l.sprintsPlanned > 1 ? `${ex.name} ${Math.min(l.sprints.length, l.sprintsPlanned)}/${l.sprintsPlanned}` : ex.name;
  }

  /* ---------------- starting and ending ---------------- */

  /** Begin an exercise in the author's current chapter, inside a sprint. */
  function startExercise(exId, rawParams, opts = {}) {
    if (!on()) { toast('Turn on Writing Mastery in Settings to use Training.'); return null; }
    if (!api().book()) { toast('Open a book first.'); return null; }
    if (AS.live) { toast('Finish the current exercise first.'); return null; }
    const ex = AP.exercise(exId);
    if (!ex) return null;
    const params = AP.cleanParams(ex, rawParams);
    const sprintsPlanned = params.sprints || 1;
    let sprint = api().live() ? api().live().id : null;
    if (!sprint) sprint = api().startSprint({ plannedMin: opts.plannedMin || params.minutes || undefined });
    if (!sprint) return null;
    const attempt = uid();
    AS.live = { attempt, exercise: ex.id, ability: ex.ability, params, sprintsPlanned, sprints: [sprint], paraStart: paragraphs(), chapter: chapterId() };
    emitEx({ type: 'ex', op: 'start', attempt, exercise: ex.id, ability: ex.ability, params, sprint, sprintsPlanned,
      setup: api().currentSetup(), space: 'manuscript', stage: stageOf(ex.ability), paraStart: AS.live.paraStart });
    api().setLabel(label());
    hidePanel();
    return attempt;
  }

  function endAttempt(status) {
    const l = AS.live;
    if (!l) return;
    AS.live = null;
    api().setLabel(null);
    const paraDelta = l.chapter && l.chapter === chapterId() && typeof l.paraStart === 'number' ? paragraphs() - l.paraStart : null;
    emitEx({ type: 'ex', op: 'end', attempt: l.attempt, status, sprint: l.sprints[l.sprints.length - 1], paraDelta, id: 'exend:' + l.attempt });
    if (status !== 'abandoned') showPanelWhenQuiet({ attempt: l.attempt, exercise: l.exercise, status });
  }

  function onSprintStart({ id }) {
    const l = AS.live;
    if (!l || l.sprints.includes(id)) return;
    l.sprints.push(id);                      // the next sprint of a session-length exercise
    emitEx({ type: 'ex', op: 'sprint', attempt: l.attempt, sprint: id, id: 'exsp:' + l.attempt + ':' + id });
    api().setLabel(label());
  }

  function onSprintComplete({ id }) {
    const l = AS.live;
    if (!l || !l.sprints.includes(id)) return;
    const attempt = AP.deriveAttempts(api().sorted()).find((a) => a.id === l.attempt);
    if (!attempt) return endAttempt('interrupted');
    const next = AP.attemptNext(attempt, sprintMap());
    if (next.op === 'continue' && next.between) {
      setTimeout(() => {   // add to the sprint's own quiet line
        const el = document.getElementById('ack');
        if (el && !el.hidden) el.textContent = el.textContent.replace(/\.$/, '') + ` · ${next.done} of ${l.sprintsPlanned} sprints. Rest your voice, then start the next.`;
      }, 0);
      return;
    }
    endAttempt(next.op === 'end' ? next.status : AP.attemptStatus(attempt, sprintMap()));
  }

  function onReset() { AS.live = null; AS.pending = null; hidePanel(); }

  /** After a reload or crash: reconnect to an attempt whose sprint came back paused, or close it quietly. */
  function recover() {
    if (!on()) return;
    const map = sprintMap();
    const live = api().live();
    for (const a of AP.deriveAttempts(api().sorted())) {
      if (a.end != null) continue;
      const next = AP.attemptNext(a, map);
      const lastDay = M.dayKey(Math.max(a.start, ...a.sprints.map((id) => (map.get(id) ? map.get(id).sprint.lastEvent : a.start))), 4);
      const attachedLive = live && a.sprints.includes(live.id);
      if (next.op === 'continue' && (attachedLive || (next.between && lastDay === api().today()))) {
        AS.live = { attempt: a.id, exercise: a.exercise, ability: a.ability, params: a.params, sprintsPlanned: a.sprintsPlanned, sprints: a.sprints.slice(), paraStart: null, chapter: null };
        api().setLabel(label());
      } else {
        const status = next.op === 'end' ? next.status : AP.attemptStatus(a, map) === 'completed' ? 'completed' : 'interrupted';
        emitEx({ type: 'ex', op: 'end', attempt: a.id, status, id: 'exend:' + a.id });   // no panel at launch; it can be rated in Training
      }
    }
  }

  /* ---------------- the optional rating ---------------- */

  function busy() { return document.body.classList.contains('recording') || document.body.classList.contains('starting'); }

  function showPanelWhenQuiet(p) {
    AS.pending = p;
    clearTimeout(AS.waitTimer);
    if (busy()) { AS.waitTimer = setTimeout(() => showPanelWhenQuiet(p), 1000); return; }   // never during dictation
    renderPanel();
  }

  function renderPanel() {
    const p = AS.pending, el = document.getElementById('ex-after');
    if (!p || !el) return;
    const ex = AP.exercise(p.exercise);
    const a = AP.deriveAttempts(api().sorted()).find((x) => x.id === p.attempt) || { felt: null, evidence: {} };
    const q = ex.question && !(ex.question.key in a.evidence) ? ex.question : null;
    if (a.felt && !q) return hidePanel();
    el.innerHTML = `<span class="ea-name">${esc(ex.name)} · ${STATUS_WORDS[p.status] || p.status}</span>` +
      (!a.felt ? `<span class="ea-q">How did that feel?</span>${FELT.map(([v, t]) => `<button data-felt="${v}">${t}</button>`).join('')}` : '') +
      (q ? `<span class="ea-q">${esc(q.text)}</span>${q.options.map((o) => `<button data-ev="${esc(String(o))}">${esc(String(o))}</button>`).join('')}` : '') +
      `<button class="ea-x" title="Dismiss (nothing is recorded)" aria-label="Dismiss">×</button>`;
    el.hidden = false;
  }

  function hidePanel() { const el = document.getElementById('ex-after'); if (el) el.hidden = true; clearTimeout(AS.waitTimer); }

  function rate(attempt, felt) {
    const a = AP.deriveAttempts(api().sorted()).find((x) => x.id === attempt);
    if (!a || a.felt) return;
    emitEx({ type: 'ex.rating', attempt, felt, sprint: a.sprints[a.sprints.length - 1] || null, setup: a.setup, id: 'rating:' + attempt });
  }
  function evidence(attempt, key, value) {
    emitEx({ type: 'ex.evidence', attempt, key, value, id: 'evidence:' + attempt + ':' + key });
  }

  document.getElementById('ex-after').addEventListener('click', (e) => {
    const p = AS.pending;
    if (!p) return;
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('ea-x')) { AS.pending = null; return hidePanel(); }
    if (b.dataset.felt) rate(p.attempt, b.dataset.felt);
    if (b.dataset.ev !== undefined) { const ex = AP.exercise(p.exercise); const raw = b.dataset.ev; evidence(p.attempt, ex.question.key, /^\d+$/.test(raw) ? +raw : raw); }
    renderPanel();
    if (document.getElementById('ex-after').hidden) AS.pending = null;
  });
  // Writing again puts the question away. It can still be answered in the Training sheet.
  document.getElementById('text').addEventListener('keydown', () => { if (AS.pending) { AS.pending = null; hidePanel(); } });
  new MutationObserver(() => { if (busy() && !document.getElementById('ex-after').hidden) hidePanel(); })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });

  /* ---------------- the Training sheet ---------------- */

  function open() {
    if (!on()) {
      modal(`<h2>Training</h2><p class="help">Training is part of Writing Mastery, which is off. Turn it on in Settings → Writing Mastery. Nothing is recorded while it is off.</p><div class="actions"><button class="btn primary" data-close>OK</button></div>`);
      return;
    }
    const evs = api().sorted();
    const profile = AP.trainingProfile(evs);
    const attempts = AP.deriveAttempts(evs);
    const map = sprintMap();
    const live = AS.live ? AP.exercise(AS.live.exercise) : null;
    const when = (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });

    const historyFor = (ability) => {
      const mine = attempts.filter((a) => a.ability === ability && a.end != null).slice(-8).reverse();
      if (!mine.length) return '';
      const rows = mine.map((a) => {
        const ex = AP.exercise(a.exercise), c = AP.attemptCharacteristics(a, map, evs);
        const felt = a.felt ? FELT.find(([v]) => v === a.felt)[1] : FELT.map(([v, t]) => `<button class="link quiet" data-rate="${a.id}" data-v="${v}">${t}</button>`).join(' ');
        return `<tr><td>${when(a.start)}</td><td>${esc(ex.name)}<div class="dim">${esc(describe(ex, a.params))}</div></td><td>${esc(a.status || '')}</td><td>${felt}</td><td>${c.activeMin} min</td><td>${fmtNum(c.composed)}</td><td>${c.revisedDuring} / ${c.revisedAfter}</td></tr>`;
      }).join('');
      // Comparable sessions: same exercise, same options, same transcription setup.
      const groups = new Map();
      for (const a of attempts.filter((x) => x.ability === ability && x.status === 'completed')) {
        const k = AP.comparisonKey(a);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push({ a, c: AP.attemptCharacteristics(a, map, evs) });
      }
      const comps = [...groups.values()].map((rows2) => ({ rows: rows2, cmp: AP.comparable(rows2) })).filter((g) => g.cmp).map(({ rows: r2, cmp }) => {
        const ex = AP.exercise(r2[0].a.exercise);
        return `<p class="help">${esc(ex.name)} (${esc(describe(ex, r2[0].a.params))}), same setup. Earlier ${cmp.earlier.n}: ${cmp.earlier.composedPerActiveMin ?? '–'} words per active minute, ${cmp.earlier.revisedDuring ?? '–'} words revised while drafting. Recent ${cmp.recent.n}: ${cmp.recent.composedPerActiveMin ?? '–'}, ${cmp.recent.revisedDuring ?? '–'}.</p>`;
      }).join('');
      return `<details class="ex-hist"><summary>History</summary><table class="mtable grid"><tr><th>Date</th><th>Exercise</th><th>Status</th><th>Felt</th><th>Active</th><th>Composed</th><th>Revised during / after</th></tr>${rows}</table>${comps}</details>`;
    };

    const body = AP.ABILITIES.map((ab) => {
      const pr = profile[ab.id];
      const facts = pr.attempted ? `Practised ${pr.attempted} time${pr.attempted === 1 ? '' : 's'} on ${pr.daysPractised} day${pr.daysPractised === 1 ? '' : 's'} · ${pr.completed} completed` : 'Not practised yet';
      const exs = AP.EXERCISES.filter((x) => x.ability === ab.id).map((ex) => `
        <div class="ex-row" data-ex="${ex.id}">
          <div class="ex-main"><div class="ex-name">${esc(ex.name)}</div><div class="ex-how">${esc(ex.how)}</div>
            <details class="ex-why"><summary>Why</summary>${esc(ex.basis)}</details></div>
          <div class="ex-go">${ex.params.map((p) => `<select data-p="${p.key}" aria-label="${esc(p.label)}">${p.options.map((o) => { const v = typeof o === 'object' ? o.value : o; return `<option value="${v}" ${v === p.default ? 'selected' : ''}>${esc(typeof o === 'object' ? o.label : String(o))}</option>`; }).join('')}</select>`).join('')}
            <button class="btn" data-start="${ex.id}" ${AS.live ? 'disabled' : ''}>Start</button></div>
        </div>`).join('');
      return `<section class="ab">
        <div class="ab-head"><h3>${esc(ab.name)}</h3>
          <select data-stage="${ab.id}" aria-label="How guided ${esc(ab.name)} should be">${AP.STAGES.map((st) => `<option value="${st}" ${pr.stage === st ? 'selected' : ''}>${st[0].toUpperCase() + st.slice(1)}</option>`).join('')}</select></div>
        <p class="help">${esc(ab.purpose)} <span class="dim">${facts}.</span></p>
        ${exs}
        ${historyFor(ab.id)}
      </section>`;
    }).join('');

    modal(`<h2>Training</h2>
      <p class="help">Practise one ability while you write your next scene. Choose an exercise and press Start: a sprint begins in your current chapter, and your writing stays in your book. Everything here is optional.</p>
      ${live ? `<p class="ex-live">In progress: ${esc(live.name)} <button class="btn" id="ex-end">End exercise</button></p>` : ''}
      ${body}
      <p class="help">Learning, Practising and Independent are for you to set. Later, Amanuensis will use them to offer less guidance as an ability becomes your own. Nothing here scores your writing.</p>
      <div class="actions"><button class="btn primary" data-close>Done</button></div>`);

    const box = document.getElementById('modal-box');
    box.querySelectorAll('[data-start]').forEach((b) => (b.onclick = () => {
      const row = b.closest('.ex-row'), params = {};
      row.querySelectorAll('select[data-p]').forEach((s) => { params[s.dataset.p] = /^\d+$/.test(s.value) ? +s.value : s.value; });
      closeModal();
      startExercise(b.dataset.start, params);
      const S = window.__amanuensis.S;
      if (S.ch) window.__amanuensis.restorePosition(S.ch, { end: true });   // straight back to the writing
    }));
    box.querySelectorAll('[data-stage]').forEach((s) => (s.onchange = () => emitEx({ type: 'stage', ability: s.dataset.stage, stage: s.value, by: 'author' })));
    box.querySelectorAll('[data-rate]').forEach((b) => (b.onclick = () => { rate(b.dataset.rate, b.dataset.v); open(); }));
    const end = document.getElementById('ex-end');
    if (end) end.onclick = () => { closeModal(); endNow(); };
  }

  /** "End exercise": finish its sprint (the status follows from how long it ran), or close it between sprints. */
  function endNow() {
    if (!AS.live) return;
    const live = api().live();
    if (live && AS.live.sprints.includes(live.id)) api().finishSprint('author');
    else {
      const a = AP.deriveAttempts(api().sorted()).find((x) => x.id === AS.live.attempt);
      endAttempt(a ? AP.attemptStatus(a, sprintMap()) : 'ended early');
    }
  }

  function sprintMenuItems() {
    if (!AS.live) return null;
    return { items: [{ id: 'ex-end', label: 'End Exercise' }], handle: (pick) => { if (pick !== 'ex-end') return false; endNow(); return true; } };
  }

  /* ---------------- wiring ---------------- */

  function wire() {
    const a = api();
    if (!a) return setTimeout(wire, 50);
    a.listen('sprintStart', onSprintStart);
    a.listen('sprintComplete', onSprintComplete);
    a.listen('reset', onReset);
    window.Mastery.ready.then(recover);
  }
  wire();

  window.Apprentice = {
    open, startExercise, endNow, sprintMenuItems,
    _state: AS, _rate: rate, _evidence: evidence, _profile: () => AP.trainingProfile(api().sorted()), _attempts: () => AP.deriveAttempts(api().sorted()),
  };
})();
