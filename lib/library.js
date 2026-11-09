/*
 * Books are plain folders:
 *   <Library>/<Book>/book.json            title, author, chapter order, names & terms
 *   <Library>/<Book>/chapters/<id>.html   the manuscript, one file per chapter
 *   <Library>/<Book>/dictation/<id>.json  every dictated segment: raw transcript, versions, audio offsets
 *   <Library>/<Book>/audio/<session>.wav  every recording session, as recorded
 *   <Library>/<Book>/history/<id>/*.html  snapshots, at most one per 10 minutes and before any bulk change
 *   <Library>/<Book>/trash/               deleted chapters, never discarded
 */
'use strict';
const fs = require('fs');
const path = require('path');

let ROOT = '';
const SNAP_EVERY_MS = 10 * 60 * 1000;

function setRoot(dir) { ROOT = dir; fs.mkdirSync(ROOT, { recursive: true }); }
function root() { return ROOT; }

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function bookDir(id) {
  const d = path.join(ROOT, path.basename(String(id)));
  if (!d.startsWith(ROOT)) throw new Error('bad book id');
  return d;
}
function safeName(s) { return String(s || 'Untitled').replace(/[\/\\:*?"<>|\u0000-\u001f]/g, '').replace(/^\.+/, '').trim().slice(0, 80) || 'Untitled'; }
function chId(id) { return path.basename(String(id)).replace(/[^\w-]/g, ''); }

function listBooks() {
  let names = [];
  try { names = fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch {}
  const books = [];
  for (const n of names) {
    const meta = readJson(path.join(ROOT, n, 'book.json'), null);
    if (!meta) continue;
    books.push({
      id: n, title: meta.title, author: meta.author || '', updated: meta.updated || 0,
      words: (meta.chapters || []).reduce((s, c) => s + (c.words || 0), 0), chapters: (meta.chapters || []).length,
    });
  }
  return books.sort((a, b) => b.updated - a.updated);
}

function createBook({ title, author }) {
  const base = safeName(title);
  let name = base, k = 2;
  while (fs.existsSync(path.join(ROOT, name))) name = base + ' ' + k++;
  const dir = path.join(ROOT, name);
  const first = { id: newId('c'), title: '', words: 0 };
  const meta = { version: 1, title: title || 'Untitled', author: author || '', created: Date.now(), updated: Date.now(), chapters: [first], terms: '' };
  writeAtomic(path.join(dir, 'book.json'), JSON.stringify(meta, null, 2));
  writeAtomic(path.join(dir, 'chapters', first.id + '.html'), '<p><br></p>');
  return { id: name, ...meta };
}

function openBook(id) {
  const meta = readJson(path.join(bookDir(id), 'book.json'), null);
  if (!meta) throw new Error('This book has no book.json.');
  if (!Array.isArray(meta.chapters) || !meta.chapters.length) meta.chapters = [{ id: newId('c'), title: '', words: 0 }];
  return { id, ...meta };
}

function saveBook(id, meta) {
  const file = path.join(bookDir(id), 'book.json');
  const cur = readJson(file, {});
  const next = { ...cur, ...meta, updated: Date.now() };
  delete next.id;
  writeAtomic(file, JSON.stringify(next, null, 2));
  return next;
}

function readChapter(id, cid) {
  const dir = bookDir(id);
  let html = '';
  try { html = fs.readFileSync(path.join(dir, 'chapters', chId(cid) + '.html'), 'utf8'); } catch {}
  const dictation = readJson(path.join(dir, 'dictation', chId(cid) + '.json'), { version: 1, segments: [] });
  return { html, dictation };
}

function snapshot(id, cid, html, force) {
  const hdir = path.join(bookDir(id), 'history', chId(cid));
  fs.mkdirSync(hdir, { recursive: true });
  const snaps = fs.readdirSync(hdir).filter((f) => f.endsWith('.html')).sort();
  const last = snaps.length ? parseInt(snaps[snaps.length - 1], 10) : 0;
  if (!force && Date.now() - last < SNAP_EVERY_MS) return false;
  if (snaps.length) {
    try { if (fs.readFileSync(path.join(hdir, snaps[snaps.length - 1]), 'utf8') === html) return false; } catch {}
  }
  fs.writeFileSync(path.join(hdir, Date.now() + '.html'), html);
  return true;
}

function writeChapter(id, cid, html, opts = {}) {
  const file = path.join(bookDir(id), 'chapters', chId(cid) + '.html');
  let prev = null;
  try { prev = fs.readFileSync(file, 'utf8'); } catch {}
  if (prev === html) return { changed: false };
  if (prev && prev.length > 20) snapshot(id, cid, prev, !!opts.snapshot);
  writeAtomic(file, html);
  return { changed: true };
}

function writeDictation(id, cid, data) {
  writeAtomic(path.join(bookDir(id), 'dictation', chId(cid) + '.json'), JSON.stringify(data, null, 1));
}

function listHistory(id, cid) {
  const hdir = path.join(bookDir(id), 'history', chId(cid));
  try {
    return fs.readdirSync(hdir).filter((f) => f.endsWith('.html')).sort().reverse()
      .map((f) => ({ file: f, time: parseInt(f, 10), size: fs.statSync(path.join(hdir, f)).size }));
  } catch { return []; }
}

function readHistory(id, cid, file) {
  return fs.readFileSync(path.join(bookDir(id), 'history', chId(cid), path.basename(file)), 'utf8');
}

function trashChapter(id, cid) {
  const dir = bookDir(id);
  const t = path.join(dir, 'trash', Date.now() + '-' + chId(cid));
  fs.mkdirSync(t, { recursive: true });
  for (const [sub, ext] of [['chapters', '.html'], ['dictation', '.json']]) {
    const f = path.join(dir, sub, chId(cid) + ext);
    if (fs.existsSync(f)) fs.renameSync(f, path.join(t, sub + ext));
  }
  return t;
}

function audioDir(id) {
  const d = path.join(bookDir(id), 'audio');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

module.exports = {
  setRoot, root, newId, bookDir, listBooks, createBook, openBook, saveBook, readChapter, writeChapter,
  writeDictation, snapshot, listHistory, readHistory, trashChapter, audioDir, writeAtomic, safeName,
};
