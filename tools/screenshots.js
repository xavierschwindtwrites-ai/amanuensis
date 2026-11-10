/*
 * README pictures: a staged demo library, captured in the real app, plus a banner and a cover strip.
 *   npx electron tools/screenshots.js          (writes docs/images/*.png)
 * The sample books, author and prose are invented for the demo.
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'images');
fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amanuensis-shots-'));
process.env.AMANUENSIS_USER_DATA = path.join(tmp, 'userData');
fs.mkdirSync(process.env.AMANUENSIS_USER_DATA, { recursive: true });
const LIB = path.join(tmp, 'Library');
fs.writeFileSync(path.join(process.env.AMANUENSIS_USER_DATA, 'settings.json'), JSON.stringify({
  libraryPath: LIB, provider: 'custom', baseUrl: 'http://127.0.0.1:8777/v1', level: 2, lastAuthor: 'Ada Lindqvist',
}));
const L = require('../lib/library.js');
L.setRoot(LIB);

/* ---------- the demo library ---------- */
const AUTHOR = 'Ada Lindqvist';
const shelf = [
  ['The Salt Archive', 61840], ['A Lantern for the Drowned', 88210], ['Ironwood', 23400],
  ['The Quiet Fleet', 104500], ['Glass Orchard', 47120], ['North of the Last Light', 9300],
];
const books = shelf.map(([title, words]) => {
  const b = L.createBook({ title, author: AUTHOR });
  L.saveBook(b.id, { chapters: [{ ...b.chapters[0], words }] });
  return b;
});
const hero = books[0];

// Chapter Three of The Salt Archive: typed paragraphs, then four dictated passages.
const typed = [
  'The archive had been built to outlast the sea, which was a strange ambition for a building that stood on stilts above it. At high tide the water slid beneath the reading room like a held breath, and the clerks learned to read through the sound.',
  'Sable kept the ledgers on the third floor, where the salt had not yet reached the paper. She knew every shelf by the weight of its silence. When the lamps went out she could still find the drowned towns by touch.',
];
const seg = (id, raw, clean, extra = {}) => ({
  id, session: 'take-demo', startSec: 0, endSec: 3, createdAt: Date.now() - 600000, provider: 'deepgram', model: 'nova-3', ms: 280,
  raw, notes: [], level: 2,
  versions: { verbatim: [{ k: 'p', join: true, text: raw }], clean: [{ k: 'p', join: true, text: clean }], ai: [{ k: 'p', join: true, text: clean }] },
  ai: { ok: true, ms: 640, removed: [], model: 'google/gemini-2.5-flash' }, applied: 'ai', appliedText: ' ' + clean, status: 'ok',
  pieces: [{ type: 'text', text: raw }], ...extra,
});
const dict = [
  seg('s1', 'Leif came up the ladder with the tide still on his boots.', 'Leif came up the ladder with the tide still on his boots.'),
  seg('s2', 'Um, he did not, he did not knock.', 'He did not knock.', { ai: { ok: true, ms: 610, removed: ['um', 'he did not'], model: 'google/gemini-2.5-flash' } }),
  seg('s3', 'You took it, he said. You took the sword and left me on the ice.', '“You took it,” he said. “You took the sword and left me on the ice.”'),
  seg('s4', 'Sable closed the ledger and did not look up.', 'Sable closed the ledger and did not look up.', {
    ai: { ok: false, reason: 'added or changed words: slowly', ms: 590, rejected: ['Sable slowly closed the ledger and did not look up.'] }, applied: 'clean',
  }),
];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const span = (s) => `<span data-seg="${s.id}">${esc(s.appliedText)}</span>`;
const html = typed.map((p) => `<p>${esc(p)}</p>`).join('')
  + `<p>${span(dict[0])}${span(dict[1])}</p>`
  + `<p data-seg-p="s3">${span(dict[2])}</p>`
  + `<p data-seg-p="s4">${span(dict[3])}</p>`;

const c1 = hero.chapters[0];
const chapters = [
  { ...c1, title: 'The Reading Room', words: 4210 },
  { id: 'cdemo2', title: 'Low Water', words: 3870 },
  { id: 'cdemo3', title: 'What the Ledger Kept', words: 212, at: { offset: 99999, quote: '', scroll: 0 } },
];
L.saveBook(hero.id, {
  chapters, lastChapter: 'cdemo3', terms: 'Sable, Leif',
  notes: [{ id: 'ndemo', chapterId: 'cdemo3', scene: 'Leif corners Sable on the third floor', question: 'What would make her give back the sword?', move: 'Start with the sound of the tide.', text: 'Start with the sound of the tide.', created: Date.now() - 86400000 }],
});
for (const c of chapters) L.writeChapter(hero.id, c.id, c.id === 'cdemo3' ? html : '<p>…</p>');
fs.mkdirSync(path.join(LIB, hero.id, 'dictation'), { recursive: true });
fs.writeFileSync(path.join(LIB, hero.id, 'dictation', 'cdemo3.json'), JSON.stringify({ version: 1, segments: dict }));

/* ---------- capture ---------- */
require('../main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !(win = BrowserWindow.getAllWindows()[0]); i++) await sleep(200);
  win.setContentSize(1440, 900); win.center();
  if (win.webContents.isLoading()) await new Promise((r) => win.webContents.once('did-finish-load', r));
  await sleep(2500);
  const js = (c) => win.webContents.executeJavaScript(c);
  const calm = () => js(`document.body.classList.remove('typing'); document.activeElement?.blur?.()`);
  const shot = async (n) => { await sleep(700); await js(`document.querySelector('#toast')?.setAttribute('hidden', '')`);   // a stray message is not part of the picture
    fs.writeFileSync(path.join(OUT, n + '.png'), (await win.webContents.capturePage()).toPNG()); console.log('wrote', n); };
  try {
    // The app reopens the last book; the shelf is one click away.
    await js(`window.__amanuensis.S.book ? document.querySelector('#back')?.click() : 0`); await sleep(1200);
    if (!(await js(`!!document.querySelector('#books .book')`))) await js(`document.querySelector('#back')?.click()`);
    // six covers on one row, nothing hovered, no setup hint (the demo has a provider)
    win.setContentSize(1760, 900); await sleep(600);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 1750, y: 890 });
    await js(`document.activeElement?.blur?.(); [...document.querySelectorAll('#library *')].filter(e => e.children.length === 0 && /API key/.test(e.textContent)).forEach(e => e.style.visibility = 'hidden')`);
    await sleep(1000); await shot('shelf');
    win.setContentSize(1440, 900); await sleep(600);

    await js(`[...document.querySelectorAll('#books .book')].find(b => b.getAttribute('aria-label').startsWith('The Salt Archive')).click()`); await sleep(1800);
    await calm(); await shot('scene-card');

    await js(`window.__amanuensis.S.book.notes = []; window.__amanuensis.showBreadcrumb()`); await calm(); await shot('editor');

    await js(`document.querySelector('#transcript-btn').click()`); await sleep(900); await calm(); await shot('transcript');
    await js(`document.querySelector('#transcript-btn').click()`); await sleep(600);

    await js(`document.body.classList.add('recording'); document.querySelector('#rec').style.setProperty('--lvl', '0.55'); document.querySelector('#rec-time').textContent = '4:12'; document.querySelector('#meter i').style.width = '58%'`);
    await shot('recording');
    await js(`document.body.classList.remove('recording')`);

    // put the book away, mid-sentence
    await js(`(() => { const t = document.querySelector('#text'); t.insertAdjacentHTML('beforeend', '<p>Somewhere below, the tide turned and'); t.dispatchEvent(new Event('input'));
      const A = window.__amanuensis; A.placeCaretAt(A.chapterPlain().length); A.rememberPosition(); })()`);
    await sleep(300);
    await js(`window.__amanuensis.putAway()`); await sleep(900);
    await js(`document.querySelector('#crumb-scene').value = 'Leif corners Sable on the third floor'; document.querySelector('#crumb-question').value = 'What would make her give back the sword?'`);
    await shot('put-away');
    await js(`document.querySelector('#crumb-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(500);

    /* ---------- graphics, drawn in the app so they use its fonts and cover engine ---------- */
    const img = (n) => 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, n + '.png')).toString('base64');
    const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.png')).toString('base64');
    const metas = books.map((b) => ({ id: b.id, title: b.title, author: AUTHOR, coverSeed: b.id }));

    // the cover strip
    await js(`(async () => {
      await window.Covers.ready;
      const metas = ${JSON.stringify(metas)};
      for (const m of metas) await document.fonts.load('400 20px "NEO Anton"', m.title);
      const W = 300, H = 433, G = 28, P = 40;
      const c = document.createElement('canvas'); c.width = P * 2 + metas.length * W + (metas.length - 1) * G; c.height = P * 2 + H;
      const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
      metas.forEach((m, i) => {
        const cv = window.Covers.renderFull(m, { width: W, height: H });
        x.save(); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 30; x.shadowOffsetY = 14;
        x.drawImage(cv, P + i * (W + G), P); x.restore();
      });
      window.__strip = c.toDataURL('image/png');
    })()`);
    fs.writeFileSync(path.join(OUT, 'covers.png'), Buffer.from((await js(`window.__strip`)).split(',')[1], 'base64'));
    console.log('wrote covers');

    // the banner: replace the page with a composition, then capture it
    win.setContentSize(1600, 800); await sleep(500);
    await js(`(() => {
      document.body.className = ''; document.body.innerHTML = '';
      const s = document.createElement('style');
      s.textContent = \`
        html, body { margin: 0; background: #000; overflow: hidden; }
        .ban { position: fixed; inset: 0; display: grid; grid-template-columns: 560px 1fr; align-items: center; padding: 0 0 0 90px;
          background: radial-gradient(1200px 700px at 78% 40%, #1a1714 0%, #000 62%); }
        .copy { display: flex; flex-direction: column; gap: 22px; color: #f1eee7; }
        .icon { width: 116px; height: 116px; margin-left: -10px; }
        .name { font: 400 76px/1 'Amanuensis Serif', serif; letter-spacing: -0.01em; }
        .name i { font-style: normal; color: oklch(0.64 0.19 22); }
        .tag { font: italic 30px/1.3 'Amanuensis Serif', serif; color: #c9c5bc; max-width: 15em; text-wrap: balance; }
        .pts { font: 16px/1.7 -apple-system, system-ui, sans-serif; color: #8a867e; letter-spacing: .01em; }
        .shot { position: relative; height: 640px; }
        .win { position: absolute; left: 20px; top: 0; width: 1100px; border-radius: 12px; overflow: hidden; border: 1px solid #2a2724;
          box-shadow: 0 30px 80px rgba(0,0,0,.7); background: #000; }
        .bar { height: 30px; background: #141210; display: flex; gap: 8px; align-items: center; padding-left: 14px; }
        .bar i { width: 12px; height: 12px; border-radius: 50%; background: #3a3632; display: block; }
        .win img { display: block; width: 100%; }\`;
      document.head.appendChild(s);
      document.body.insertAdjacentHTML('beforeend', \`<div class="ban">
        <div class="copy">
          <img class="icon" src="${icon}">
          <div class="name">Amanuensis<i>.</i></div>
          <div class="tag">Speak your novel. Keep every word.</div>
          <div class="pts">Dictation-first writing for macOS<br>Formatting that can never rewrite you<br>Bring your own key · Local files · No account</div>
        </div>
        <div class="shot"><div class="win"><div class="bar"><i></i><i></i><i></i></div><img src="${img('editor')}"></div></div>
      </div>\`);
    })()`);
    await sleep(1500);
    fs.writeFileSync(path.join(OUT, 'banner.png'), (await win.webContents.capturePage()).toPNG());
    console.log('wrote banner');
  } catch (e) { console.error(e); app.exit(1); return; }
  app.exit(0);
});
