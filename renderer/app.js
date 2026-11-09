/* Amanuensis — the window. Disk and network go through window.amanuensis (preload.js). */
'use strict';
const D = window.amanuensis;
const F = window.AmanuensisFormat;
const H = window.AmanuensisHabits;
const $ = (s) => document.querySelector(s);

/* =============================== STATE =============================== */

const S = {
  settings: null, keys: {},
  book: null,            // { id, title, author, chapters: [{id,title,words}], terms }
  ch: null,              // current chapter meta
  dict: { version: 1, segments: [] },
  dirty: false, dictDirty: false,
  rec: null,             // { session, ctx, stream, node, started, timer, import }
  segs: new Map(),       // live records by id (current chapter + in flight)
  anchor: null,          // where the next dictated words go
  sessionWords: 0,
};
const textEl = $('#text'), titleEl = $('#ch-title');

/* =============================== HELPERS =============================== */

function toast(msg, err, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg; t.className = err ? 'err' : ''; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms);
}
function status(msg, err) { const s = $('#status'); s.textContent = msg || ''; s.className = err ? 'err' : 'dim'; s.title = msg || ''; }
function debounce(fn, ms) { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = () => { clearTimeout(t); return fn(); }; return d; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmtNum(n) { return n.toLocaleString('en-US'); }
function fmtClock(sec) { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return m + ':' + String(s).padStart(2, '0'); }
const ORD = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
function chapterWord(n) { return n <= 20 ? ORD[n] : String(n); }
function chapterHeading(k) { const c = S.book.chapters[k]; return 'Chapter ' + (k + 1) + (c.title ? ': ' + c.title : ''); }

/* =============================== BOOT =============================== */

async function boot() {
  document.execCommand('defaultParagraphSeparator', false, 'p');
  S.settings = await D.settings();
  S.keys = await D.keyStatus();
  applyTextSize();
  document.body.classList.toggle('quiet-numbers', S.settings.quietNumbers !== false);
  wire();
  updateReady();
  const last = S.settings.lastBook;
  const books = await D.listBooks();
  if (last && books.some((b) => b.id === last)) await openBook(last);
  else showLibrary(books);
}

function applyTextSize() { document.documentElement.style.setProperty('--text-size', (S.settings.textSize || 21) + 'px'); }

/* =============================== LIBRARY =============================== */

async function showLibrary(books) {
  endSession('leave');
  window.Mastery?.bookLeaving();
  await flushSave();
  if (S.rec) await stopRecording();
  S.book = null; S.ch = null;
  $('#editor').hidden = true; $('#library').hidden = false;
  books = books || await D.listBooks();
  const shelf = $('#books');
  shelf.innerHTML = '';
  await Promise.race([window.Covers.ready, new Promise((r) => setTimeout(r, 1500))]);
  for (const b of books) shelf.appendChild(bookTile(b));
  const add = document.createElement('div');
  add.className = 'book-wrap';
  add.innerHTML = `<div class="cover-slot"><button class="book new-book" id="new-book" title="New book (⇧⌘N)" aria-label="New book">+</button></div><div class="b-meta"><span class="b-name">New book</span></div>`;
  add.querySelector('#new-book').onclick = newBookForm;
  shelf.appendChild(add);
  $('#lib-count').textContent = books.length ? books.length + (books.length === 1 ? ' book' : ' books') : '';
  const needsKey = !Object.values(S.keys).some(Boolean);
  $('#lib-hint').textContent = !books.length
    ? 'Start a book. Then press Record and talk; your words appear on the page as manuscript prose.'
    : needsKey ? 'Add a transcription API key in Settings before you dictate.' : '';
}

/* ---------- covers (generator adapted from NEO by Hugh Howey, MIT) ---------- */

function coverMeta(b) { return { id: b.id, title: b.title, author: b.author, coverSeed: b.coverSeed || b.id }; }

function dressCover(el, b) { window.Covers.dress(el, window.Covers.plan(coverMeta(b))); }

function bookTile(b) {
  const wrap = document.createElement('div');
  wrap.className = 'book-wrap';
  wrap.innerHTML = `<div class="cover-slot"><div class="book" role="button" tabindex="0">
      <div class="b-text"><div class="b-title"></div><div class="b-author"></div></div>
      <button class="b-refresh" title="New cover" aria-label="New cover">&#8635;</button>
    </div></div>
    <div class="b-meta"><span class="b-words"></span></div>`;
  const el = wrap.querySelector('.book');
  el.querySelector('.b-author').textContent = b.author || '';
  el.setAttribute('aria-label', b.title + (b.author ? ' by ' + b.author : ''));
  try { dressCover(el, b); } catch (e) { console.error('cover', e); }
  wrap.querySelector('.b-words').textContent = fmtNum(b.words) + ' words';
  el.onclick = (e) => { if (!e.target.closest('.b-refresh')) openBook(b.id); };
  el.onkeydown = (e) => { if (e.key === 'Enter') openBook(b.id); };
  el.querySelector('.b-refresh').onclick = (e) => { e.stopPropagation(); newCover(b, el); };
  el.oncontextmenu = async (e) => {
    e.preventDefault();
    const pick = await D.menu([{ id: 'open', label: 'Open' }, { id: 'cover', label: 'New Cover' }, { id: 'reveal', label: 'Show in Finder' }, { type: 'separator' }, { id: 'trash', label: 'Move to Trash…' }]);
    if (pick === 'open') openBook(b.id);
    if (pick === 'cover') newCover(b, el);
    if (pick === 'reveal') D.revealBook(b.id);
    if (pick === 'trash' && await D.deleteBook(b.id)) showLibrary();
  };
  return wrap;
}

async function newCover(b, el) {
  const old = b.coverSeed || b.id;
  b.coverSeed = b.id + ':' + Date.now().toString(36);
  try {
    await D.setCover(b.id, b.coverSeed);
    window.Covers.forget(old);
    el.classList.add('recovering');
    dressCover(el, b);
    setTimeout(() => el.classList.remove('recovering'), 260);
  } catch (e) { toast('Could not change the cover: ' + e.message, true); }
}

function newBookForm() {
  modal(`<h2>New book</h2>
    <label>Title</label><input type="text" id="nb-title" placeholder="Untitled">
    <label>Author</label><input type="text" id="nb-author" value="${esc(S.settings.lastAuthor || '')}">
    <div class="actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="nb-go">Create</button></div>`);
  const go = async () => {
    const title = $('#nb-title').value.trim() || 'Untitled';
    const author = $('#nb-author').value.trim();
    closeModal();
    S.settings = { ...S.settings, ...(await D.setSettings({ lastAuthor: author }).catch(() => ({}))) };
    const b = await D.createBook({ title, author });
    await openBook(b.id);
  };
  $('#nb-go').onclick = go;
  $('#nb-title').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  setTimeout(() => $('#nb-title').focus(), 30);
}

/* =============================== BOOK & CHAPTERS =============================== */

async function openBook(id) {
  if (S.book && S.book.id !== id) { endSession('leave'); window.Mastery?.bookLeaving(); }
  await flushSave();
  try { S.book = await D.openBook(id); } catch (e) { toast(e.message, true); return showLibrary(); }
  $('#library').hidden = true; $('#editor').hidden = false;
  $('#nav-book').textContent = S.book.title;
  document.title = S.book.title + ' — Amanuensis';
  updateLevelBtn();
  const last = S.book.lastChapter && S.book.chapters.find((c) => c.id === S.book.lastChapter);
  await openChapter((last || S.book.chapters[0]).id, { end: true });
  window.Mastery?.bookOpened();
}

function renderNav() {
  const ol = $('#chapters');
  ol.innerHTML = '';
  S.book.chapters.forEach((c, k) => {
    const li = document.createElement('li');
    li.className = c.id === S.ch?.id ? 'on' : '';
    li.draggable = true;
    li.dataset.id = c.id;
    li.innerHTML = `<span class="n">${k + 1}</span><span class="tt">${esc(c.title || 'Chapter ' + chapterWord(k + 1))}</span><span class="w">${c.words ? fmtNum(c.words) : ''}</span>`;
    li.onclick = () => openChapter(c.id);
    li.oncontextmenu = (e) => { e.preventDefault(); chapterMenu(c); };
    li.ondragstart = (e) => { e.dataTransfer.setData('text/x-chapter', c.id); e.dataTransfer.effectAllowed = 'move'; };
    li.ondragover = (e) => {
      if (!e.dataTransfer.types.includes('text/x-chapter')) return;
      e.preventDefault();
      const below = e.offsetY > li.offsetHeight / 2;
      li.classList.toggle('drop-below', below); li.classList.toggle('drop-above', !below);
    };
    li.ondragleave = () => li.classList.remove('drop-above', 'drop-below');
    li.ondrop = (e) => {
      e.preventDefault();
      const below = li.classList.contains('drop-below');
      li.classList.remove('drop-above', 'drop-below');
      const from = e.dataTransfer.getData('text/x-chapter');
      if (!from || from === c.id) return;
      const list = S.book.chapters;
      const moving = list.splice(list.findIndex((x) => x.id === from), 1)[0];
      list.splice(list.findIndex((x) => x.id === c.id) + (below ? 1 : 0), 0, moving);
      saveBookMeta(); renderNav(); renderChapterHead();
    };
    ol.appendChild(li);
  });
}

async function chapterMenu(c) {
  const k = S.book.chapters.indexOf(c);
  const pick = await D.menu([
    { id: 'open', label: 'Open' },
    { id: 'versions', label: 'Earlier Versions…' },
    { type: 'separator' },
    { id: 'delete', label: 'Delete Chapter…', enabled: S.book.chapters.length > 1 },
  ]);
  if (pick === 'open') openChapter(c.id);
  if (pick === 'versions') { if (S.ch.id !== c.id) await openChapter(c.id); versionsMenu(); }
  if (pick === 'delete') {
    const ok = await D.confirm({ message: `Delete “${c.title || 'Chapter ' + (k + 1)}”?`, detail: 'The chapter moves to this book’s trash folder, so the words stay on disk.', ok: 'Delete' });
    if (!ok) return;
    if (S.ch.id === c.id) await flushSave();
    await D.trashChapter(S.book.id, c.id);
    window.Mastery?.structure('chapter.trash', -(c.words || 0));
    S.book.chapters.splice(k, 1);
    await saveBookMeta();
    if (S.ch.id === c.id) { S.ch = null; await openChapter(S.book.chapters[Math.max(0, k - 1)].id, { end: true, noSave: true }); }
    else renderNav();
  }
}

async function versionsMenu() {
  const list = await D.history(S.book.id, S.ch.id);
  if (!list.length) return toast('No earlier versions of this chapter yet. Amanuensis keeps one every ten minutes while you work.');
  const pick = await D.menu(list.slice(0, 30).map((h) => ({ id: h.file, label: new Date(h.time).toLocaleString() + '  ·  ' + Math.round(h.size / 6) + ' words approx.' })));
  if (!pick) return;
  const ok = await D.confirm({ message: 'Restore this version?', detail: 'The chapter as it is now is saved as a version first, so you can come back to it.', ok: 'Restore' });
  if (!ok) return;
  await D.snapshotChapter(S.book.id, S.ch.id, serialize());
  const wordsBefore = S.ch.words || 0;
  setText(await D.readHistory(S.book.id, S.ch.id, pick));
  markDirty();
  window.Mastery?.structure('history.restore', (S.ch.words || 0) - wordsBefore);
  toast('Restored.');
}

async function newChapter({ after, dictating } = {}) {
  await flushSave();
  const id = await D.newId('c');
  const k = after ? S.book.chapters.findIndex((c) => c.id === after) + 1 : S.book.chapters.findIndex((c) => c.id === S.ch?.id) + 1 || S.book.chapters.length;
  S.book.chapters.splice(k, 0, { id, title: '', words: 0 });
  await D.writeChapter(S.book.id, id, '<p><br></p>');
  await saveBookMeta();
  await openChapter(id, { noSave: true, keepAnchor: dictating });
  if (!dictating) titleEl.focus();
  return id;
}

async function openChapter(id, opts = {}) {
  if (!opts.noSave) await flushSave();
  const ch = S.book.chapters.find((c) => c.id === id);
  if (!ch) return;
  S.ch = ch;
  const data = await D.readChapter(S.book.id, id);
  S.dict = data.dictation && Array.isArray(data.dictation.segments) ? data.dictation : { version: 1, segments: [] };
  for (const s of S.dict.segments) if (s.status === 'pending') { s.status = 'failed'; s.error = 'interrupted before it was transcribed'; }
  S.segs = new Map([...S.segs].filter(([, r]) => r.inflight));
  for (const s of S.dict.segments) if (!S.segs.has(s.id)) S.segs.set(s.id, s);
  setText(data.html);
  renderChapterHead();
  renderNav();
  updateCounts();
  renderDrawer();
  S.book.lastChapter = id;
  saveBookMeta();
  S.dirty = false;
  restorePosition(ch, opts);
  if (S.rec) placeAnchor(null);
  showBreadcrumb();
}

function renderCrumb() {
  const crumb = $('#crumbbar');
  if (!crumb || !S.book || !S.ch) return;
  const k = S.book.chapters.indexOf(S.ch);
  crumb.innerHTML = `<b>${esc(S.book.title)}</b> · Chapter ${chapterWord(k + 1)}${S.ch.title ? ' — ' + esc(S.ch.title) : ''}`;
}

function renderChapterHead() {
  const k = S.book.chapters.indexOf(S.ch);
  renderCrumb();
  $('#ch-num').textContent = 'Chapter ' + chapterWord(k + 1);
  if (titleEl.textContent !== S.ch.title) titleEl.textContent = S.ch.title || '';
}

const saveBookMeta = debounce(async () => {
  if (!S.book) return;
  const { id, ...meta } = S.book;
  await D.saveBook(id, meta).catch((e) => toast('Could not save the book: ' + e.message, true));
}, 300);

/* =============================== EDITOR CONTENT =============================== */

const ALLOWED = new Set(['P', 'SPAN', 'I', 'EM', 'B', 'STRONG', 'BR']);

function sanitize(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  const walk = (node) => {
    for (const c of [...node.childNodes]) {
      if (c.nodeType === 3) continue;
      if (c.nodeType !== 1) { c.remove(); continue; }
      walk(c);
      if (!ALLOWED.has(c.tagName)) {
        if (c.tagName === 'DIV' || /^H\d$/.test(c.tagName)) { const p = document.createElement('p'); p.append(...c.childNodes); c.replaceWith(p); }
        else c.replaceWith(...c.childNodes);
        continue;
      }
      for (const a of [...c.attributes]) {
        const keep = (c.tagName === 'SPAN' && a.name === 'data-seg') || (c.tagName === 'P' && (a.name === 'data-seg-p' || (a.name === 'class' && a.value === 'scene')));
        if (!keep) c.removeAttribute(a.name);
      }
      if (c.tagName === 'SPAN' && c.dataset.seg) c.className = 'dict';
      if (c.tagName === 'SPAN' && !c.dataset.seg) c.replaceWith(...c.childNodes);
    }
  };
  walk(tpl.content);
  // Loose text at the top level belongs in a paragraph.
  for (const c of [...tpl.content.childNodes]) {
    if (c.nodeType === 3 && !c.textContent.trim()) { c.remove(); continue; }
    if (c.nodeType === 3 || (c.nodeType === 1 && c.tagName !== 'P')) { const p = document.createElement('p'); c.replaceWith(p); p.appendChild(c); }
  }
  return tpl.content;
}

function setText(html) {
  textEl.replaceChildren(sanitize(html));
  ensureParagraph();
  refreshEmpty();
}
function ensureParagraph() {
  if (!textEl.querySelector('p')) textEl.innerHTML = '<p><br></p>';
}
function refreshEmpty() {
  const empty = !textEl.textContent.trim() && textEl.querySelectorAll('p').length <= 1 && !textEl.querySelector('span.dict');
  textEl.classList.toggle('empty', empty);
}

function serialize() {
  const c = textEl.cloneNode(true);
  c.querySelectorAll('.dict-anchor, .seg-marker').forEach((n) => n.remove());
  c.querySelectorAll('span.pending').forEach((n) => n.remove());
  c.querySelectorAll('span').forEach((s) => {
    if (!s.dataset.seg || !s.textContent) { s.replaceWith(...s.childNodes); return; }
    s.removeAttribute('class');
  });
  c.querySelectorAll('p').forEach((p) => { if (!p.textContent && !p.querySelector('br')) p.innerHTML = '<br>'; p.removeAttribute('style'); });
  return c.innerHTML;
}

function chapterWords() {
  let n = 0;
  for (const p of textEl.querySelectorAll('p:not(.scene)')) {
    let t = '';
    for (const node of p.childNodes) if (!(node.nodeType === 1 && node.classList?.contains('pending'))) t += node.textContent + ' ';
    n += F.countWords(t);
  }
  return n;
}

function updateCounts() {
  if (!S.ch) return;
  const w = chapterWords();
  S.ch.words = w;
  const total = S.book.chapters.reduce((s, c) => s + (c.words || 0), 0);
  $('#wc-chapter').textContent = fmtNum(w) + ' words';
  $('#wc-book').textContent = fmtNum(total) + ' in book';
  $('#wc-session').textContent = S.sessionWords ? '+' + fmtNum(S.sessionWords) + ' dictated' : '';
  const li = $(`#chapters li[data-id="${S.ch.id}"] .w`);
  if (li) li.textContent = w ? fmtNum(w) : '';
}

/* =============================== SAVING =============================== */

function markDirty() { S.dirty = true; refreshEmpty(); updateCounts(); autosave(); }
function markDictDirty() { S.dictDirty = true; autosave(); }

const autosave = debounce(() => save(), 900);
let saving = Promise.resolve();

function save(opts = {}) {
  saving = saving.then(async () => {
    if (!S.book || !S.ch) return;
    const bookId = S.book.id, ch = S.ch;
    try {
      if (S.dirty || opts.force) {
        S.dirty = false;
        await D.writeChapter(bookId, ch.id, serialize(), opts);
        saveBookMeta();
      }
      if (S.dictDirty) {
        S.dictDirty = false;
        await D.writeDictation(bookId, ch.id, { version: 1, segments: S.dict.segments.map(stripRecord) });
      }
      if (!S.rec) status('');
    } catch (e) {
      S.dirty = true;
      status('Not saved: ' + e.message, true);
    }
  });
  return saving;
}
function stripRecord(r) { const { inflight, ...rest } = r; return rest; }
async function flushSave() { rememberPosition(); autosave.flush(); await saving; await saveBookMeta.flush(); }

/* =============================== TYPING =============================== */

function caretRange() {
  const sel = getSelection();
  if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  return textEl.contains(r.startContainer) ? r : null;
}
function charBeforeCaret(n = 1) {
  const r = caretRange();
  if (!r || !r.collapsed) return '';
  const pre = document.createRange();
  const p = r.startContainer.nodeType === 1 && r.startContainer.tagName === 'P' ? r.startContainer : r.startContainer.parentElement?.closest('p');
  if (!p) return '';
  pre.setStart(p, 0); pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().slice(-n);
}
function placeCaretAtEnd() {
  const last = textEl.querySelector('p:last-of-type') || textEl;
  const r = document.createRange();
  r.selectNodeContents(last); r.collapse(false);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  textEl.focus({ preventScroll: true });
}

textEl.addEventListener('beforeinput', (e) => {
  if (e.inputType !== 'insertText' || !e.data) return;
  const prev = charBeforeCaret(1);
  const opening = !prev || /[\s(\[{—–-]/.test(prev);
  if (e.data === '"') { e.preventDefault(); document.execCommand('insertText', false, opening ? '“' : '”'); }
  else if (e.data === "'") { e.preventDefault(); document.execCommand('insertText', false, opening ? '‘' : '’'); }
  else if (e.data === '-' && prev === '-') { e.preventDefault(); document.execCommand('delete'); document.execCommand('insertText', false, '—'); }
  else if (e.data === '.' && charBeforeCaret(2) === '..') { e.preventDefault(); document.execCommand('delete'); document.execCommand('delete'); document.execCommand('insertText', false, '…'); }
});
textEl.addEventListener('input', () => {
  if (!textEl.firstElementChild) ensureParagraph();
  for (const d of textEl.querySelectorAll(':scope > div')) { const p = document.createElement('p'); p.append(...d.childNodes); d.replaceWith(p); }
  const wordsBefore = S.ch ? S.ch.words || 0 : 0;
  markDirty();
  window.Mastery?.typed((S.ch ? S.ch.words || 0 : 0) - wordsBefore, S.pasting);
  noteTyping();
});
textEl.addEventListener('paste', (e) => {
  e.preventDefault();
  const t = (e.clipboardData.getData('text/plain') || '').replace(/\r\n?/g, '\n');
  const paras = t.split(/\n\s*\n|\n/).map((s) => s.trim());
  S.pasting = true;
  try {
    if (paras.length <= 1) document.execCommand('insertText', false, t);
    else document.execCommand('insertHTML', false, paras.map((p) => esc(p)).join('<br>').replace(/<br>/g, '</p><p>'));
  } finally { S.pasting = false; }
});
textEl.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') { e.preventDefault(); }
});
textEl.addEventListener('cut', () => { S.pasting = true; setTimeout(() => { S.pasting = false; }, 0); });
textEl.addEventListener('mouseup', () => { if (S.rec && !S.rec.import) placeAnchor(caretRange()); });
textEl.addEventListener('contextmenu', (e) => {
  const span = e.target.closest && e.target.closest('span[data-seg]');
  if (!span) return;
  e.preventDefault();
  openDrawer(span.dataset.seg);
});

titleEl.addEventListener('input', () => {
  S.ch.title = titleEl.textContent.replace(/\s+/g, ' ').trim();
  const li = $(`#chapters li[data-id="${S.ch.id}"] .tt`);
  if (li) li.textContent = S.ch.title || 'Chapter ' + chapterWord(S.book.chapters.indexOf(S.ch) + 1);
  renderCrumb();
  saveBookMeta();
});
titleEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); const p = textEl.querySelector('p'); const r = document.createRange(); r.setStart(p, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); textEl.focus(); }
});

let typingTimer;
function noteTyping() {
  document.body.classList.add('typing');
  clearTimeout(typingTimer);
}
document.addEventListener('mousemove', (e) => {
  if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) document.body.classList.remove('typing');
  const nav = $('#nav');
  if (!nav.classList.contains('pinned')) {
    if (e.clientX < 16 && e.clientY > 40) nav.classList.add('open');
    else if (e.clientX > 300) nav.classList.remove('open');
  }
});

function insertSceneBreak() {
  const r = caretRange();
  const p = r ? (r.startContainer.nodeType === 1 && r.startContainer.tagName === 'P' ? r.startContainer : r.startContainer.parentElement.closest('p')) : textEl.lastElementChild;
  const scene = document.createElement('p'); scene.className = 'scene'; scene.textContent = '* * *';
  const next = document.createElement('p'); next.innerHTML = '<br>';
  p.after(scene); scene.after(next);
  const nr = document.createRange(); nr.setStart(next, 0); nr.collapse(true);
  getSelection().removeAllRanges(); getSelection().addRange(nr);
  markDirty();
}

/* =============================== RECORDING =============================== */

async function toggleRecord() {
  if (S.rec) return stopRecording();
  return startRecording();
}

async function startRecording() {
  if (!S.ch || S.rec || document.body.classList.contains('starting')) return;
  activity('record');
  document.body.classList.add('starting');
  try {
    const constraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } };
    if (S.settings.micId) constraints.audio.deviceId = { exact: S.settings.micId };
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia(constraints); }
    catch (e) {
      if (S.settings.micId) { delete constraints.audio.deviceId; stream = await navigator.mediaDevices.getUserMedia(constraints); }
      else throw new Error('Microphone unavailable. Allow Amanuensis in System Settings → Privacy & Security → Microphone.');
    }
    const info = await D.startRecording({ bookId: S.book.id, mode: 'live', termsText: S.book.terms || '' })
      .catch((e) => { stream.getTracks().forEach((t) => t.stop()); throw e; });
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule('worklet.js');
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'pcm16k', { processorOptions: { rate: ctx.sampleRate } });
    const mute = ctx.createGain(); mute.gain.value = 0;
    src.connect(node); node.connect(mute); mute.connect(ctx.destination);
    node.port.onmessage = (e) => { D.sendAudio(e.data.pcm); meter(e.data.rms); };
    stream.getAudioTracks()[0].onended = () => { toast('The microphone disconnected. Recording stopped; everything so far is saved.', true, 6000); stopRecording(); };
    S.rec = { session: info.session, ctx, stream, node, started: Date.now(), streaming: info.streaming };
    S.rec.timer = setInterval(() => { $('#rec-time').textContent = fmtClock((Date.now() - S.rec.started) / 1000); }, 250);
    placeAnchor(caretRange());
    document.body.classList.add('recording');
    window.Mastery?.recording('start', info.session);
    status(providerLabel() + (info.streaming ? ' · live' : ''));
  } catch (e) {
    toast(e.message, true, 6000);
  } finally {
    document.body.classList.remove('starting');
  }
}

async function stopRecording() {
  const r = S.rec;
  if (!r) return;
  S.rec = null;
  clearInterval(r.timer);
  if (r.node) { r.node.port.onmessage = null; r.node.disconnect(); }
  r.stream?.getTracks().forEach((t) => t.stop());
  r.ctx?.close().catch(() => {});
  document.body.classList.remove('recording');
  document.body.classList.add('finishing');
  window.Mastery?.recording('stop', r.session);
  meter(0);
  await D.stopRecording().catch(() => {});
  S.finishing = r.session;
}

function meter(rms) {
  const w = Math.min(100, Math.sqrt(rms) * 260);
  $('#meter i').style.width = w + '%';
  $('#rec').style.setProperty('--lvl', Math.min(1, Math.sqrt(rms) * 2.6).toFixed(3));
}

function providerLabel() {
  const p = S.settings.providers[S.settings.provider];
  return p ? p.name.replace(/ \(.*\)$/, '') : S.settings.provider;
}

/* ----- where words go ----- */

function placeAnchor(range) {
  S.anchor?.remove();
  const a = document.createElement('span');
  a.className = 'dict-anchor';
  if (range && textEl.contains(range.startContainer)) {
    const r = range.cloneRange(); r.collapse(false);
    let host = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    const seg = host.closest && host.closest('span[data-seg]');
    if (seg) seg.after(a); // never split a dictated span
    else r.insertNode(a);
  } else {
    let p = textEl.lastElementChild;
    if (!p || p.classList.contains('scene')) { p = document.createElement('p'); textEl.appendChild(p); }
    p.querySelector(':scope > br:last-child')?.remove();
    p.appendChild(a);
  }
  S.anchor = a;
}
function anchor() {
  if (!S.anchor || !S.anchor.isConnected) placeAnchor(null);
  return S.anchor;
}

/* ----- recording events ----- */

D.onRecEvent(async (ev) => {
  if (ev.type === 'start') return segStart(ev);
  if (ev.type === 'interim') return segInterim(ev);
  if (ev.type === 'discard') return segDiscard(ev);
  if (ev.type === 'final') return segFinal(ev);
  if (ev.type === 'failed') return segFailed(ev);
  if (ev.type === 'status') return status(providerLabel() + ' · ' + ev.status, ev.status !== 'live');
  if (ev.type === 'error') { toast(ev.error, true, 7000); return stopRecording(); }
  if (ev.type === 'ended') {
    document.body.classList.remove('finishing');
    if (!S.rec) { S.anchor?.remove(); S.anchor = null; }
    if (S.importing && S.importing.session === ev.session) importDone(ev);
    status('');
    scheduleSessionEnd(AFTER_RECORDING_MS);
    showBreadcrumb();
    window.Mastery?.recordingSettled();
    await save({ force: false });
  }
});

function pendingSpan(id) {
  let span = textEl.querySelector(`span.pending[data-seg="${id}"]`);
  if (!span) {
    span = document.createElement('span');
    span.className = 'dict pending';
    span.dataset.seg = id;
    anchor().before(span);
  }
  return span;
}

function segStart(ev) {
  if (!S.ch) return;
  pendingSpan(ev.id);
  refreshEmpty();
  followCaret();
}
function segInterim(ev) {
  const span = pendingSpan(ev.id);
  const before = textBefore(span, 200);
  span.textContent = (before && !/\s$/.test(before) ? ' ' : '') + ev.text;
  followCaret();
}
function segDiscard(ev) {
  textEl.querySelector(`span.pending[data-seg="${ev.id}"]`)?.remove();
}

function segFailed(ev) {
  const span = pendingSpan(ev.id);
  span.className = 'dict failed pending';
  span.textContent = ' [not transcribed — open Transcript to retry] ';
  const rec = newRecord(ev);
  rec.status = 'failed'; rec.error = ev.error;
  S.dict.segments.push(rec); S.segs.set(rec.id, rec);
  markDictDirty(); renderDrawer();
  toast('One passage could not be transcribed (' + ev.error + '). The audio is saved; retry it from the Transcript.', true, 7000);
}

function newRecord(ev) {
  return {
    id: ev.id, session: ev.session, startSec: ev.startSec, endSec: ev.endSec, createdAt: Date.now(),
    provider: ev.provider, model: ev.model, ms: ev.ms, raw: ev.text || '', notes: [],
    level: S.settings.level, versions: {}, ai: null, applied: null, appliedText: '', status: 'pending',
  };
}

async function segFinal(ev) {
  if (!S.ch) return;
  // "Note to self, …" at the start of a passage becomes a note for next time, never manuscript.
  const noteText = S.settings.noteCommand && H.matchNoteCommand(ev.text);
  if (noteText) return saveVoiceNote(ev, noteText);
  const span = pendingSpan(ev.id);
  const rec = newRecord(ev);
  rec.inflight = true;
  const { pieces, notes } = F.preprocess(ev.text, { structCommands: S.settings.structCommands, punctCommands: S.settings.punctCommands, speechMs: ev.speechMs });
  rec.notes = notes;
  if (!pieces.length) {
    span.remove();
    if (ev.text.trim()) { rec.status = 'empty'; rec.inflight = false; S.dict.segments.push(rec); markDictDirty(); renderDrawer(); }
    return;
  }
  // A spoken "new chapter" splits the segment: what follows lands in a new chapter.
  const groups = [[]];
  for (const p of pieces) { if (p.type === 'chapter') groups.push([]); else groups[groups.length - 1].push(p); }
  rec.pieces = groups[0];
  await applyRecord(rec, span);
  for (let g = 1; g < groups.length; g++) {
    await newChapter({ dictating: true });
    placeAnchor(null);
    const r2 = newRecord({ ...ev, id: ev.id + '-' + g });
    r2.raw = '(continued after “new chapter”)'; r2.inflight = true; r2.pieces = groups[g];
    if (r2.pieces.length) await applyRecord(r2, pendingSpan(r2.id));
  }
}

/** First pass: local formatting, instantly. Second pass: AI, verified. */
async function applyRecord(rec, span) {
  rec.versions.verbatim = buildLocal(rec.pieces, 0, span);
  rec.versions.clean = buildLocal(rec.pieces, rec.level, span);
  S.dict.segments.push(rec); S.segs.set(rec.id, rec);
  const aiOn = S.settings.formatEnabled && S.keys.openrouter;
  renderVersion(rec, rec.level === 0 ? 'verbatim' : 'clean', { marker: span, pending: aiOn });
  S.sessionWords += F.countWords(rec.appliedText);
  updateCounts();
  markDictDirty(); markDirty(); renderDrawer();
  followCaret();

  if (aiOn) {
    const before = textBeforeSeg(rec.id, 900);
    const ai = await buildAi(rec.pieces, rec.level, before);
    rec.ai = ai.info;
    if (ai.blocks) {
      rec.versions.ai = ai.blocks;
      if (segEdited(rec)) rec.ai.note = 'kept your edits; AI version available';
      else renderVersion(rec, 'ai');
    } else {
      segSpans(rec.id).forEach((s) => s.classList.remove('local'));
      if (!ai.info.off && !ai.info.network) status('AI formatting rejected one passage: ' + ai.info.reason, true);
      if (ai.info.network) status('AI formatting unavailable: ' + ai.info.reason, true);
    }
  }
  rec.status = 'ok';
  rec.inflight = false;
  markDictDirty(); markDirty(); renderDrawer();
  window.Mastery?.dictationApplied(rec);
}

function buildLocal(pieces, level, span) {
  const blocks = [];
  let forceNew = false;
  let before = span ? textBefore(span, 300).split('\n').pop() : '';
  for (const p of pieces) {
    if (p.type === 'para') { forceNew = true; continue; }
    if (p.type === 'scene') { blocks.push({ k: 'scene' }); forceNew = true; continue; }
    const join = !forceNew && blocks.length === 0;
    const text = F.localFormat(p.text, level, { before: join ? before : '' });
    if (!text) continue;
    blocks.push({ k: 'p', join, text });
    before = text; forceNew = false;
  }
  return blocks;
}

async function buildAi(pieces, level, before) {
  const blocks = [];
  let forceNew = false, ctx = before, ms = 0;
  const removed = [];
  for (const p of pieces) {
    if (p.type === 'para') { forceNew = true; ctx += '\n\n'; continue; }
    if (p.type === 'scene') { blocks.push({ k: 'scene' }); forceNew = true; ctx += '\n\n* * *\n\n'; continue; }
    const r = await D.aiFormat({ text: p.text, before: ctx, level, names: S.book.terms || '' }).catch((e) => ({ ok: false, reason: e.message }));
    ms += r.ms || 0;
    if (!r.ok) return { blocks: null, info: { ok: false, reason: r.reason, off: r.off, network: r.network, ms, rejected: r.rejected } };
    removed.push(...(r.removed || []));
    r.paragraphs.forEach((t, k) => {
      const join = k === 0 && !forceNew && !r.newParagraph && blocks.length === 0;
      // A new paragraph always opens with a capital, whatever the model sent back.
      blocks.push({ k: 'p', join, text: join ? t : F.seamCase(t, { sentenceStart: true }) });
    });
    ctx += (r.newParagraph || forceNew ? '\n\n' : ' ') + r.paragraphs.join('\n\n');
    forceNew = false;
  }
  return { blocks, info: { ok: true, ms, removed, model: S.settings.formatModel } };
}

/* ----- the DOM: placing a segment, and taking it back out ----- */

function segSpans(id) { return [...textEl.querySelectorAll(`span[data-seg="${CSS.escape(id)}"]`)]; }
function segText(id) { return segSpans(id).filter((s) => !s.classList.contains('pending')).map((s) => s.textContent).join('\n'); }
function segEdited(rec) { return rec.appliedText && segText(rec.id) !== rec.appliedText; }

function paraOf(node) { return node.nodeType === 1 && node.tagName === 'P' ? node : node.parentElement.closest('p'); }

/** Plain text before `node`, across paragraphs, skipping words still being heard. */
function textBefore(node, max) {
  const p = paraOf(node);
  if (!p) return '';
  let cur = '';
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (node.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING || node.contains(t)) break;
    if (t.parentElement.closest('.pending')) continue;
    cur += t.textContent;
  }
  const parts = [cur];
  let len = cur.length, prev = p.previousElementSibling;
  while (prev && len < max) { parts.unshift(prev.textContent); len += prev.textContent.length; prev = prev.previousElementSibling; }
  return parts.join('\n\n').slice(-max);
}
function textBeforeSeg(id, max) { const s = segSpans(id)[0]; return s ? textBefore(s, max) : ''; }

function atParagraphStart(marker) {
  const p = paraOf(marker);
  for (const n of p.childNodes) {
    if (n === marker || n.contains?.(marker)) return true;
    if (n.nodeType === 1 && (n.tagName === 'BR' || n.classList.contains('pending') || n.classList.contains('dict-anchor'))) continue;
    if (n.textContent.trim()) return false;
  }
  return true;
}

function splitAt(marker, id) {
  const p = paraOf(marker);
  const np = document.createElement('p');
  np.dataset.segP = id;
  let n = marker;
  // Move the marker (and its inline ancestors' following content) into the new paragraph.
  while (n.parentElement !== p) n = n.parentElement;
  const moving = [];
  for (let x = n; x; x = x.nextSibling) moving.push(x);
  np.append(...moving);
  p.after(np);
  if (!p.childNodes.length) p.innerHTML = '<br>';
  return np;
}

function insertBlocks(marker, blocks, id, cls) {
  const made = [];
  blocks.forEach((b, k) => {
    if (b.k === 'scene') {
      const sc = document.createElement('p'); sc.className = 'scene'; sc.dataset.segP = id; sc.textContent = '* * *';
      if (atParagraphStart(marker)) paraOf(marker).before(sc);
      else { const np = splitAt(marker, id); np.before(sc); }
      return;
    }
    if (!(k === 0 && b.join) && !atParagraphStart(marker)) splitAt(marker, id);
    const p = paraOf(marker);
    p.querySelectorAll(':scope > br').forEach((br) => br.remove());
    const span = document.createElement('span');
    span.className = 'dict' + (cls ? ' ' + cls : '');
    span.dataset.seg = id;
    const before = atParagraphStart(marker) ? '' : textBefore(marker, 2).slice(-1);
    let t = b.text;
    if (before && !/\s/.test(before) && !/^[,.;:!?…—)”’]/.test(t)) t = ' ' + t;
    const after = nextText(marker);
    if (after && /^[\p{L}\p{N}“"(]/u.test(after)) t += ' ';
    span.textContent = t;
    marker.before(span);
    made.push(span);
  });
  return made;
}

function nextText(marker) {
  const walker = document.createTreeWalker(paraOf(marker), NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (marker.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING && !t.parentElement.closest('.pending')) return t.textContent;
  }
  return '';
}

/** Remove a segment's spans and the paragraphs it created; return a marker where it was. */
function removeSegment(id) {
  const spans = segSpans(id);
  if (!spans.length) return null;
  const marker = document.createElement('span');
  marker.className = 'seg-marker';
  spans[0].before(marker);
  spans.forEach((s) => s.remove());
  for (const p of [...textEl.querySelectorAll(`p[data-seg-p="${CSS.escape(id)}"]`)]) {
    if (p.classList.contains('scene')) { p.remove(); continue; }
    const prev = p.previousElementSibling;
    if (prev && prev.tagName === 'P' && !prev.classList.contains('scene')) {
      prev.querySelectorAll(':scope > br:last-child').forEach((br) => { if (p.textContent || p.querySelector('span')) br.remove(); });
      prev.append(...p.childNodes);
      p.remove();
    } else p.removeAttribute('data-seg-p');
  }
  return marker;
}

function renderVersion(rec, which, opts = {}) {
  const blocks = rec.versions[which];
  if (!blocks) return;
  const marker = opts.marker ? (() => { const m = document.createElement('span'); m.className = 'seg-marker'; opts.marker.before(m); opts.marker.remove(); return m; })() : removeSegment(rec.id);
  const hadAnchor = marker && S.anchor && !S.anchor.isConnected;
  if (!marker) {
    // The passage is no longer on the page (deleted by hand). Put it back where dictation is going.
    const m = document.createElement('span'); m.className = 'seg-marker'; anchor().before(m);
    return finish(m);
  }
  return finish(marker);

  function finish(m) {
    insertBlocks(m, blocks, rec.id, opts.pending ? 'local' : '');
    m.remove();
    if (hadAnchor) placeAnchor(null);
    rec.applied = which;
    rec.appliedText = segText(rec.id);
    textEl.querySelectorAll('p').forEach((p) => { if (!p.childNodes.length) p.innerHTML = '<br>'; });
    refreshEmpty();
  }
}

function followCaret() {
  const a = S.anchor;
  if (!a || !a.isConnected) return;
  const r = a.getBoundingClientRect(), sc = $('#scroller').getBoundingClientRect();
  if (r.bottom > sc.bottom - 140) $('#scroller').scrollBy({ top: r.bottom - sc.bottom + 220, behavior: 'smooth' });
}

/* =============================== TRANSCRIPT DRAWER =============================== */

function setDrawer(open) { $('#drawer').hidden = !open; document.body.classList.toggle('drawer-open', open); }

function openDrawer(focusId) {
  setDrawer(true);
  renderDrawer();
  if (focusId) {
    const li = $(`#segments li[data-id="${CSS.escape(focusId)}"]`);
    li?.scrollIntoView({ block: 'center' });
    li?.animate([{ background: '#1d1c18' }, { background: 'transparent' }], { duration: 1200 });
  } else $('#segments').scrollTop = 1e9;
}

function badgeFor(r) {
  if (r.status === 'failed') return ['Not transcribed', 'warn'];
  if (r.status === 'note') return ['Saved as a note', 'ok'];
  if (r.status === 'empty') return ['No speech kept', ''];
  if (r.status === 'pending') return ['Formatting…', ''];
  if (r.applied === 'ai') return ['AI formatted · verified', 'ok'];
  if (r.ai && !r.ai.ok && !r.ai.off) return ['AI rejected: ' + r.ai.reason, 'warn'];
  if (r.applied === 'verbatim') return ['Verbatim', ''];
  return ['Cleaned locally', ''];
}

function renderDrawer() {
  if ($('#drawer').hidden) return;
  const ol = $('#segments');
  const atBottom = ol.scrollTop + ol.clientHeight >= ol.scrollHeight - 30;
  ol.innerHTML = '';
  if (!S.dict.segments.length) { ol.innerHTML = '<li class="dim">Nothing dictated in this chapter yet.</li>'; return; }
  for (const r of S.dict.segments) {
    const li = document.createElement('li');
    li.dataset.id = r.id;
    const [badge, cls] = badgeFor(r);
    const when = new Date(r.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const edited = r.status === 'ok' && segEdited(r);
    const btn = (v, label) => `<button data-v="${v}" class="${r.applied === v ? 'on' : ''}" ${r.versions?.[v] ? '' : 'disabled'}>${label}</button>`;
    li.innerHTML = `<div class="meta"><span>${when}</span><span>${esc(r.provider || '')}${r.ms ? ' · ' + r.ms + ' ms' : ''}</span><span class="badge ${cls}">${esc(badge)}</span>${edited ? '<span class="badge">edited by you</span>' : ''}</div>
      <div class="raw" title="Show on the page">${esc(r.raw || '(no transcript)')}</div>
      ${r.notes?.length ? `<div class="note">${esc(r.notes.join('; '))}</div>` : ''}
      ${r.ai?.removed?.length ? `<div class="note">AI removed: ${esc(r.ai.removed.join(' · '))}</div>` : ''}
      ${r.error ? `<div class="note">${esc(r.error)}</div>` : ''}
      <div class="acts">${r.status === 'failed' ? '<button data-a="retry">Retry transcription</button>' : r.status === 'note' ? '' : btn('verbatim', 'Verbatim') + btn('clean', 'Cleaned') + btn('ai', 'AI')}
        ${r.status === 'ok' && S.settings.formatEnabled ? '<button data-a="reformat">Re-run AI</button>' : ''}
        ${r.session ? '<button data-a="play">Listen</button>' : ''}</div>`;
    li.querySelector('.raw').onclick = () => flashSeg(r.id);
    li.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => switchVersion(r, b.dataset.v)));
    li.querySelector('[data-a="retry"]')?.addEventListener('click', () => retrySeg(r));
    li.querySelector('[data-a="reformat"]')?.addEventListener('click', () => reformat(r));
    li.querySelector('[data-a="play"]')?.addEventListener('click', () => play(r));
    ol.appendChild(li);
  }
  if (atBottom) ol.scrollTop = 1e9;
}

function flashSeg(id) {
  const spans = segSpans(id);
  if (!spans.length) return toast('That passage is no longer on the page. Choose a version to put it back.');
  spans[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
  spans.forEach((s) => { s.classList.add('flash'); setTimeout(() => s.classList.remove('flash'), 1400); });
}

async function switchVersion(r, which) {
  if (!r.versions?.[which] || r.applied === which && !segEdited(r)) return;
  if (segEdited(r)) {
    const ok = await D.confirm({ message: 'Replace your edits to this passage?', detail: 'The chapter as it is now is saved as an earlier version first (chapter right-click → Earlier Versions).', ok: 'Replace' });
    if (!ok) return;
    await D.snapshotChapter(S.book.id, S.ch.id, serialize());
  }
  const wordsBefore = F.countWords(segText(r.id));
  renderVersion(r, which);
  window.Mastery?.revised(r, 'switch', F.countWords(segText(r.id)) - wordsBefore);
  markDirty(); markDictDirty(); renderDrawer(); flashSeg(r.id);
}

async function reformat(r) {
  const pieces = r.pieces || F.preprocess(r.raw, { structCommands: S.settings.structCommands, punctCommands: S.settings.punctCommands }).pieces.filter((p) => p.type !== 'chapter');
  status('Formatting…');
  const ai = await buildAi(pieces, S.settings.level, textBeforeSeg(r.id, 900));
  r.ai = ai.info;
  if (ai.blocks) { r.versions.ai = ai.blocks; await switchVersion(r, 'ai'); status(''); }
  else { status('AI formatting rejected: ' + ai.info.reason, true); renderDrawer(); }
  markDictDirty();
}

async function retrySeg(r) {
  status('Retrying…');
  try {
    const out = await D.retrySegment({ bookId: S.book.id, session: r.session, startSec: r.startSec, endSec: r.endSec });
    r.raw = out.text; r.ms = out.ms; r.error = '';
    const { pieces, notes } = F.preprocess(out.text, { structCommands: S.settings.structCommands, punctCommands: S.settings.punctCommands });
    r.notes = notes; r.pieces = pieces.filter((p) => p.type !== 'chapter');
    segSpans(r.id).slice(1).forEach((s) => s.remove());
    const marker = segSpans(r.id)[0] || pendingSpan(r.id);
    r.level = S.settings.level;
    r.versions = { verbatim: buildLocal(r.pieces, 0, marker), clean: buildLocal(r.pieces, r.level, marker) };
    renderVersion(r, r.level === 0 ? 'verbatim' : 'clean', { marker });
    r.status = 'ok';
    window.Mastery?.dictationApplied(r, { retried: true });
    if (!S.rec) { S.anchor?.remove(); S.anchor = null; }
    markDirty(); markDictDirty(); renderDrawer();
    if (S.settings.formatEnabled && S.keys.openrouter) await reformat(r);
    status('');
  } catch (e) { status('Retry failed: ' + e.message, true); }
}

async function play(r) {
  const url = await D.audioUrl({ bookId: S.book.id, session: r.session });
  const a = $('#player');
  a.src = url + '#t=' + Math.max(0, r.startSec - 0.2).toFixed(2) + ',' + (r.endSec + 0.3).toFixed(2);
  a.play().catch((e) => toast('Could not play the audio: ' + e.message, true));
}

/* =============================== IMPORT A RECORDING =============================== */

async function importAudio() {
  if (S.rec || S.importing) return toast('Finish the current recording first.');
  let file;
  try { file = await D.openAudio(); } catch (e) { return toast(e.message, true); }
  if (!file) return;
  activity('import');
  status('Decoding ' + file.name + '…');
  try {
    const ac = new AudioContext();
    const decoded = await ac.decodeAudioData(file.data);
    ac.close();
    const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
    const pcmF = (await off.startRendering()).getChannelData(0);
    const info = await D.startRecording({ bookId: S.book.id, mode: 'import', termsText: S.book.terms || '' });
    S.importing = { session: info.session };
    placeAnchor(caretRange());
    document.body.classList.add('finishing');
    const CH = 16000; // 1 s per message
    for (let i = 0; i < pcmF.length; i += CH) {
      const f = pcmF.subarray(i, i + CH);
      const a = new Int16Array(f.length);
      for (let k = 0; k < f.length; k++) { const v = Math.max(-1, Math.min(1, f[k])); a[k] = v < 0 ? v * 0x8000 : v * 0x7fff; }
      D.sendAudio(a.buffer);
      if (i % (CH * 30) === 0) { status('Importing ' + file.name + ' · ' + Math.round((i / pcmF.length) * 100) + '%'); await new Promise((r) => setTimeout(r, 0)); }
    }
    status('Transcribing ' + file.name + '…');
    await D.stopRecording();
  } catch (e) {
    S.importing = null;
    document.body.classList.remove('finishing');
    toast('Could not import that file: ' + e.message, true, 6000);
    status('');
  }
}
function importDone() { S.importing = null; toast('Recording imported.'); }

/* =============================== SETTINGS =============================== */

function modal(html) {
  $('#modal-box').innerHTML = html;
  $('#modal').hidden = false;
  $('#modal-box').querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
}
function closeModal() { $('#modal').hidden = true; $('#modal-box').innerHTML = ''; updateReady(); }
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });

async function openSettings() {
  S.settings = await D.settings();
  S.keys = await D.keyStatus();
  const s = S.settings, P = s.providers;
  const keyRow = (name, label) => `<label>${label}</label><div class="row"><input type="password" data-key="${name}" placeholder="${S.keys[name] ? 'Saved in your Keychain — paste to replace' : 'Paste key'}" autocomplete="off"><button class="btn" data-test="${name}">Test</button><span class="keystate ${S.keys[name] ? 'ok' : ''}" data-state="${name}">${S.keys[name] ? 'saved' : ''}</span></div>`;
  const book = S.book;
  modal(`<h2>Settings</h2>
    <h3>Transcription</h3>
    <label>Service</label>
    <select id="st-provider">${Object.entries(P).map(([k, p]) => `<option value="${k}" ${k === s.provider ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    <label>Model</label><input type="text" id="st-model" list="st-models" value="${esc(s.model)}" placeholder="${esc(P[s.provider].models[0])}"><datalist id="st-models"></datalist>
    <div id="st-custom"><label>Base URL (OpenAI-compatible, e.g. a local Whisper server)</label><input type="text" id="st-base" value="${esc(s.baseUrl)}" placeholder="http://localhost:8000/v1"></div>
    <div id="st-key"></div>
    <label>Language</label><input type="text" id="st-lang" value="${esc(s.language)}" placeholder="en">
    <label>Pause that ends a passage: <span id="st-pause-v">${s.pauseMs}</span> ms</label>
    <input type="range" id="st-pause" min="400" max="1600" step="50" value="${s.pauseMs}">
    <p class="help">Shorter feels faster. Longer keeps a slow thinker’s sentence in one piece.</p>
    <label>Microphone</label><select id="st-mic"><option value="">System default</option></select>

    <h3>Formatting</h3>
    <label class="check"><input type="checkbox" id="st-ai" ${s.formatEnabled ? 'checked' : ''}> AI formatting through OpenRouter</label>
    <p class="help">The AI may only add punctuation, quotation marks, capitals and paragraph breaks. Every result is checked word for word against what you said; anything that adds or changes a word is thrown out and the local formatting stays.</p>
    ${keyRow('openrouter', 'OpenRouter API key')}
    <label>Formatting model</label><div class="row"><input type="text" id="st-fmodel" list="st-fmodels" value="${esc(s.formatModel)}"><button class="btn" id="st-load">Load list</button></div><datalist id="st-fmodels"></datalist>
    <label>Cleanup</label>
    <input type="range" id="st-level" min="0" max="3" step="1" value="${s.level}">
    <div class="levels">${F.LEVELS.map((l, k) => `<span data-l="${k}" class="${k === s.level ? 'on' : ''}">${l}</span>`).join('')}</div>
    <p class="help" id="st-level-help">${F.LEVEL_HELP[s.level]}</p>
    <label>Dialogue quotes</label>
    <select id="st-quotes"><option value="double" ${s.quoteStyle !== 'single' ? 'selected' : ''}>“Double” (US)</option><option value="single" ${s.quoteStyle === 'single' ? 'selected' : ''}>‘Single’ (UK)</option></select>
    <label class="check"><input type="checkbox" id="st-struct" ${s.structCommands ? 'checked' : ''}> Spoken commands: “new paragraph”, “scene break”, “new chapter”</label>
    <label class="check"><input type="checkbox" id="st-punct" ${s.punctCommands ? 'checked' : ''}> Spoken punctuation: “comma”, “period”, “quote … end quote”</label>

    <h3>Writing</h3>
    <label class="check"><input type="checkbox" id="st-quiet-numbers" ${s.quietNumbers !== false ? 'checked' : ''}> Fade counts and sprint timer while composing</label>
    <p class="help">Move to the bottom bar to see them. Recording controls and errors stay visible.</p>

    <h3>Sessions</h3>
    <label class="check"><input type="checkbox" id="st-ack" ${s.ackEnabled !== false ? 'checked' : ''}> When you pause, a quiet line saying what the session added</label>
    <label class="check"><input type="checkbox" id="st-notecmd" ${s.noteCommand ? 'checked' : ''}> Voice notes: a passage that starts “note to self” becomes a note, not manuscript</label>
    <p class="help">Notes for next time (⌘J) wait at the top of the page when you come back. They are stored with the book and never enter the manuscript.</p>

    ${book ? `<h3>This book</h3>
    <label>Title</label><input type="text" id="st-title" value="${esc(book.title)}">
    <label>Author</label><input type="text" id="st-author" value="${esc(book.author || '')}">
    <label>Names and terms</label><textarea id="st-terms" placeholder="One per line: character names, places, invented words">${esc(book.terms || '')}</textarea>
    <p class="help">Sent to the transcriber as spelling hints, so “Montgomery” and “Kael’thar” come out right. Keep it short.</p>` : ''}

    <h3>Manuscript export</h3>
    <label>Contact lines for the title page</label><textarea id="st-contact" placeholder="Address, email, phone">${esc(s.contact || '')}</textarea>
    <label>Font</label><select id="st-font"><option value="times" ${s.exportFont !== 'courier' ? 'selected' : ''}>Times New Roman</option><option value="courier" ${s.exportFont === 'courier' ? 'selected' : ''}>Courier New</option></select>

    ${window.Mastery ? window.Mastery.settingsHtml() : ''}

    <h3>Library</h3>
    <div class="row"><span class="dim" style="flex:1">${esc(s.libraryRoot)}</span><button class="btn" id="st-lib">Change…</button></div>
    <p class="help">API keys are encrypted with your macOS Keychain and never stored in the library folder.</p>
    <div class="actions"><button class="btn primary" data-close>Done</button></div>`);

  const provSel = $('#st-provider');
  const refreshProvider = () => {
    const p = provSel.value;
    $('#st-models').innerHTML = P[p].models.map((m) => `<option value="${esc(m)}">`).join('');
    $('#st-model').placeholder = P[p].models[0];
    $('#st-custom').hidden = p !== 'custom';
    const kn = P[p].keyName;
    $('#st-key').innerHTML = kn === 'openrouter' ? '<p class="help">Uses the OpenRouter key below.</p>' : keyRow(kn, P[p].name.replace(/ \(.*\)$/, '') + ' API key' + (p === 'custom' ? ' (optional)' : ''));
    wireKeys($('#st-key'));
  };
  provSel.onchange = async () => { $('#st-model').value = ''; await set({ provider: provSel.value, model: '' }); refreshProvider(); };
  refreshProvider();
  wireKeys($('#modal-box'));

  const set = async (patch) => { S.settings = { ...S.settings, ...(await D.setSettings(patch)) }; updateLevelBtn(); };
  $('#st-model').onchange = (e) => set({ model: e.target.value.trim() });
  $('#st-base').onchange = (e) => set({ baseUrl: e.target.value.trim() });
  $('#st-lang').onchange = (e) => set({ language: e.target.value.trim() || 'en' });
  $('#st-pause').oninput = (e) => { $('#st-pause-v').textContent = e.target.value; };
  $('#st-pause').onchange = (e) => set({ pauseMs: +e.target.value });
  $('#st-ai').onchange = (e) => set({ formatEnabled: e.target.checked });
  $('#st-fmodel').onchange = (e) => set({ formatModel: e.target.value.trim() });
  $('#st-level').oninput = (e) => {
    const l = +e.target.value;
    $('#st-level-help').textContent = F.LEVEL_HELP[l];
    $('#modal-box').querySelectorAll('.levels span').forEach((x) => x.classList.toggle('on', +x.dataset.l === l));
    set({ level: l });
  };
  $('#st-quotes').onchange = (e) => set({ quoteStyle: e.target.value });
  $('#st-struct').onchange = (e) => set({ structCommands: e.target.checked });
  $('#st-punct').onchange = (e) => set({ punctCommands: e.target.checked });
  $('#st-quiet-numbers').onchange = async (e) => { await set({ quietNumbers: e.target.checked }); document.body.classList.toggle('quiet-numbers', S.settings.quietNumbers !== false); };
  $('#st-ack').onchange = (e) => set({ ackEnabled: e.target.checked });
  $('#st-notecmd').onchange = (e) => set({ noteCommand: e.target.checked });
  $('#st-contact').onchange = (e) => set({ contact: e.target.value });
  $('#st-font').onchange = (e) => set({ exportFont: e.target.value });
  $('#st-mic').onchange = (e) => set({ micId: e.target.value });
  $('#st-lib').onclick = async () => { const p = await D.chooseLibrary(); if (p) { closeModal(); await window.Mastery?.load(); showLibrary(); } };
  window.Mastery?.wireSettings();
  $('#st-load').onclick = async () => {
    try { const ids = await D.listModels(); $('#st-fmodels').innerHTML = ids.map((m) => `<option value="${esc(m)}">`).join(''); toast(ids.length + ' models loaded. Start typing in the model box.'); }
    catch (e) { toast(e.message, true); }
  };
  if (book) {
    $('#st-title').onchange = (e) => { book.title = e.target.value.trim() || 'Untitled'; $('#nav-book').textContent = book.title; renderCrumb(); saveBookMeta(); };
    $('#st-author').onchange = (e) => { book.author = e.target.value.trim(); saveBookMeta(); };
    $('#st-terms').onchange = (e) => { book.terms = e.target.value; saveBookMeta(); };
  }
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    $('#st-mic').innerHTML += devs.filter((d) => d.deviceId !== 'default').map((d) => `<option value="${esc(d.deviceId)}" ${d.deviceId === s.micId ? 'selected' : ''}>${esc(d.label || 'Microphone')}</option>`).join('');
  } catch {}
}

function wireKeys(root) {
  root.querySelectorAll('input[data-key]').forEach((inp) => {
    if (inp.dataset.wired) return; inp.dataset.wired = 1;
    inp.onchange = async () => {
      const name = inp.dataset.key, st = root.querySelector(`[data-state="${name}"]`);
      try {
        await D.setKey(name, inp.value);
        S.keys = await D.keyStatus();
        inp.value = ''; inp.placeholder = S.keys[name] ? 'Saved in your Keychain — paste to replace' : 'Paste key';
        st.textContent = S.keys[name] ? 'saved' : ''; st.className = 'keystate ' + (S.keys[name] ? 'ok' : '');
      } catch (e) { st.textContent = e.message; st.className = 'keystate bad'; }
    };
  });
  root.querySelectorAll('button[data-test]').forEach((b) => {
    if (b.dataset.wired) return; b.dataset.wired = 1;
    b.onclick = async () => {
      const name = b.dataset.test, st = root.querySelector(`[data-state="${name}"]`);
      const inp = root.querySelector(`input[data-key="${name}"]`);
      if (inp.value) await inp.onchange();
      st.textContent = 'testing…'; st.className = 'keystate';
      try { await D.testKey(name); st.textContent = 'works'; st.className = 'keystate ok'; }
      catch (e) { st.textContent = e.message.slice(0, 60); st.className = 'keystate bad'; st.title = e.message; }
    };
  });
}

function updateLevelBtn() { $('#level-btn').textContent = 'Cleanup: ' + (F.LEVELS[S.settings.level] || 'Light'); }

/** Is dictation ready to go? Tells the author before they speak, and takes them to the fix if not. */
function updateReady() {
  const el = $('#ready');
  if (!el || !S.settings) return;
  const p = S.settings.providers && S.settings.providers[S.settings.provider];
  const ok = S.settings.provider === 'custom' ? !!S.settings.baseUrl : !!(p && S.keys[p.keyName]);
  el.classList.toggle('ok', ok); el.classList.toggle('missing', !ok);
  el.querySelector('span').textContent = ok ? providerLabel() : 'Add a transcription key';
  el.title = ok ? providerLabel() + ' is ready. Click to change.' : 'Dictation needs a transcription service. Click to set one up.';
}

async function levelMenu() {
  const items = F.LEVELS.map((name, k) => ({ id: String(k), label: (k === S.settings.level ? '✓ ' : '    ') + name + ' — ' + F.LEVEL_HELP[k] }));
  const pick = await D.menu(items);
  if (pick != null) cycleLevel(+pick);
}
async function cycleLevel(l) {
  const level = l ?? ((S.settings.level + 1) % 4);
  S.settings = { ...S.settings, ...(await D.setSettings({ level })) };
  updateLevelBtn();
  toast('Cleanup: ' + F.LEVELS[level] + ' — ' + F.LEVEL_HELP[level]);
}

/* =============================== EXPORT =============================== */

async function exportBook(format) {
  if (!S.book) return toast('Open a book first.');
  await flushSave();
  const model = { title: S.book.title, author: S.book.author || '', chapters: [], words: 0 };
  for (let k = 0; k < S.book.chapters.length; k++) {
    const c = S.book.chapters[k];
    const { html } = await D.readChapter(S.book.id, c.id);
    const frag = sanitize(html);
    const paras = [];
    for (const p of frag.querySelectorAll('p')) {
      if (p.classList.contains('scene')) { paras.push({ scene: true }); continue; }
      const runs = [];
      const walk = (n, i, b) => {
        for (const c2 of n.childNodes) {
          if (c2.nodeType === 3) { if (c2.textContent) runs.push({ t: c2.textContent, i, b }); }
          else if (c2.tagName === 'BR') continue;
          else walk(c2, i || /^(I|EM)$/.test(c2.tagName), b || /^(B|STRONG)$/.test(c2.tagName));
        }
      };
      walk(p, false, false);
      const text = runs.map((r) => r.t).join('');
      if (!text.trim()) continue;
      if (runs.length) { runs[0].t = runs[0].t.replace(/^\s+/, ''); runs[runs.length - 1].t = runs[runs.length - 1].t.replace(/\s+$/, ''); }
      model.words += F.countWords(text);
      paras.push({ runs: runs.map((r) => ({ ...r, t: r.t.replace(/\s+/g, ' ') })) });
    }
    model.chapters.push({ heading: chapterHeading(k), paras });
  }
  try {
    const out = await D.exportBook({ format, model, bookId: S.book.id });
    if (out) toast('Exported.');
  } catch (e) { toast('Export failed: ' + e.message, true, 6000); }
}

/* =============================== FIND =============================== */

function openFind() {
  $('#find').hidden = false;
  const q = $('#find-q'); q.focus(); q.select();
}
$('#find-q').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { $('#find').hidden = true; textEl.focus(); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    const found = window.find(e.target.value, false, e.shiftKey, true, false, false, false);
    $('#find-n').textContent = found ? '' : 'not found';
  }
});

/* =============================== RE-ENTRY =============================== */
// Come back to exactly where you were: book, chapter, caret, scroll. Never the microphone.

function plainParas() { return [...textEl.querySelectorAll(':scope > p')]; }
function paraText(p) {
  let t = '';
  const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) if (!w.currentNode.parentElement.closest('.pending')) t += w.currentNode.textContent;
  return t;
}
function chapterPlain() { return plainParas().map(paraText).join('\n'); }

function caretOffset() {
  const r = caretRange();
  if (!r) return null;
  let off = 0;
  for (const p of plainParas()) {
    if (p === r.startContainer || p.contains(r.startContainer)) {
      const pre = document.createRange();
      pre.setStart(p, 0); pre.setEnd(r.startContainer, r.startOffset);
      return off + Math.min(pre.toString().length, paraText(p).length);
    }
    off += paraText(p).length + 1;
  }
  return null;
}

function rememberPosition() {
  if (!S.book || !S.ch || !textEl.isConnected) return;
  const text = chapterPlain();
  const off = caretOffset();
  const o = off != null ? off : S.ch.at ? H.resolvePosition(text, S.ch.at) : text.length;
  S.ch.at = H.capturePosition(text, o, $('#scroller').scrollTop);
}

function placeCaretAt(o) {
  let left = o;
  for (const p of plainParas()) {
    const len = paraText(p).length;
    if (left <= len) {
      const r = document.createRange();
      const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      let placed = false;
      while (w.nextNode()) {
        const t = w.currentNode;
        if (t.parentElement.closest('.pending')) continue;
        if (left <= t.textContent.length) { r.setStart(t, left); placed = true; break; }
        left -= t.textContent.length;
      }
      if (!placed) { r.selectNodeContents(p); r.collapse(false); }
      r.collapse(true);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      textEl.focus({ preventScroll: true });
      return r;
    }
    left -= len + 1;
  }
  placeCaretAtEnd();
  return null;
}

function restorePosition(ch, opts = {}) {
  const sc = $('#scroller');
  if (!ch.at) { sc.scrollTop = 0; if (opts.end) placeCaretAtEnd(); return; }
  const r = placeCaretAt(H.resolvePosition(chapterPlain(), ch.at));
  sc.scrollTop = Math.min(ch.at.scroll || 0, Math.max(0, sc.scrollHeight - sc.clientHeight));
  const rect = r && (r.getClientRects()[0] || r.startContainer.parentElement?.getBoundingClientRect());
  const box = sc.getBoundingClientRect();
  if (rect && rect.height && (rect.top < box.top + 40 || rect.bottom > box.bottom - 40)) sc.scrollTop += rect.top - box.top - box.height / 3;
}

const rememberSoon = debounce(() => { rememberPosition(); saveBookMeta(); }, 1500);
document.addEventListener('selectionchange', () => { if (S.ch && caretRange()) rememberSoon(); });
$('#scroller').addEventListener('scroll', () => { if (S.ch) rememberSoon(); }, { passive: true });

/* =============================== NOTES FOR NEXT TIME =============================== */
// Prospective-memory breadcrumbs. Stored in book.json beside the chapters, never in chapter text.

function showBreadcrumb() {
  const el = $('#breadcrumb');
  const n = S.book && S.ch ? H.noteToShow(S.book.notes, S.ch.id) : null;
  S.shownNote = n;
  if (!n) { el.hidden = true; return; }
  const k = S.book.chapters.findIndex((c) => c.id === n.chapterId);
  const where = el.querySelector('.bc-where');
  where.textContent = n.chapterId !== S.ch.id && k >= 0 ? 'Chapter ' + chapterWord(k + 1) + ' · ' : '';
  where.onclick = n.chapterId !== S.ch.id && k >= 0 ? () => openChapter(n.chapterId) : null;
  el.querySelector('.bc-text').textContent = n.text;
  el.hidden = false;
}

function addNote(text, chapterId = S.ch.id) {
  const now = Date.now();
  S.book.notes = S.book.notes || [];
  // A new note for a chapter supersedes the open one; the old one is kept, marked done.
  for (const n of S.book.notes) if (n.chapterId === chapterId && !n.dismissedAt) n.dismissedAt = now;
  const note = { id: 'n' + now.toString(36) + Math.random().toString(36).slice(2, 5), chapterId, text, created: now };
  S.book.notes.push(note);
  saveBookMeta();
  showBreadcrumb();
  return note;
}

function openNoteEditor(note) {
  const box = $('#crumb-edit'), input = $('#crumb-input');
  S.editingNote = note || null;
  input.value = note ? note.text : '';
  box.hidden = false;
  setTimeout(() => input.focus(), 0);
}
function closeNoteEditor(refocus = true) {
  $('#crumb-edit').hidden = true;
  S.editingNote = null;
  if (refocus && S.ch && S.ch.at) placeCaretAt(H.resolvePosition(chapterPlain(), S.ch.at));
}
$('#crumb-input').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') { e.preventDefault(); return closeNoteEditor(); }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const text = e.target.value.replace(/\s+/g, ' ').trim();
  if (S.editingNote) {
    if (text) S.editingNote.text = text;
    else S.book.notes = S.book.notes.filter((n) => n !== S.editingNote);
    saveBookMeta(); showBreadcrumb();
  } else if (text) addNote(text);
  closeNoteEditor();
});
$('#crumb-input').addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== $('#crumb-input')) closeNoteEditor(false); }, 150));
$('#breadcrumb').addEventListener('click', (e) => {
  const a = e.target.closest('[data-bc]')?.dataset.bc;
  const n = S.shownNote;
  if (!a || !n) return;
  if (a === 'edit') openNoteEditor(n);
  if (a === 'done') { n.dismissedAt = Date.now(); saveBookMeta(); showBreadcrumb(); }
  if (a === 'delete') { S.book.notes = S.book.notes.filter((x) => x !== n); saveBookMeta(); showBreadcrumb(); }
});

function saveVoiceNote(ev, text) {
  textEl.querySelector(`span.pending[data-seg="${CSS.escape(ev.id)}"]`)?.remove();
  addNote(text);
  const rec = newRecord(ev);
  rec.status = 'note';
  rec.notes = ['saved as a note for next time; not added to the manuscript'];
  S.dict.segments.push(rec);
  markDictDirty(); renderDrawer();
}

/* =============================== SESSIONS =============================== */
// A session runs from the first word added until the author steps away. At its end, one quiet line.

const SESSION_IDLE_MS = 5 * 60 * 1000;     // after typing
const AFTER_RECORDING_MS = 45 * 1000;      // after a take ends: stopping is a natural pause
let sessionTimer;

function countsNow() { return Object.fromEntries(S.book.chapters.map((c) => [c.id, c.words || 0])); }

function activity(kind = 'type') {
  window.Mastery?.activity(kind);
  hideAck();
  if (!S.book) return;
  if (!S.session || S.session.bookId !== S.book.id) S.session = { bookId: S.book.id, start: Date.now(), base: countsNow() };
  scheduleSessionEnd(SESSION_IDLE_MS);
}

function scheduleSessionEnd(ms) {
  clearTimeout(sessionTimer);
  if (!S.session) return;
  sessionTimer = setTimeout(() => (S.rec || S.importing ? scheduleSessionEnd(ms) : endSession('idle')), ms);
}

function endSession(reason) {
  clearTimeout(sessionTimer);
  const s = S.session;
  S.session = null;
  if (!s || !S.book || s.bookId !== S.book.id) return null;
  if (S.ch) updateCounts();
  const names = Object.fromEntries(S.book.chapters.map((c, k) => [c.id, 'Chapter ' + chapterWord(k + 1)]));
  const sum = H.summarize(s.base, countsNow(), names);
  if (sum || Date.now() - s.start > 60000) {
    S.book.sessions = S.book.sessions || [];
    S.book.sessions.push({ start: s.start, end: Date.now(), added: sum ? sum.added : 0 });
    if (S.book.sessions.length > 500) S.book.sessions.splice(0, S.book.sessions.length - 500);
    saveBookMeta();
  }
  const extra = reason !== 'quit' ? window.Mastery?.sessionEnded() || '' : '';
  if (sum && reason !== 'quit' && S.settings.ackEnabled !== false) showAck(extra ? sum.message.replace(/\.$/, '') + extra + '.' : sum.message);
  return sum;
}

function showAck(msg) {
  const el = $('#ack');
  el.textContent = msg;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('on'));
  clearTimeout(showAck.t);
  showAck.t = setTimeout(hideAck, 5 * 60 * 1000);
}
function hideAck() {
  const el = $('#ack');
  if (el.hidden) return;
  el.classList.remove('on');
  clearTimeout(showAck.t);
  setTimeout(() => { if (!el.classList.contains('on')) el.hidden = true; }, 600);
}

textEl.addEventListener('beforeinput', () => activity());
textEl.addEventListener('paste', () => activity(), true);

/* =============================== WIRING =============================== */

function wire() {
  $('#lib-settings').onclick = openSettings;
  $('#back').onclick = () => showLibrary();
  $('#add-chapter').onclick = () => newChapter({ after: S.book.chapters[S.book.chapters.length - 1].id });
  $('#rec').onclick = toggleRecord;
  $('#settings-btn').onclick = openSettings;
  $('#transcript-btn').onclick = () => ($('#drawer').hidden ? openDrawer() : setDrawer(false));
  $('#drawer-close').onclick = () => setDrawer(false);
  $('#level-btn').onclick = () => levelMenu();
  $('#ready').onclick = () => openSettings();
  $('#nav-btn').onclick = () => { $('#nav').classList.toggle('pinned'); $('#nav-btn').classList.toggle('on', $('#nav').classList.contains('pinned')); };
  $('#nav-hot').onmouseenter = () => $('#nav').classList.add('open');

  D.onMenu(async (m) => {
    switch (m.type) {
      case 'settings': return openSettings();
      case 'newBook': return newBookForm();
      case 'newChapter': return S.book && newChapter();
      case 'library': return showLibrary();
      case 'importAudio': return S.book ? importAudio() : toast('Open a book first.');
      case 'export': return exportBook(m.format);
      case 'reveal': return S.book && D.revealBook(S.book.id);
      case 'libraryFolder': { const p = await D.chooseLibrary(); if (p) { await window.Mastery?.load(); showLibrary(); } return; }
      case 'find': return S.book && openFind();
      case 'italic': return document.execCommand('italic');
      case 'bold': return document.execCommand('bold');
      case 'sceneBreak': return S.book && insertSceneBreak();
      case 'toggleRecord': return S.book && toggleRecord();
      case 'transcript': return S.book && ($('#drawer').hidden ? openDrawer() : setDrawer(false));
      case 'note': return S.book && openNoteEditor();
      case 'sprint': return S.book && window.Mastery?.toggle();
      case 'sprintPause': return window.Mastery?.togglePause();
      case 'progress': return window.Mastery?.openProgress();
      case 'training': return window.Apprentice?.open();
      case 'level': return cycleLevel(m.level);
      case 'toggleNav': return $('#nav').classList.toggle('pinned');
      case 'textSize': {
        const size = Math.max(14, Math.min(34, (S.settings.textSize || 21) + m.delta));
        S.settings = { ...S.settings, ...(await D.setSettings({ textSize: size })) };
        return applyTextSize();
      }
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#modal').hidden) return closeModal();
      if (!$('#drawer').hidden) { setDrawer(false); return; }
      if (S.rec) return stopRecording();
    }
  });
  D.onFlush(async () => { endSession('quit'); await window.Mastery?.flush(); await flushSave(); });
  $('#note-btn').onclick = () => openNoteEditor();
  window.addEventListener('beforeunload', () => { autosave.flush(); });
}

window.__amanuensis = { showAck, retrySeg, switchVersion, rememberPosition, restorePosition, caretOffset, placeCaretAt, chapterPlain, endSession, activity, addNote, showBreadcrumb, S, F, segSpans, serialize, insertBlocks, removeSegment, renderVersion, applyRecord, newRecord, buildLocal, textBefore, placeAnchor, pendingSpan, segFinal, exportBook, flushSave, openChapter, newChapter };

boot().catch((e) => { console.error(e); toast('Amanuensis could not start: ' + e.message, true, 10000); });
