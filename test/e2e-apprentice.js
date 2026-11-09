/*
 * End-to-end tests for the Dictation Apprenticeship, step 2, in the real app with real speech.
 *
 *   AMANUENSIS_E2E_WAV=/path/speech.wav AMANUENSIS_E2E_STT=http://127.0.0.1:8777/v1 npx electron test/e2e-apprentice.js
 */
'use strict';
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amanuensis-train-'));
const out = process.env.AMANUENSIS_E2E_OUT || tmp;
const wav = process.env.AMANUENSIS_E2E_WAV;
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
if (wav) { app.commandLine.appendSwitch('use-file-for-fake-audio-capture', wav); app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess,AudioServiceSandbox'); }
process.env.AMANUENSIS_USER_DATA = path.join(tmp, 'userData');
fs.mkdirSync(process.env.AMANUENSIS_USER_DATA, { recursive: true });
const LIB = path.join(tmp, 'Library');
fs.writeFileSync(path.join(process.env.AMANUENSIS_USER_DATA, 'settings.json'), JSON.stringify({
  libraryPath: LIB, provider: 'custom', baseUrl: process.env.AMANUENSIS_E2E_STT || 'http://127.0.0.1:8777/v1', formatEnabled: false, level: 1, pauseMs: 700,
}));
dialog.showMessageBox = async () => ({ response: 0 });
require('../main.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  — ' + detail : '')); }
const mdir = () => path.join(LIB, '.amanuensis', 'mastery');
const ledger = () => { try { return fs.readdirSync(mdir()).filter((f) => f.startsWith('ledger-')).map((f) => fs.readFileSync(path.join(mdir(), f), 'utf8')).join('').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
function hashManuscripts() {
  const h = crypto.createHash('sha256');
  const walk = (d) => { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!f.startsWith('.') && f !== 'history' && f !== 'audio') walk(p); } else if (/\.(html|json)$/.test(f) && f !== 'book.json') { h.update(p); h.update(fs.readFileSync(p)); } } };
  walk(LIB); return h.digest('hex');
}

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !(win = BrowserWindow.getAllWindows()[0]); i++) await sleep(200);
  if (win.webContents.isLoading()) await new Promise((r) => win.webContents.once('did-finish-load', r));
  await sleep(800);
  win.webContents.on('console-message', (...a) => { const m = a[0] && a[0].message !== undefined ? a[0] : { level: a[1], message: a[2] }; if (m.level === 'error' || m.level === 3) console.log('console:', m.message); });
  const js = (code) => win.webContents.executeJavaScript(code);
  const shot = async (name) => fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG());
  const Mx = 'window.Mastery', Ax = 'window.Apprentice';
  const waitIdle = async () => { for (let i = 0; i < 120 && await js(`document.body.classList.contains('finishing') || document.body.classList.contains('recording')`); i++) await sleep(500); };
  const panel = () => js(`document.getElementById('ex-after').hidden ? '' : document.getElementById('ex-after').textContent`);
  const lastAttempt = async () => JSON.parse(await js(`JSON.stringify(${Ax}._attempts().slice(-1)[0] || null)`));
  try {
    await js(`document.querySelector('#new-book').click()`); await sleep(200);
    await js(`document.querySelector('#nb-title').value = 'Training Test'; document.querySelector('#nb-author').value = 'X S'; document.querySelector('#nb-go').click()`);
    await sleep(900);
    await js(`(() => { const t = document.querySelector('#text'); const p = t.querySelector('p'); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); t.focus(); })()`);
    for (const ch of 'An opening line, typed by hand. ') win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
    await sleep(400); await js(`window.__amanuensis.flushSave()`);

    // Off: Training explains itself and records nothing.
    await js(`${Ax}.open()`); await sleep(200);
    check('with Writing Mastery off, Training says so', (await js(`document.querySelector('#modal-box').textContent`)).includes('Writing Mastery, which is off'));
    await js(`document.querySelector('[data-close]').click()`);
    check('with it off, an exercise cannot start', (await js(`${Ax}.startExercise('two-voices', {})`)) === null && !fs.existsSync(path.join(LIB, '.amanuensis')));

    await js(`${Mx}._setProfile({ enabled: true, sprintMin: 0.05, breakMin: 0, writingDays: [0,1,2,3,4,5,6] })`); await sleep(300);
    const before = hashManuscripts();

    // The sheet: five abilities, exercises, start from one screen.
    await js(`${Ax}.open()`); await sleep(300);
    const heads = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll('#modal-box .ab h3')].map(h => h.textContent))`));
    check('the Training sheet shows the five abilities', JSON.stringify(heads) === JSON.stringify(['Mental Composition', 'Continuous Drafting', 'Dialogue Fluency', 'Scene Development', 'Writing Endurance']), heads.join(', '));
    check('each exercise can be started from the sheet', (await js(`document.querySelectorAll('#modal-box [data-start]').length`)) === 9);
    check('no XP, badges or scores in the sheet', !/\b(xp|badge|points|score|level \d)\b/i.test(await js(`document.querySelector('#modal-box').textContent`)));
    await shot('t1-training-sheet');
    await js(`document.querySelector('#modal-box [data-start="two-voices"]').click()`); await sleep(400);
    check('Start closes the sheet and begins a sprint in the chapter', (await js(`document.querySelector('#modal').hidden && !!${Mx}._state.live`)));
    check('the bar names the exercise, nothing more', (await js(`document.querySelector('#sprint').textContent`)).startsWith('Two voices · '));
    await js(`${Ax}.endNow()`); await sleep(600);
    check('ending early shows one optional question, quietly', (await panel()).startsWith('Two voices · ended early') && (await panel()).includes('How did that feel?'));
    await shot('t2-after-panel');
    await js(`document.querySelector('#ex-after [data-felt="right"]').click()`); await sleep(200);
    check('a rating closes the question', (await panel()) === '');
    let a = await lastAttempt();
    await shot('t2b-after-rating');
    check('the attempt records exercise, status, rating, sprint and setup', a.exercise === 'two-voices' && a.status === 'ended early' && a.felt === 'right' && a.sprints.length === 1 && a.setup === 'v1|custom|whisper-1|en|700|L1|ai0|pc0', JSON.stringify(a));
    check('starting and rating an exercise does not touch the manuscript', hashManuscripts() === before);

    // A real exercise with dictation: the question waits until dictation stops.
    await js(`${Ax}.startExercise('whole-scene', { minutes: 10 }, { plannedMin: 0.1 })`); await sleep(300);
    await js(`document.querySelector('#rec').click()`); await sleep(8000);
    await js(`${Mx}.toggle()`); await sleep(1500);   // finish the sprint while still recording
    check('no question appears during dictation', (await panel()) === '' && (await js(`document.body.classList.contains('recording')`)));
    await js(`document.querySelector('#rec').click()`); await waitIdle();
    for (let i = 0; i < 30 && !(await panel()); i++) await sleep(500);   // transcription can lag under load
    const p2 = await panel();
    await shot('t4-panel-with-sprint-line');
    check('after dictation stops, the optional question appears', p2.startsWith('One scene, start to finish · done'), p2);
    await js(`document.querySelector('#ex-after [data-felt="easy"]').click()`); await sleep(200);
    check('the exercise’s own question follows the rating', (await panel()).includes('Did the scene reach its end?'));
    await js(`document.querySelector('#ex-after [data-ev="yes"]').click()`); await sleep(200);
    a = await lastAttempt();
    check('completion, rating and evidence recorded', a.status === 'completed' && a.felt === 'easy' && a.evidence.reachedEnd === 'yes' && typeof a.paraDelta === 'number', JSON.stringify(a));

    // Dismissing records nothing; the attempt still counts.
    await js(`${Ax}.startExercise('sprint-ladder', { minutes: 10 }, { plannedMin: 0.05 })`); await sleep(3500);
    await js(`${Mx}.toggle()`); await sleep(600);
    await js(`document.querySelector('#ex-after .ea-x').click()`); await sleep(200);
    const prof = JSON.parse(await js(`JSON.stringify(${Ax}._profile())`));
    check('dismissing records no rating, and the attempt still counts as completed', prof.endurance.completed === 1 && prof.endurance.felt.unrated === 1, JSON.stringify(prof.endurance));

    // Duplicates: a repeated end is ignored.
    const ladderId = (await lastAttempt()).id;
    await js(`${Mx}.api.emit({ id: 'exend:${ladderId}', type: 'ex', op: 'end', attempt: '${ladderId}', status: 'ended early' })`);
    await js(`${Mx}._persist()`);
    check('a repeated end event is not stored twice', ledger().filter((e) => e.type === 'ex' && e.op === 'end' && e.attempt === ladderId).length === 1);

    // Session length: one exercise across two sprints, waiting between them.
    await js(`${Ax}.startExercise('session-ladder', { sprints: 2 })`); await sleep(3500);
    await js(`${Mx}.toggle()`); await sleep(600);
    check('between sprints the exercise stays open', (await js(`!!${Ax}._state.live && !${Mx}._state.live`)));
    await js(`${Mx}._start()`); await sleep(300);
    check('the next sprint joins it', (await js(`document.querySelector('#sprint').textContent`)).startsWith('Session length 2/2'));
    await sleep(3200); await js(`${Mx}.toggle()`); await sleep(600);
    a = await lastAttempt();
    check('two sprints complete the session exercise', a.exercise === 'session-ladder' && a.sprints.length === 2 && a.status === 'completed', JSON.stringify(a));
    await js(`document.querySelector('#ex-after .ea-x') && document.querySelector('#ex-after .ea-x').click()`);

    // Rating later, from the sheet.
    await js(`${Ax}.open()`); await sleep(300);
    await js(`document.querySelectorAll('#modal-box details.ex-hist').forEach(d => d.open = true)`);
    const rateBtn = await js(`!!document.querySelector('#modal-box [data-rate]')`);
    await js(`document.querySelector('#modal-box [data-rate][data-v="hard"]').click()`); await sleep(300);
    check('an unrated exercise can be rated later in the sheet', rateBtn && JSON.parse(await js(`JSON.stringify(${Ax}._profile().endurance.felt)`)).hard === 1);
    await js(`document.querySelector('#modal-box [data-stage="dialogue"]').value = 'practising'; document.querySelector('#modal-box [data-stage="dialogue"]').dispatchEvent(new Event('change'))`);
    check('the author can set an ability’s stage; nothing changes it automatically', (await js(`${Ax}._profile().dialogue.stage`)) === 'practising' && (await js(`${Ax}._profile().scene.stage`)) === 'learning');
    await shot('t3-training-history');
    await js(`document.querySelector('[data-close]').click()`);

    // Interrupted: the window reloads mid-exercise.
    await js(`${Mx}._setProfile({ sprintMin: 30 })`);
    await js(`${Ax}.startExercise('one-take', { minutes: 10 })`); await sleep(2500);
    await js(`${Mx}._persist()`);
    win.webContents.reload();
    await new Promise((r) => win.webContents.once('did-finish-load', r));
    await sleep(1800);
    check('after a reload the exercise reconnects to its paused sprint', (await js(`!!${Ax}._state.live && ${Ax}._state.live.exercise === 'one-take' && ${Mx}._state.live && ${Mx}._state.live.state === 'paused'`)));
    check('no question pops up at launch', (await panel()) === '');
    await js(`${Ax}.endNow()`); await sleep(600);
    a = await lastAttempt();
    check('ending it afterwards closes the attempt', a.exercise === 'one-take' && a.end != null, JSON.stringify(a));

    // No manuscript text in any training event.
    const textWords = (await js(`window.__amanuensis.chapterPlain()`)).split(/\s+/).filter((w) => w.length > 5).map((w) => w.replace(/\W/g, ''));
    const trainingJson = JSON.stringify(ledger().filter((e) => /^(ex|stage)/.test(e.type)));
    check('training events hold no manuscript text', textWords.length > 0 && !textWords.some((w) => trainingJson.includes(w)), textWords.slice(0, 4).join(' '));

    // Off and delete.
    await js(`${Mx}._setProfile({ enabled: false })`); await sleep(300);
    const n0 = ledger().length;
    check('turned off: exercises cannot start and nothing is recorded', (await js(`${Ax}.startExercise('two-voices', {})`)) === null && ledger().length === n0);
    await js(`document.querySelector('#settings-btn').click()`); await sleep(400);
    await js(`document.querySelector('#mm-delete').click()`); await sleep(800);
    check('deleting Writing Mastery data removes all training records', !fs.existsSync(mdir()) && (await js(`${Ax}._state.live === null`)));
    await js(`document.querySelector('[data-close]').click()`);
  } catch (e) {
    check('no exceptions', false, e.stack);
  }
  fs.writeFileSync(path.join(out, 'apprentice-results.json'), JSON.stringify(results, null, 1));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed. Output in ${out}`);
  app.exit(failed ? 1 : 0);
});
