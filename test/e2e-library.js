/*
 * The library shelf: generated covers, and a new cover on request.
 *   npx electron test/e2e-library.js
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amanuensis-shelf-'));
const out = process.env.AMANUENSIS_E2E_OUT || tmp;
process.env.AMANUENSIS_USER_DATA = path.join(tmp, 'userData');
fs.mkdirSync(process.env.AMANUENSIS_USER_DATA, { recursive: true });
const LIB = path.join(tmp, 'Library');
fs.writeFileSync(path.join(process.env.AMANUENSIS_USER_DATA, 'settings.json'), JSON.stringify({ libraryPath: LIB }));
const L = require('../lib/library.js');
L.setRoot(LIB);
const titles = [['The Salt Archive', 'Ada Lindqvist'], ['A Lantern for the Drowned', 'Ada Lindqvist'], ['Ironwood', 'Ada Lindqvist'],
  ['The Quiet Fleet', 'Ada Lindqvist'], ['Glass Orchard', 'Ada Lindqvist'], ['North of the Last Light', 'Ada Lindqvist']];
titles.forEach(([title, author], i) => { const b = L.createBook({ title, author }); L.saveBook(b.id, { chapters: [{ ...b.chapters[0], words: 1200 * (i + 1) }] }); });

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
  try {
    check('every book is a cover on the shelf', (await js(`document.querySelectorAll('#books .book:not(.new-book)').length`)) === titles.length);
    check('covers are painted', (await js(`[...document.querySelectorAll('#books .book:not(.new-book)')].every(b => /url\\("data:image/.test(b.style.background))`)));
    check('titles are set in real type on the covers', (await js(`[...document.querySelectorAll('#books .b-title')].every(t => t.textContent.trim().length > 0)`)));
    check('a New book tile ends the shelf', (await js(`!!document.querySelector('#books #new-book')`)));
    await shot('shelf');
    const first = await js(`document.querySelector('#books .book').getAttribute('aria-label')`);
    const bookId = fs.readdirSync(LIB).find((d) => first.startsWith(JSON.parse(fs.readFileSync(path.join(LIB, d, 'book.json'), 'utf8')).title));
    const before = JSON.parse(fs.readFileSync(path.join(LIB, bookId, 'book.json'), 'utf8'));
    const bgBefore = await js(`document.querySelector('#books .book').style.background`);
    await js(`document.querySelector('#books .book .b-refresh').click()`); await sleep(600);
    const after = JSON.parse(fs.readFileSync(path.join(LIB, bookId, 'book.json'), 'utf8'));
    check('↻ gives the book a new cover', (await js(`document.querySelector('#books .book').style.background`)) !== bgBefore);
    check('the new cover is remembered', after.coverSeed && after.coverSeed !== (before.coverSeed || ''));
    check('a new cover does not reorder the shelf', after.updated === before.updated);
    await win.webContents.reload(); await new Promise((r) => win.webContents.once('did-finish-load', r)); await sleep(2000);
    check('the chosen cover survives a relaunch', (await js(`document.querySelector('#books .book').style.background`)) !== bgBefore);
    await shot('shelf-after-new-cover');
    check('the wordmark carries the red mark', await js(`!!document.querySelector('.lib-head .wordmark .mark')`));
    check('the shelf counts the books', (await js(`document.querySelector('#lib-count').textContent`)) === titles.length + ' books');
    await js(`document.querySelector('#books .book').click()`); await sleep(1200);
    await js(`(() => { const t = document.querySelector('#text'); t.innerHTML = '<p>The rain had not stopped for three days. Marcus stood at the window and watched the street below, counting the lamps as they came on.</p><p>“Where are you going?” she asked.</p>'; t.dispatchEvent(new Event('input')); })()`);
    await sleep(300);
    await js(`document.body.classList.remove('typing')`);
    check('the breadcrumb names the book and chapter', /Chapter One/.test(await js(`document.querySelector('#crumbbar').textContent`)));
    check('readiness says what is missing', (await js(`document.querySelector('#ready').textContent`)) === 'Add a transcription key' && (await js(`document.querySelector('#ready').classList.contains('missing')`)));
    check('cleanup is labelled as cleanup', (await js(`document.querySelector('#level-btn').textContent`)).startsWith('Cleanup: '));
    check('Chapters is a visible button', await js(`!!document.querySelector('#nav-btn') && document.querySelector('#nav-btn').offsetWidth > 0`));
    await shot('editor-idle');
    await js(`document.querySelector('#nav-btn').click()`); await sleep(400);
    await shot('editor-chapters');
    await js(`document.querySelector('#nav-btn').click()`);
    await js(`document.body.classList.add('recording'); document.querySelector('#rec').style.setProperty('--lvl', '0.6'); document.querySelector('#rec-time').textContent = '2:14'; document.querySelector('#meter i').style.width = '55%'`);
    await sleep(700);
    await shot('editor-recording');
    await js(`document.body.classList.remove('recording')`);
    await js(`window.__amanuensis.S && document.querySelector('#settings-btn').click()`); await sleep(500);
    await shot('settings');
  } catch (e) { check('no exceptions', false, e.stack); }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed. Output in ${out}`);
  app.exit(failed ? 1 : 0);
});
