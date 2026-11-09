/*
 * End-to-end tests for Writing Mastery (Phase 2), in the real app with real speech.
 *
 *   AMANUENSIS_E2E_WAV=/path/speech.wav AMANUENSIS_E2E_STT=http://127.0.0.1:8777/v1 npx electron test/e2e-mastery.js
 */
'use strict';
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amanuensis-mastery-'));
const out = process.env.AMANUENSIS_E2E_OUT || tmp;
const wav = process.env.AMANUENSIS_E2E_WAV;
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
if (wav) { app.commandLine.appendSwitch('use-file-for-fake-audio-capture', wav); app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess,AudioServiceSandbox'); }

process.env.AMANUENSIS_USER_DATA = path.join(tmp, 'userData');
fs.mkdirSync(process.env.AMANUENSIS_USER_DATA, { recursive: true });
const LIB = path.join(tmp, 'Library');
fs.writeFileSync(path.join(process.env.AMANUENSIS_USER_DATA, 'settings.json'), JSON.stringify({
  libraryPath: LIB, provider: 'custom', baseUrl: process.env.AMANUENSIS_E2E_STT || 'http://127.0.0.1:8777/v1',
  formatEnabled: false, level: 1, pauseMs: 700,
}));
// The delete confirmation is a native dialog; answer "Delete" for the test.
dialog.showMessageBox = async () => ({ response: 0 });

require('../main.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined && !ok ? '  — ' + detail : '')); }
const mdir = () => path.join(LIB, '.amanuensis', 'mastery');
const ledgerLines = () => { try { return fs.readdirSync(mdir()).filter((f) => f.startsWith('ledger-')).map((f) => fs.readFileSync(path.join(mdir(), f), 'utf8')).join('').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
function hashManuscripts() {
  const h = crypto.createHash('sha256');
  const walk = (d) => { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!f.startsWith('.') && f !== 'history' && f !== 'audio') walk(p); } else if (/\.(html|json)$/.test(f) && f !== 'book.json') { h.update(p); h.update(fs.readFileSync(p)); } } };
  walk(LIB);
  return h.digest('hex');
}

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !(win = BrowserWindow.getAllWindows()[0]); i++) await sleep(200);
  if (win.webContents.isLoading()) await new Promise((r) => win.webContents.once('did-finish-load', r));
  await sleep(800);
  win.webContents.on('console-message', (...a) => { const m = a[0] && a[0].message !== undefined ? a[0] : { level: a[1], message: a[2] }; if (m.level === 'error' || m.level >= 2) console.log('console:', m.message); });
  const js = async (code) => {
    try { return await win.webContents.executeJavaScript(code); }
    catch (e) { const err = await win.webContents.executeJavaScript(`(async () => { try { ${/;\s*$|;\s*\S/.test(code) || /^\s*(const|let|if|for)\b/.test(code) ? code : 'return (' + code + ')'} } catch (x) { return 'ERR: ' + (x && x.stack || x); } })()`).catch(() => ''); throw new Error(String(err).slice(0, 600) + '\n  in: ' + code.slice(0, 120)); }
  };
  const shot = async (name) => fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG());
  const Mx = 'window.Mastery';
  const type = async (text) => { for (const ch of text) win.webContents.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(300); };
  const waitIdle = async () => { for (let i = 0; i < 120 && await js(`document.body.classList.contains('finishing') || document.body.classList.contains('recording')`); i++) await sleep(500); };
  try {
    // A book, some typing, Writing Mastery still off.
    await js(`document.querySelector('#new-book').click()`); await sleep(200);
    await js(`document.querySelector('#nb-title').value = 'Sprint Test'; document.querySelector('#nb-author').value = 'X S'; document.querySelector('#nb-go').click()`);
    await sleep(800);
    await js(`(() => { const t = document.querySelector('#text'); const p = t.querySelector('p'); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); t.focus(); })()`);
    await type('The first line was typed before anything was switched on. ');
    await js(`window.__amanuensis.flushSave()`);
    check('off by default: no sprint button', await js(`document.querySelector('#sprint-btn').hidden`));
    check('off by default: no Writing Mastery folder is created', !fs.existsSync(path.join(LIB, '.amanuensis')));

    // Turning it on and off, running an empty sprint and opening Progress leave manuscripts byte-identical.
    const before = hashManuscripts();
    await js(`document.querySelector('#settings-btn').click()`); await sleep(400);
    await js(`document.querySelector('#mm-on').click()`); await sleep(600);
    check('turning it on creates its own folder, apart from the books', fs.existsSync(mdir()));
    await js(`document.querySelector('[data-close]').click()`); await sleep(100);
    await js(`${Mx}._start()`); await sleep(300); await js(`${Mx}._finish('author')`); await sleep(300);
    await js(`${Mx}.openProgress()`); await sleep(300);
    await js(`document.querySelector('[data-close]').click()`);
    await js(`window.__amanuensis.flushSave()`); await js(`${Mx}._persist()`);
    check('manuscripts and transcripts unchanged by Writing Mastery', hashManuscripts() === before);

    // Sprint with real dictation: two recordings, the planned time expiring in the middle.
    await js(`${Mx}._setProfile({ sprintMin: 0.08, breakMin: 1, goalWords: 20, writingDays: [0,1,2,3,4,5,6] })`);
    await js(`document.querySelector('#sprint-btn').click()`); await sleep(300);
    check('sprint starts', await js(`${Mx}._state.live && ${Mx}._state.live.state === 'running'`));
    await js(`document.querySelector('#rec').click()`); await sleep(9000);
    check('planned time passes: recording continues', await js(`document.body.classList.contains('recording')`));
    check('planned time passes: sprint counts overtime, does not end', await js(`!!${Mx}._state.live && document.querySelector('#sprint').textContent.includes('+')`), await js(`document.querySelector('#sprint').textContent`));
    await shot('m1-overtime-while-recording');
    await js(`document.querySelector('#rec').click()`); await waitIdle(); await sleep(500);
    check('stopping dictation does not end the sprint', await js(`!!${Mx}._state.live && ${Mx}._state.live.state === 'running'`));
    await js(`document.querySelector('#rec').click()`); await sleep(6000);
    await js(`document.querySelector('#rec').click()`);
    await sleep(300);
    check('still the same sprint after a second recording', (await js(`${Mx}._state.events.filter(e => e.type === 'sprint' && e.op === 'start').length`)) === 2);
    await js(`${Mx}.toggle()`); // finish while transcription may still be in flight
    await waitIdle(); await sleep(1500);
    const ack = await js(`document.querySelector('#ack').hidden ? '' : document.querySelector('#ack').textContent`);
    check('quiet line after the sprint', /^Sprint 2 · [\d,]+ words? in \d+ minutes?\.$/.test(ack), ack);
    check('suggested break starts, nothing else', await js(`!${Mx}._state.live && document.querySelector('#sprint').textContent.startsWith('Break')`));
    await shot('m2-after-sprint');

    const stats = JSON.parse(await js(`JSON.stringify(${Mx}._stats())`));
    const sp = stats.sprints.filter((x) => !x.sprint.open).pop().stats;
    console.log('sprint stats', JSON.stringify(sp));
    const empty = stats.sprints.filter((x) => !x.sprint.open)[0].stats;
    check('the empty sprint before it gets none of its words', empty.liveWords === 0 && empty.speakingSec === 0, JSON.stringify(empty));
    check('speaking time measured', sp.speakingSec > 3, sp.speakingSec);
    check('dictated words counted', sp.liveWords > 5, sp.liveWords);
    check('net growth measured from the manuscript', sp.net > 5 && sp.net <= sp.liveWords + 5, `${sp.net} vs ${sp.liveWords}`);
    check('composed growth matches net when nothing distorts it', sp.composed === sp.net, `${sp.composed} vs ${sp.net}`);
    check('elapsed ≥ running ≥ active composition', sp.wallSec >= sp.runningSec && sp.runningSec >= sp.activeSec && sp.activeSec > 0, `${sp.wallSec} ${sp.runningSec} ${sp.activeSec}`);
    check('raw transcribed words kept apart', sp.rawWords >= sp.liveWords, `${sp.rawWords} vs ${sp.liveWords}`);

    // Apprenticeship step 1: signals and setup keys on real passages.
    const dicts = JSON.parse(await js(`JSON.stringify(${Mx}._state.events.filter(e => e.type === 'dict'))`));
    const expectKey = 'v1|custom|whisper-1|en|700|L1|ai0|pc0';
    check('every live passage carries the setup it was recorded with', dicts.length > 0 && dicts.every((e) => e.setup === expectKey), dicts.map((e) => e.setup).join(','));
    check('recordings carry their setup', (await js(`${Mx}._state.events.filter(e => e.type === 'rec' && e.op === 'start').every(e => e.setup === ${JSON.stringify(expectKey)})`)));
    check('passages carry filler, doubled-word and false-start counts', dicts.every((e) => ['fillers', 'doubled', 'falseStarts'].every((f) => Number.isInteger(e[f])) && e.artifact === false && e.retried === false && e.space === 'manuscript'));
    const transcriptWords = (await js(`window.__amanuensis.S.dict.segments.map(s => s.raw).join(' ')`)).split(/\s+/).filter((w) => w.length > 5);
    const ledgerText = ledgerLines().map((e) => JSON.stringify(e)).join('\n') + JSON.stringify(dicts);
    check('the behavioural log holds counts, never transcript text', transcriptWords.length > 0 && !transcriptWords.some((w) => ledgerText.includes(w.replace(/[^\w]/g, ''))), transcriptWords.slice(0, 5).join(' '));

    // Retried and artifact passages are recorded but never measured.
    await js(`${Mx}.dictationApplied({ id: 'retry1', session: ${JSON.stringify(dicts[0].session)}, startSec: 0, endSec: 4, raw: 'a retried passage of several words here', appliedText: 'a retried passage of several words here' }, { retried: true })`);
    await js(`${Mx}.dictationApplied({ id: 'loop1', session: ${JSON.stringify(dicts[0].session)}, startSec: 0, endSec: 4, raw: 'and then do she left the house quietly', appliedText: 'x', notes: ['collapsed a repeated "do"'] })`);
    const sig = JSON.parse(await js(`JSON.stringify(${Mx}._signals())`));
    check('retried and artifact passages are excluded from signals', sig.excluded.retried === 1 && sig.excluded['transcriber artifact'] === 1, JSON.stringify(sig.excluded));
    check('signals stay quiet until there are enough passages', Object.values(sig.keys).every((v) => v.ready === false && v.needs === 10), JSON.stringify(sig.keys));

    // A passage from that sprint's recording that finishes transcribing long after the sprint closed.
    const sess = await js(`${Mx}._state.events.filter(e => e.type === 'rec' && e.op === 'start').slice(-1)[0].session`);
    const spBefore = JSON.parse(await js(`JSON.stringify(${Mx}._stats())`)).sprints.filter((x) => !x.sprint.open).pop().stats;
    await js(`${Mx}.dictationApplied({ id: 'late1', session: ${JSON.stringify(sess)}, startSec: 1, endSec: 3, raw: 'arriving very late indeed', appliedText: 'arriving very late indeed' })`);
    const sp2 = JSON.parse(await js(`JSON.stringify(${Mx}._stats())`)).sprints.filter((x) => !x.sprint.open).pop().stats;
    check('a late passage counts in its sprint’s composed growth', sp2.composed === spBefore.composed + 4 && sp2.net === sp.net, `${spBefore.composed} -> ${sp2.composed}, net ${sp.net} -> ${sp2.net}`);

    // Imports and retries can't inflate production.
    const grossBefore = (JSON.parse(await js(`JSON.stringify(${Mx}._stats().day)`))).gross;
    await js(`${Mx}.dictationApplied({ id: 'imp1', session: 'import-2026-11-04-10-00-00', startSec: 0, endSec: 60, raw: 'one two three four five', appliedText: 'one two three four five' })`);
    const seg = await js(`window.__amanuensis.S.dict.segments.find(s => s.status === 'ok').id`);
    await js(`${Mx}.dictationApplied(window.__amanuensis.S.dict.segments.find(s => s.id === ${JSON.stringify(seg)}))`); // re-applied (as a retry would)
    await js(`window.__amanuensis.switchVersion(window.__amanuensis.S.dict.segments.find(s => s.id === ${JSON.stringify(seg)}), 'verbatim')`);
    await sleep(300);
    const day = JSON.parse(await js(`JSON.stringify(${Mx}._stats().day)`));
    check('imported words reported separately, not as production', day.imported === 5 && day.gross === grossBefore, JSON.stringify(day));
    check('a passage applied twice is counted once', (await js(`${Mx}._state.events.filter(e => e.id === 'dict:' + window.__amanuensis.S.book.id + ':' + ${JSON.stringify(seg)}).length`)) === 1);

    // Typed words and revision are separate; pasted text is not production.
    await js(`window.__amanuensis.placeCaretAt(window.__amanuensis.chapterPlain().length)`);
    await type(' Then a typed sentence of nine words followed.');
    await sleep(4500);
    const day2 = JSON.parse(await js(`JSON.stringify(${Mx}._stats().day)`));
    check('typed words recorded', day2.typedWords >= day.typedWords + 8, `${day.typedWords} -> ${day2.typedWords}`);

    // Goals: nothing changes a goal; rest days are honoured.
    await js(`${Mx}.openProgress()`); await sleep(300);
    await shot('m3-progress');
    check('Progress sheet opens', (await js(`document.querySelector('#modal-box h2').textContent`)) === 'Progress');
    await js(`document.querySelector('[data-close]').click()`);
    check('goal unchanged by anything the app did', (await js(`${Mx}._state.profile.goalWords`)) === 20);
    const todayKey = await js(`window.AmanuensisMastery.dayKey(Date.now(), 4)`);
    check('goal reached is mentioned at session end', (await js(`${Mx}.sessionEnded()`)) === ' · today’s goal reached');
    await js(`${Mx}._state.goalSaid.clear()`);
    await js(`${Mx}._setProfile({ restDates: [${JSON.stringify(todayKey)}] })`);
    check('rest day: no goal mention', (await js(`${Mx}.sessionEnded()`)) === '');
    await js(`${Mx}._state.todayShown = false; ${Mx}.bookOpened()`);
    check('rest day: no Today line', await js(`document.querySelector('#today').hidden`));
    await js(`${Mx}._setProfile({ restDates: [] })`);

    // Interrupted sprint: the window reloads mid-sprint (as after a crash). It comes back paused, resumable.
    await js(`${Mx}._setProfile({ sprintMin: 30 })`);
    await js(`${Mx}._start()`); await sleep(2500);
    win.webContents.reload();
    await new Promise((r) => win.webContents.once('did-finish-load', r));
    await sleep(1500);
    check('interrupted sprint comes back paused, not lost', await js(`${Mx}._state.live && ${Mx}._state.live.state === 'paused' && ${Mx}._state.live.reason === 'restart'`));
    await js(`${Mx}._finish('author')`); await sleep(500);
    await js(`${Mx}._persist()`);

    // Legacy sessions imported once, even after reloads.
    const legacyIds = ledgerLines().filter((e) => e.type === 'legacy').map((e) => e.id);
    check('legacy import is idempotent across reloads', legacyIds.length === new Set(legacyIds).size);

    // Off means off.
    await js(`${Mx}._setProfile({ enabled: false })`); await sleep(300);
    const n0 = ledgerLines().length;
    await js(`window.__amanuensis.placeCaretAt(window.__amanuensis.chapterPlain().length)`);
    await type(' Written while Writing Mastery is off.');
    await sleep(5000); await js(`${Mx}._persist()`);
    await js(`${Mx}.dictationApplied({ id: 'whileoff', session: 'take-2026-11-05-10-00-00', startSec: 0, endSec: 4, raw: 'spoken while it is off entirely', appliedText: 'spoken while it is off entirely' })`);
    await js(`${Mx}.recording('start', 'take-2026-11-05-10-00-00')`); await js(`${Mx}.recording('stop', 'take-2026-11-05-10-00-00')`);
    await js(`${Mx}._persist()`);
    check('turned off: nothing more is recorded', ledgerLines().length === n0, `${n0} -> ${ledgerLines().length}`);
    check('turned off: no signals are computed or stored', !ledgerLines().some((e) => e.seg === 'whileoff'));
    check('turned off: sprint UI hidden', await js(`document.querySelector('#sprint').hidden && document.querySelector('#sprint-btn').hidden`));

    if (process.env.AMANUENSIS_E2E_KEEP) fs.cpSync(mdir(), path.join(out, 'mastery-copy'), { recursive: true });
    // Delete all data.
    await js(`document.querySelector('#settings-btn').click()`); await sleep(400);
    await js(`document.querySelector('#mm-delete').click()`); await sleep(800);
    check('delete removes all Writing Mastery data', !fs.existsSync(mdir()));
    check('manuscript intact after delete', (await js(`document.querySelector('#text').innerText`)).includes('typed before anything'));
    await js(`document.querySelector('[data-close]').click()`);
  } catch (e) {
    check('no exceptions', false, e.stack);
  }
  fs.writeFileSync(path.join(out, 'mastery-results.json'), JSON.stringify(results, null, 1));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed. Output in ${out}`);
  app.exit(failed ? 1 : 0);
});
