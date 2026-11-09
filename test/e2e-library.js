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
const titles = [['Cardinal’s War', 'Xavier Schwindt'], ['This Bleeding Light', 'Xavier Schwindt'], ['Memorium', 'Xavier Schwindt'],
  ['Heavy Lies the Crown', 'Xavier Schwindt'], ['Midwife of the Dead', 'Xavier Schwindt'], ['A Forest Without Trees', 'Xavier Schwindt']];
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
  } catch (e) { check('no exceptions', false, e.stack); }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed. Output in ${out}`);
  app.exit(failed ? 1 : 0);
});
