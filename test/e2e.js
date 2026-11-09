/*
 * End-to-end: real app, real microphone path (Chromium's fake capture device playing a WAV of speech),
 * real transcription through any OpenAI-compatible server, and a mock formatter.
 *
 *   AMANUENSIS_E2E_WAV=/path/speech.wav AMANUENSIS_E2E_STT=http://127.0.0.1:8777/v1 npx electron test/e2e.js
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amanuensis-e2e-'));
const out = process.env.AMANUENSIS_E2E_OUT || tmp;
const wav = process.env.AMANUENSIS_E2E_WAV;
const recordMs = +(process.env.AMANUENSIS_E2E_MS || 21000);

app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
if (wav) { app.commandLine.appendSwitch('use-file-for-fake-audio-capture', wav); app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess,AudioServiceSandbox'); }

process.env.AMANUENSIS_USER_DATA = path.join(tmp, 'userData');
fs.mkdirSync(process.env.AMANUENSIS_USER_DATA, { recursive: true });
fs.writeFileSync(path.join(process.env.AMANUENSIS_USER_DATA, 'settings.json'), JSON.stringify({
  libraryPath: path.join(tmp, 'Library'), provider: 'custom', baseUrl: process.env.AMANUENSIS_E2E_STT || 'http://127.0.0.1:8777/v1',
  formatEnabled: true, formatBaseUrl: 'http://127.0.0.1:8799/v1', level: 2, pauseMs: 700,
}));
process.env.AMANUENSIS_KEY_OPENROUTER = 'test';
const mock = require('./mock-formatter.js')(8799);

require('../main.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); }

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !(win = BrowserWindow.getAllWindows()[0]); i++) await sleep(200);
  if (!win) { console.log('FAIL window never opened'); app.exit(1); return; }
  if (win.webContents.isLoading()) await new Promise((r) => win.webContents.once('did-finish-load', r));
  await sleep(800);
  const js = (code) => win.webContents.executeJavaScript(code);
  // Screenshots are for looking at, not assertions: a sleeping display can refuse a capture.
  const shot = async (name) => { try { fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG()); } catch (e) { console.log('(no screenshot ' + name + ': ' + e.message + ')'); } };
  try {
    await shot('01-library-empty');
    await js(`document.querySelector('#new-book').click()`);
    await sleep(200);
    await js(`document.querySelector('#nb-title').value = 'The Long Rain'; document.querySelector('#nb-author').value = 'Ada Lindqvist'; document.querySelector('#nb-go').click()`);
    await sleep(800);
    check('book opens in the editor', await js(`!document.querySelector('#editor').hidden`));
    await js(`document.querySelector('#ch-title').textContent = 'Rain'; document.querySelector('#ch-title').dispatchEvent(new Event('input'))`);

    // Typing with smart punctuation
    await js(`(() => { const t = document.querySelector('#text'); const p = t.querySelector('p'); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); t.focus(); })()`);
    for (const ch of 'She said "hi" -- then left.') win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
    await sleep(400);
    const typed = await js(`document.querySelector('#text').textContent`);
    check('typing makes curly quotes and em dashes', typed.includes('“hi”') && typed.includes('—'), JSON.stringify(typed));
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await sleep(200);

    // Dictate
    await js(`document.querySelector('#rec').click()`);
    await sleep(1200);
    check('recording starts', await js(`document.body.classList.contains('recording')`));
    await shot('02-recording');
    await sleep(recordMs / 2);
    await shot('03-mid-dictation');
    await sleep(recordMs / 2);
    await js(`document.querySelector('#rec').click()`);
    for (let i = 0; i < 60 && await js(`document.body.classList.contains('finishing')`); i++) await sleep(500);
    await sleep(1500);
    await js(`window.__amanuensis.flushSave()`);
    await shot('04-after-dictation');

    // Quiet accomplishment: the session started with the first keystroke; end it as stepping away would.
    const words = await js(`window.__amanuensis.S.ch.words`);
    const sum = await js(`window.__amanuensis.endSession('idle')`);
    await sleep(300);
    const ack = await js(`document.querySelector('#ack').hidden ? '' : document.querySelector('#ack').textContent`);
    check('session end says what it added, quietly', ack === `Chapter One grew by ${words} words.`, ack);
    await shot('04b-session-ack');
    await js(`window.__amanuensis.activity()`);
    await sleep(700);
    check('the line goes away when you write again', await js(`document.querySelector('#ack').hidden`));

    const html = await js(`window.__amanuensis.serialize()`);
    const text = await js(`document.querySelector('#text').innerText`);
    console.log('\n--- manuscript text ---\n' + text + '\n-----------------------\n');
    check('dictated words reached the page', /rain/i.test(text) && /window/i.test(text), '');
    check('dialogue got quotation marks', /“Where are you going\?” she asked\./.test(text));
    check('“new paragraph” made a paragraph', /\n\s*The door closed/i.test(text));
    check('the command words are not in the text', !/new paragraph/i.test(text));
    check('moderate cleanup removed "um" and the doubled "the"', !/\bum\b/i.test(text) && !/the the/i.test(text));
    const S = JSON.parse(await js(`JSON.stringify(window.__amanuensis.S.dict.segments.map(s => ({raw: s.raw, applied: s.applied, ai: s.ai, status: s.status})))`));
    console.log(JSON.stringify(S, null, 1));
    check('raw transcripts are preserved', S.some((s) => /\bum\b/i.test(s.raw)), '');
    const truth = S.find((s) => /truth/i.test(s.raw));
    check('guard rejected the AI adding a word', truth && truth.applied !== 'ai' && truth.ai && !truth.ai.ok && /whole/.test(truth.ai.reason), truth && truth.ai && truth.ai.reason);
    check('no added word reached the page', !/whole truth/i.test(text));
    check('some segments used verified AI formatting', S.some((s) => s.applied === 'ai'));

    // Files on disk
    const lib = path.join(tmp, 'Library');
    const bookDir = path.join(lib, fs.readdirSync(lib)[0]);
    const book = JSON.parse(fs.readFileSync(path.join(bookDir, 'book.json'), 'utf8'));
    const chFile = path.join(bookDir, 'chapters', book.chapters[0].id + '.html');
    check('chapter saved to disk', fs.readFileSync(chFile, 'utf8').includes('door closed'));
    check('dictation record saved', fs.existsSync(path.join(bookDir, 'dictation', book.chapters[0].id + '.json')));
    const audio = fs.readdirSync(path.join(bookDir, 'audio'));
    check('session audio saved', audio.length === 1 && fs.statSync(path.join(bookDir, 'audio', audio[0])).size > 16000 * 2 * 5, audio.join(','));
    check('word count shown', /\d+ words/.test(await js(`document.querySelector('#wc-chapter').textContent`)));

    // Reversibility: switch the first AI segment to verbatim and back.
    const id = await js(`window.__amanuensis.S.dict.segments.find(s => s.applied === 'ai' && s.ai.removed.length)?.id`);
    check('found a passage whose versions differ', id);
    if (id) {
      await js(`document.querySelector('#transcript-btn').click()`);
      await sleep(300);
      await shot('05-transcript');
      const before = await js(`document.querySelector('#text').innerText`);
      await js(`document.querySelector('#segments li[data-id="${id}"] [data-v="verbatim"]').click()`);
      await sleep(300);
      const mid = await js(`document.querySelector('#text').innerText`);
      await js(`document.querySelector('#segments li[data-id="${id}"] [data-v="ai"]').click()`);
      await sleep(300);
      const after = await js(`document.querySelector('#text').innerText`);
      check('switching versions changes the page and switching back restores it', mid !== before && after === before, '');
    }

    // Reload from disk
    const chId = book.chapters[0].id;
    await js(`window.__amanuensis.openChapter(${JSON.stringify(chId)})`);
    await sleep(500);
    check('chapter reloads from disk intact', (await js(`document.querySelector('#text').innerText`)).includes('door closed'));

    const A = 'window.__amanuensis';
    const bookJson = () => JSON.parse(fs.readFileSync(path.join(bookDir, 'book.json'), 'utf8'));

    // Notes for next time (typed)
    await js(`document.querySelector('#note-btn').click()`);
    await sleep(150);
    await js(`(() => { const i = document.querySelector('#crumb-input'); i.value = 'Next, Leif confronts Sable about the sword.'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
    await sleep(300);
    check('note shows at the top of the page', (await js(`document.querySelector('#breadcrumb .bc-text').textContent`)) === 'Next, Leif confronts Sable about the sword.');
    check('note never enters the manuscript', !(await js(`document.querySelector('#text').innerText`)).includes('Leif'));
    await shot('06-breadcrumb');

    // Notes for next time (spoken), with the option on
    await js(`${A}.S.settings.noteCommand = true`);
    await js(`(() => { const s = document.createElement('span'); s.className = 'dict pending'; s.dataset.seg = 'v1'; document.querySelector('#text p:last-child').appendChild(s); })()`);
    await js(`window.__amanuensis.segFinal({ type: 'final', id: 'v1', text: 'Note to self, check the timeline before chapter three.', session: 'x', startSec: 0, endSec: 2, provider: 'custom' })`);
    await sleep(300);
    check('“note to self” becomes a note', (await js(`document.querySelector('#breadcrumb .bc-text').textContent`)) === 'Check the timeline before chapter three.');
    check('the spoken note is not in the manuscript', !(await js(`document.querySelector('#text').innerText`)).includes('timeline'));
    check('the spoken note keeps its raw transcript', await js(`${A}.S.dict.segments.some(s => s.status === 'note' && /note to self/i.test(s.raw))`));
    await js(`${A}.S.settings.noteCommand = false`);

    // Re-entry: leave the caret mid-chapter, visit another chapter, come back.
    await js(`${A}.placeCaretAt(${A}.chapterPlain().indexOf('watched'))`);
    const want = await js(`${A}.caretOffset()`);
    await js(`${A}.newChapter()`);
    await sleep(500);
    await js(`${A}.openChapter(${JSON.stringify(chId)})`);
    await sleep(400);
    check('caret returns to where you left a chapter', (await js(`${A}.caretOffset()`)) === want, want + ' vs ' + (await js(`${A}.caretOffset()`)));
    await js(`${A}.flushSave()`);
    const bj = bookJson();
    check('position saved with the words before it', bj.chapters[0].at && bj.chapters[0].at.quote.includes('window and'), JSON.stringify(bj.chapters[0].at));
    check('notes saved in book.json, apart from chapters', bj.notes.length === 2 && bj.notes.filter((n) => !n.dismissedAt).length === 1);
    check('session logged', Array.isArray(bj.sessions) && bj.sessions[0].added === words);

    // Words written above the caret elsewhere: the caret still finds its place.
    const edited = '<p>A brand-new opening paragraph, written on another day.</p>' + fs.readFileSync(chFile, 'utf8');

    // Relaunch the window: book, chapter, caret and note come back; the microphone does not.
    win.webContents.reload();
    await new Promise((r) => win.webContents.once('did-finish-load', r));
    await sleep(1200);
    check('relaunch opens straight into the book', await js(`!document.querySelector('#editor').hidden && document.querySelector('#ch-title').textContent === 'Rain'`));
    check('relaunch restores the caret', (await js(`${A}.caretOffset()`)) === want);
    check('relaunch shows the note', (await js(`document.querySelector('#breadcrumb .bc-text').textContent`)) === 'Check the timeline before chapter three.');
    check('relaunch does not record', !(await js(`document.body.classList.contains('recording')`)));
    await shot('07-relaunch');

    fs.writeFileSync(chFile, edited);
    await js(`${A}.openChapter(${JSON.stringify(book.chapters[0].id)}, { noSave: true })`);
    await sleep(400);
    const off = await js(`${A}.caretOffset()`), plain = await js(`${A}.chapterPlain()`);
    check('caret survives text added above it', plain.slice(0, off).endsWith('window and '), JSON.stringify(plain.slice(Math.max(0, off - 20), off)));

    // Exports
    const model = await js(`(async () => { const D = window.amanuensis; let m; const orig = D.exportBook; return 1; })()`);
    const { toDocx, toMarkdown } = require('../lib/export.js');
    const md = toMarkdown({ title: 'T', author: 'A B', words: 10, chapters: [{ heading: 'Chapter 1', paras: [{ runs: [{ t: 'Hi', i: true }] }, { scene: true }] }] });
    check('markdown export', md.includes('*Hi*') && md.includes('* * *'));
    const docx = await toDocx({ title: 'The Long Rain', author: 'Ada Lindqvist', words: 120, chapters: [{ heading: 'Chapter 1: Rain', paras: [{ runs: [{ t: 'Text' }] }] }] });
    fs.writeFileSync(path.join(out, 'sample.docx'), docx);
    check('docx export builds', docx.length > 2000 && docx.slice(0, 2).toString() === 'PK');
  } catch (e) {
    check('no exceptions', false, e.stack);
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 1));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed. Output in ${out}`);
  mock.srv.close();
  app.exit(failed ? 1 : 0);
});
