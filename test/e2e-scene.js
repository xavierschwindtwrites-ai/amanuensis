/*
 * The scene invitation: put the book away, leave a scene card, find it waiting on return.
 *   npx electron test/e2e-scene.js
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amanuensis-scene-'));
const out = process.env.AMANUENSIS_E2E_OUT || tmp;
process.env.AMANUENSIS_USER_DATA = path.join(tmp, 'userData');
fs.mkdirSync(process.env.AMANUENSIS_USER_DATA, { recursive: true });
const LIB = path.join(tmp, 'Library');
fs.writeFileSync(path.join(process.env.AMANUENSIS_USER_DATA, 'settings.json'), JSON.stringify({ libraryPath: LIB }));
const L = require('../lib/library.js');
L.setRoot(LIB);
const book = L.createBook({ title: 'The Salt Archive', author: 'Ada Lindqvist' });
const readBook = () => JSON.parse(fs.readFileSync(path.join(LIB, book.id, 'book.json'), 'utf8'));

require('../main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : '')); };

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !(win = BrowserWindow.getAllWindows()[0]); i++) await sleep(200);
  if (win.webContents.isLoading()) await new Promise((r) => win.webContents.once('did-finish-load', r));
  await sleep(2000);
  const js = (c) => win.webContents.executeJavaScript(c);
  const shot = async (n) => fs.writeFileSync(path.join(out, n + '.png'), (await win.webContents.capturePage()).toPNG());
  const key = (sel, k) => js(`document.querySelector('${sel}').dispatchEvent(new KeyboardEvent('keydown', { key: '${k}', bubbles: true }))`);
  try {
    await js(`document.querySelector('#books .book').click()`); await sleep(1200);
    // a chapter that stops mid-sentence, with the caret at the end
    await js(`(() => { const t = document.querySelector('#text'); t.innerHTML = '<p>The rain had not stopped for three days.</p><p>Leif reached the bridge and saw that Sable was already'; t.dispatchEvent(new Event('input'));
      const A = window.__amanuensis; A.placeCaretAt(A.chapterPlain().length); A.rememberPosition(); })()`);
    await sleep(300);

    await js(`window.__amanuensis.putAway()`); await sleep(600);
    check('putting the book away opens the card', await js(`!document.querySelector('#crumb-edit').hidden`));
    check('the card says what it is for', /Put the book away/.test(await js(`document.querySelector('#ce-title').textContent`)));
    check('the unfinished sentence is offered as the first move', (await js(`document.querySelector('#crumb-input').value`)) === 'Leif reached the bridge and saw that Sable was already');
    check('the suggestion is selected, so typing replaces it', await js(`(() => { const i = document.querySelector('#crumb-input'); return document.activeElement === i && i.selectionStart === 0 && i.selectionEnd === i.value.length; })()`));
    check('the manuscript was saved before the card opened', /Sable was already/.test(fs.readFileSync(path.join(LIB, book.id, 'chapters', fs.readdirSync(path.join(LIB, book.id, 'chapters'))[0]), 'utf8')));
    await shot('scene-put-away');

    await js(`document.querySelector('#crumb-scene').value = 'Leif corners Sable at the bridge'; document.querySelector('#crumb-question').value = 'What makes her hand over the sword?'; document.querySelector('#crumb-input').value = 'Start with his accusation.'`);
    await key('#crumb-scene', 'Enter'); await sleep(1500);
    check('saving closes the card', await js(`document.querySelector('#crumb-edit').hidden`));
    check('it says Saved only once saved', (await js(`document.querySelector('#toast')?.textContent || ''`)) === 'Saved · next move ready');
    const note = (readBook().notes || []).find((n) => !n.dismissedAt);
    check('the card is stored in book.json, beside the chapters', note && note.scene === 'Leif corners Sable at the bridge' && note.question === 'What makes her hand over the sword?' && note.move === 'Start with his accusation.');
    check('nothing from the card entered the chapter', !(await js(`document.querySelector('#text').textContent`)).includes('accusation'));

    await win.webContents.reload(); await new Promise((r) => win.webContents.once('did-finish-load', r)); await sleep(2500);
    await js(`document.body.classList.remove('typing')`);
    check('on return the card is waiting', await js(`!document.querySelector('#breadcrumb').hidden && document.querySelector('#breadcrumb').classList.contains('card')`));
    check('it shows the scene, the question and the first move', (await js(`[...document.querySelectorAll('#breadcrumb .bc-line')].map(l => l.className.split('bc-').pop()).join(',')`)) === 'scene,question,move');
    await shot('scene-card-waiting');

    await js(`window.__amanuensis.openNoteEditor(window.__amanuensis.S.shownNote)`); await sleep(300);
    check('editing reopens all three lines', (await js(`document.querySelector('#crumb-question').value`)) === 'What makes her hand over the sword?');
    await key('#crumb-input', 'Escape'); await sleep(300);

    // write from it: a session that adds words retires the card (kept in book.json, marked done)
    await js(`(() => { const A = window.__amanuensis; A.activity('type'); const t = document.querySelector('#text');
      t.insertAdjacentHTML('beforeend', '<p>“You took it,” Leif said. “You took the sword and left me on the ice to die.”</p>'); t.dispatchEvent(new Event('input')); })()`);
    await sleep(400);
    await js(`window.__amanuensis.endSession('idle')`); await sleep(1200);
    check('writing from the card retires it', await js(`document.querySelector('#breadcrumb').hidden`));
    check('the retired card is kept, marked done', !!(readBook().notes || []).find((n) => n.scene && n.dismissedAt));

    // a plain ⌘J note is still a plain line
    await js(`window.__amanuensis.openNoteEditor()`); await sleep(300);
    await js(`document.querySelector('#crumb-input').value = 'Check the timeline before chapter three.'`);
    await key('#crumb-input', 'Enter'); await sleep(500);
    check('a single line stays a plain note', (await js(`document.querySelector('#breadcrumb .bc-text').textContent`)) === 'Check the timeline before chapter three.' && !(await js(`document.querySelector('#breadcrumb').classList.contains('card')`)));

    await js(`window.__amanuensis.S.rec = { session: 'x' }`);
    await js(`window.__amanuensis.putAway()`); await sleep(300);
    check('never stops a recording to put the book away', await js(`document.querySelector('#crumb-edit').hidden`));
    await js(`window.__amanuensis.S.rec = null`);
  } catch (e) { check('no exceptions', false, e.stack); }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed. Output in ${out}`);
  app.exit(failed ? 1 : 0);
});
