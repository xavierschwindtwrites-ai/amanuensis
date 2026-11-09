/*
 * The library shelf: generated covers, and a new cover on request.
 *   npx electron test/e2e-library.js
 */
'use strict';
const { app, BrowserWindow, dialog, Menu, shell, nativeImage } = require('electron');
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
  let saveTarget = path.join(out, 'cover-export.png'), saveCount = 0, saveOptions;
  dialog.showSaveDialog = async (_win, options) => { saveCount++; saveOptions = options; return { canceled: !saveTarget, filePath: saveTarget }; };
  shell.showItemInFolder = () => {};
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
    const bookBeforeExport = fs.readFileSync(path.join(LIB, bookId, 'book.json'), 'utf8');
    const bgBeforeExport = await js(`document.querySelector('#books .book').style.background`);
    const popup = Menu.prototype.popup;
    try {
      Menu.prototype.popup = function (opts) { this.items.find((item) => item.label === 'Export Cover…').click(); opts.callback(); };
      await js(`document.querySelector('#books .book').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
      for (let i = 0; i < 150 && !fs.existsSync(saveTarget); i++) await sleep(100);
    } finally { Menu.prototype.popup = popup; }
    const cover = nativeImage.createFromPath(saveTarget);
    const size = cover.getSize();
    check('Export Cover saves a 3120 × 4500 PNG', !cover.isEmpty() && size.width === 3120 && size.height === 4500, JSON.stringify(size));
    check('cover export uses a named PNG save dialog', saveOptions && saveOptions.defaultPath.endsWith(' - cover.png') && saveOptions.filters[0].extensions[0] === 'png');
    check('exporting preserves the chosen cover and book metadata', fs.readFileSync(path.join(LIB, bookId, 'book.json'), 'utf8') === bookBeforeExport && (await js(`document.querySelector('#books .book').style.background`)) === bgBeforeExport);
    check('invalid cover data is rejected before opening a save dialog', await js(`window.amanuensis.exportCover({ bookId: ${JSON.stringify(bookId)}, png: 'data:image/png;base64,AAAA' }).then(() => false, () => true)`) && saveCount === 1);
    check('the wordmark carries the red mark', await js(`!!document.querySelector('.lib-head .wordmark .mark')`));
    check('the shelf counts the books', (await js(`document.querySelector('#lib-count').textContent`)) === titles.length + ' books');
    await js(`document.querySelector('#books .book').click()`); await sleep(1200);
    const exportMenu = Menu.getApplicationMenu().items.find((item) => item.label === 'File').submenu.items.find((item) => item.label === 'Export');
    const coverItem = exportMenu.submenu.items.find((item) => item.label === 'Book Cover (.png)…');
    check('File → Export offers the book cover', !!coverItem);
    saveTarget = null;
    coverItem.click();
    for (let i = 0; i < 150 && saveCount < 2; i++) await sleep(100);
    check('canceling a cover export returns without writing another PNG', saveCount === 2 && fs.readdirSync(out).filter((f) => f.startsWith('cover-export')).length === 1);
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

    // Quiet numbers work without Mastery, and leave controls, errors and manuscript alone.
    check('quiet numbers default on with Writing Mastery off', await js(`document.body.classList.contains('quiet-numbers') && !window.Mastery.on()`));
    const manuscript = await js(`window.__amanuensis.serialize()`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 500, y: 200 });
    await js(`document.querySelector('#text').focus(); document.body.classList.add('typing'); document.querySelector('#status').textContent = 'Test error'; document.querySelector('#status').className = 'err'`);
    await sleep(450);
    check('counts recede while composing', await js(`Number(getComputedStyle(document.querySelector('.bar-left')).opacity) < .2`));
    check('Record, Stop, recording state and errors remain visible while typing', await js(`getComputedStyle(document.querySelector('#bar')).opacity === '1' && getComputedStyle(document.querySelector('#bar')).pointerEvents === 'auto' && getComputedStyle(document.querySelector('#rec')).opacity === '1' && getComputedStyle(document.querySelector('#rec-info')).opacity === '1' && getComputedStyle(document.querySelector('#onair')).opacity === '1' && getComputedStyle(document.querySelector('#status')).opacity === '1'`));
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 40, y: win.getContentSize()[1] - 25 });
    await sleep(450);
    check('hovering the bar reveals counts even during recording', await js(`getComputedStyle(document.querySelector('.bar-left')).opacity === '1'`));
    win.webContents.debugger.attach('1.3');
    try {
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      check('reduced motion removes the count fade transition', await js(`getComputedStyle(document.querySelector('.bar-left')).transitionDuration === '0s'`));
    } finally { win.webContents.debugger.detach(); }
    check('quiet numbers add nothing to manuscript HTML', (await js(`window.__amanuensis.serialize()`)) === manuscript);
    await js(`document.querySelector('#status').textContent = ''; document.querySelector('#status').className = 'dim'; document.body.classList.remove('typing')`);
    await js(`document.body.classList.remove('recording')`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 500, y: 200 });
    await js(`document.body.classList.add('typing')`); await sleep(450);
    check('typing alone keeps the existing chrome fade', await js(`Number(getComputedStyle(document.querySelector('.bar-left')).opacity) < .2 && getComputedStyle(document.querySelector('#bar')).opacity === '0'`));
    await js(`document.body.classList.remove('typing')`);
    await js(`window.__amanuensis.S && document.querySelector('#settings-btn').click()`); await sleep(500);
    await shot('settings');
    await js(`document.querySelector('#st-quiet-numbers').click()`); await sleep(300);
    check('quiet-number setting turns off immediately', await js(`!document.body.classList.contains('quiet-numbers')`));
    await js(`document.querySelector('[data-close]').click(); document.querySelector('#text').focus(); document.body.classList.add('typing')`); await sleep(450);
    check('turning off quiet numbers preserves the existing typing chrome', await js(`getComputedStyle(document.querySelector('.bar-left')).opacity === '1' && getComputedStyle(document.querySelector('#bar')).opacity === '0'`));
    win.webContents.reload(); await new Promise((r) => win.webContents.once('did-finish-load', r)); await sleep(1500);
    check('quiet-number setting survives a reload', await js(`!document.body.classList.contains('quiet-numbers') && window.__amanuensis.S.settings.quietNumbers === false`));
  } catch (e) { check('no exceptions', false, e.stack); }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed. Output in ${out}`);
  app.exit(failed ? 1 : 0);
});
