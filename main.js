/*
 * Amanuensis main process: window, menus, every filesystem and network operation.
 * The window never touches the disk or an API key; it talks to this file through preload.js.
 */
'use strict';
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, safeStorage, session, systemPreferences, powerSaveBlocker } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const L = require('./lib/library.js');
const A = require('./lib/audio.js');
const P = require('./lib/providers.js');
const X = require('./lib/export.js');

app.setName('Amanuensis');
if (process.env.AMANUENSIS_USER_DATA) app.setPath('userData', process.env.AMANUENSIS_USER_DATA);

/* ------------------------------ SETTINGS & KEYS ------------------------------ */

const DEFAULTS = {
  libraryPath: path.join(os.homedir(), 'Documents', 'Amanuensis Library'),
  provider: 'groq', model: '', language: 'en', baseUrl: '', pauseMs: 700,
  formatEnabled: true, formatModel: 'google/gemini-2.5-flash', formatBaseUrl: '',
  level: 1, quoteStyle: 'double', structCommands: true, punctCommands: false,
  micId: '', textSize: 21, contact: '', exportFont: 'times', lastBook: '', lastAuthor: '',
  ackEnabled: true, noteCommand: false,
  quietNumbers: true,
};
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const keysFile = () => path.join(app.getPath('userData'), 'keys.json');
let settings = { ...DEFAULTS };

function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { settings = { ...DEFAULTS }; }
}
function saveSettings() { L.writeAtomic(settingsFile(), JSON.stringify(settings, null, 2)); }

function readKeys() { try { return JSON.parse(fs.readFileSync(keysFile(), 'utf8')); } catch { return {}; } }
function getKey(name) {
  if (process.env['AMANUENSIS_KEY_' + name.toUpperCase()]) return process.env['AMANUENSIS_KEY_' + name.toUpperCase()];
  const k = readKeys()[name];
  if (!k) return '';
  try { return k.enc ? safeStorage.decryptString(Buffer.from(k.value, 'base64')) : ''; } catch { return ''; }
}
function setKey(name, value) {
  const all = readKeys();
  if (!value) delete all[name];
  else {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('macOS Keychain encryption is not available, so the key was not saved.');
    all[name] = { enc: true, value: safeStorage.encryptString(value).toString('base64') };
  }
  L.writeAtomic(keysFile(), JSON.stringify(all));
  fs.chmodSync(keysFile(), 0o600);
}

/* ------------------------------ WINDOW ------------------------------ */

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 720, minHeight: 500,
    backgroundColor: '#000000', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false,
      sandbox: true, backgroundThrottling: false, spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('closed', () => { win = null; });
}

const send = (ch, data) => win && !win.isDestroyed() && win.webContents.send(ch, data);
const menuCmd = (type, extra = {}) => () => send('menu', { type, ...extra });

function buildMenu() {
  const t = [
    { label: 'Amanuensis', submenu: [
      { role: 'about' }, { type: 'separator' },
      { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: menuCmd('settings') },
      { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' },
    ] },
    { label: 'File', submenu: [
      { label: 'New Book…', accelerator: 'CmdOrCtrl+Shift+N', click: menuCmd('newBook') },
      { label: 'New Chapter', accelerator: 'CmdOrCtrl+N', click: menuCmd('newChapter') },
      { label: 'Note for Next Time…', accelerator: 'CmdOrCtrl+J', click: menuCmd('note') },
      { label: 'Put the Book Away…', accelerator: 'CmdOrCtrl+Shift+J', click: menuCmd('putAway') },
      { label: 'Library', accelerator: 'CmdOrCtrl+Shift+L', click: menuCmd('library') },
      { type: 'separator' },
      { label: 'Import Recording…', click: menuCmd('importAudio') },
      { type: 'separator' },
      { label: 'Export', submenu: [
        { label: 'Manuscript (.docx)…', accelerator: 'CmdOrCtrl+E', click: menuCmd('export', { format: 'docx' }) },
        { label: 'Manuscript (.pdf)…', click: menuCmd('export', { format: 'pdf' }) },
        { label: 'Markdown (.md)…', click: menuCmd('export', { format: 'md' }) },
        { label: 'Plain Text (.txt)…', click: menuCmd('export', { format: 'txt' }) },
        { type: 'separator' },
        { label: 'Raw Dictation Transcript (.txt)…', click: menuCmd('export', { format: 'transcript' }) },
      ] },
      { type: 'separator' },
      { label: 'Show Book in Finder', click: menuCmd('reveal') },
      { label: 'Library Folder…', click: menuCmd('libraryFolder') },
    ] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'selectAll' },
      { type: 'separator' },
      { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: menuCmd('find') },
    ] },
    { label: 'Format', submenu: [
      { label: 'Italic', accelerator: 'CmdOrCtrl+I', click: menuCmd('italic') },
      { label: 'Bold', accelerator: 'CmdOrCtrl+B', click: menuCmd('bold') },
      { type: 'separator' },
      { label: 'Scene Break', accelerator: 'CmdOrCtrl+Shift+Enter', click: menuCmd('sceneBreak') },
    ] },
    { label: 'Dictation', submenu: [
      { label: 'Start / Stop Recording', accelerator: 'CmdOrCtrl+D', click: menuCmd('toggleRecord') },
      { label: 'Show Transcript', accelerator: 'CmdOrCtrl+Shift+T', click: menuCmd('transcript') },
      { type: 'separator' },
      { label: 'Start or Finish Sprint', accelerator: 'CmdOrCtrl+Alt+S', click: menuCmd('sprint') },
      { label: 'Pause or Resume Sprint', click: menuCmd('sprintPause') },
      { label: 'Progress…', accelerator: 'CmdOrCtrl+Alt+P', click: menuCmd('progress') },
      { label: 'Training…', accelerator: 'CmdOrCtrl+Alt+D', click: menuCmd('training') },
      { type: 'separator' },
      { label: 'Cleanup: Verbatim', accelerator: 'CmdOrCtrl+Alt+0', click: menuCmd('level', { level: 0 }) },
      { label: 'Cleanup: Light', accelerator: 'CmdOrCtrl+Alt+1', click: menuCmd('level', { level: 1 }) },
      { label: 'Cleanup: Moderate', accelerator: 'CmdOrCtrl+Alt+2', click: menuCmd('level', { level: 2 }) },
      { label: 'Cleanup: Aggressive', accelerator: 'CmdOrCtrl+Alt+3', click: menuCmd('level', { level: 3 }) },
    ] },
    { label: 'View', submenu: [
      { label: 'Chapters', accelerator: 'CmdOrCtrl+\\', click: menuCmd('toggleNav') },
      { label: 'Larger Text', accelerator: 'CmdOrCtrl+=', click: menuCmd('textSize', { delta: 1 }) },
      { label: 'Smaller Text', accelerator: 'CmdOrCtrl+-', click: menuCmd('textSize', { delta: -1 }) },
      { type: 'separator' }, { role: 'togglefullscreen' },
      ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
    ] },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

/* ------------------------------ RECORDING ------------------------------ */

let rec = null; // the active session

function terms(list) {
  return String(list || '').split(/[\n,]/).map((s) => s.replace(/#.*/, '').trim()).filter(Boolean).slice(0, 60);
}

function recEvent(e) { send('rec:event', { session: rec?.session, ...e }); }

function startRecording({ bookId, mode, termsText }) {
  if (rec) stopRecording();
  const provider = settings.provider;
  const key = getKey(P.PROVIDERS[provider]?.keyName || provider);
  if (!key && provider !== 'custom') throw new Error('Add your ' + P.PROVIDERS[provider].name + ' API key in Settings (⌘,) first.');
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const sessionId = (mode === 'import' ? 'import-' : 'take-') + stamp;
  const file = path.join(L.audioDir(bookId), sessionId + '.wav');
  const cfg = { ...settings };
  const r = {
    session: sessionId, bookId, file, mode, cfg, key, wav: new A.WavWriter(file), terms: terms(termsText),
    inflight: 0, queue: [], done: null, stopped: false,
    blocker: powerSaveBlocker.start('prevent-app-suspension'),
  };
  rec = r;

  if (provider === 'deepgram' && mode === 'live') {
    r.stream = new P.DeepgramStream(cfg, key, {
      terms: r.terms,
      onStart: (s) => recEvent({ type: 'start', id: s.id, startSec: s.startSec }),
      onInterim: (id, text) => recEvent({ type: 'interim', id, text }),
      onFinal: (s) => recEvent({ type: 'final', id: s.id, text: s.text, startSec: s.startSec, endSec: s.endSec, provider, model: cfg.model || 'nova-3', ms: 0 }),
      onDiscard: (s) => recEvent({ type: 'discard', id: s.id }),
      onStatus: (st) => recEvent({ type: 'status', status: st }),
      onError: (e) => recEvent({ type: 'error', error: e.message }),
      onClosed: () => { r.streamClosed = true; maybeEnd(r); },
    });
  } else {
    r.seg = new A.Segmenter({
      silenceMs: cfg.pauseMs || 700,
      onStart: (s) => recEvent({ type: 'start', id: s.id, startSec: s.startSec }),
      onDiscard: (s) => recEvent({ type: 'discard', id: s.id }),
      onSegment: (s) => { r.queue.push(s); pump(r); },
    });
  }
  return { session: sessionId, provider, streaming: !!r.stream };
}

function pump(r) {
  while (r.inflight < 3 && r.queue.length) {
    const s = r.queue.shift();
    r.inflight++;
    transcribeSegment(r, s).finally(() => { r.inflight--; pump(r); maybeEnd(r); });
  }
}

async function transcribeSegment(r, s) {
  const wav = A.encodeWav(s.pcm);
  const base = { id: s.id, startSec: s.startSec, endSec: s.endSec, provider: r.cfg.provider, model: r.cfg.model || P.PROVIDERS[r.cfg.provider].models[0], speechMs: s.speechMs };
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = await P.transcribeWav(r.cfg, r.key, wav, { terms: r.terms });
      if (r.session === rec?.session || r.stopped) send('rec:event', { session: r.session, type: 'final', ...base, text: out.text, ms: out.ms });
      return;
    } catch (e) {
      lastErr = e;
      if (e.status && e.status < 500 && e.status !== 429) break;
      await new Promise((res) => setTimeout(res, 600 * (attempt + 1) ** 2));
    }
  }
  send('rec:event', { session: r.session, type: 'failed', ...base, error: lastErr?.message || 'transcription failed' });
}

function maybeEnd(r) {
  if (!r.stopped || r.ended) return;
  const streamDone = r.stream ? r.streamClosed : true;
  if (streamDone && r.inflight === 0 && r.queue.length === 0) {
    r.ended = true;
    send('rec:event', { session: r.session, type: 'ended', seconds: r.wav.seconds });
    r.wav.close();
    if (rec === r) rec = null;
  }
}

function stopRecording() {
  const r = rec;
  if (!r || r.stopped) return;
  r.stopped = true;
  try { powerSaveBlocker.stop(r.blocker); } catch {}
  if (r.seg) r.seg.flush();
  if (r.stream) r.stream.finish();
  maybeEnd(r);
  setTimeout(() => { if (!r.ended) { r.streamClosed = true; r.inflight = 0; r.queue = []; maybeEnd(r); } }, 60000);
}

/* ------------------------------ IPC ------------------------------ */

function handle(ch, fn) {
  ipcMain.handle(ch, async (_e, ...args) => {
    try { return { ok: true, value: await fn(...args) }; }
    catch (e) { return { ok: false, error: e.message || String(e) }; }
  });
}

function registerIpc() {
  handle('settings:get', () => ({ ...settings, providers: P.PROVIDERS, libraryRoot: L.root() }));
  handle('settings:set', (patch) => {
    const allowed = Object.keys(DEFAULTS).filter((k) => k !== 'libraryPath');
    for (const k of allowed) if (k in patch) settings[k] = patch[k];
    saveSettings();
    return settings;
  });
  handle('keys:status', () => Object.fromEntries(['deepgram', 'groq', 'openai', 'openrouter', 'custom'].map((k) => [k, !!getKey(k)])));
  handle('keys:set', (name, value) => { setKey(name, String(value || '').trim()); return true; });
  handle('keys:test', (name) => P.testKey(name, getKey(name), settings));
  handle('models:list', () => P.listFormatModels());

  handle('lib:list', () => L.listBooks().map((b) => {
    try { const m = JSON.parse(fs.readFileSync(path.join(L.bookDir(b.id), 'book.json'), 'utf8')); return { ...b, coverSeed: m.coverSeed || '' }; } catch { return b; }
  }));
  // A new cover: a new seed for the generator. Doesn't touch "updated", so the shelf order stays put.
  handle('book:setCover', (id, seed) => {
    const file = path.join(L.bookDir(id), 'book.json');
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
    meta.coverSeed = String(seed || '').slice(0, 80);
    L.writeAtomic(file, JSON.stringify(meta, null, 2));
    return meta.coverSeed;
  });
  handle('book:create', (o) => L.createBook(o));
  handle('book:open', (id) => { settings.lastBook = id; saveSettings(); return L.openBook(id); });
  handle('book:save', (id, meta) => L.saveBook(id, meta));
  handle('book:delete', async (id) => {
    const r = await dialog.showMessageBox(win, { type: 'warning', message: 'Move this book to the Trash?', detail: 'You can put it back from the Trash in Finder.', buttons: ['Move to Trash', 'Cancel'], defaultId: 1, cancelId: 1 });
    if (r.response !== 0) return false;
    await shell.trashItem(L.bookDir(id));
    return true;
  });
  handle('book:reveal', (id) => shell.showItemInFolder(path.join(L.bookDir(id), 'book.json')));
  handle('chapter:read', (id, cid) => L.readChapter(id, cid));
  handle('chapter:write', (id, cid, html, opts) => L.writeChapter(id, cid, html, opts));
  handle('chapter:snapshot', (id, cid, html) => L.snapshot(id, cid, html, true));
  handle('chapter:writeDictation', (id, cid, data) => L.writeDictation(id, cid, data));
  handle('chapter:trash', (id, cid) => L.trashChapter(id, cid));
  handle('chapter:history', (id, cid) => L.listHistory(id, cid));
  handle('chapter:readHistory', (id, cid, f) => L.readHistory(id, cid, f));
  handle('id:new', (p) => L.newId(p || 'c'));

  handle('rec:start', (o) => startRecording(o));
  handle('rec:stop', () => stopRecording());
  ipcMain.on('rec:audio', (_e, ab) => {
    if (!rec || rec.stopped) return;
    const pcm = new Int16Array(ab);
    rec.wav.write(pcm);
    if (rec.stream) rec.stream.send(pcm); else rec.seg.push(pcm);
  });
  handle('seg:retry', async ({ bookId, session: sess, startSec, endSec }) => {
    const file = path.join(L.audioDir(bookId), path.basename(sess) + '.wav');
    const wav = A.readWavRange(file, Math.max(0, startSec - 0.2), endSec + 0.3);
    const key = getKey(P.PROVIDERS[settings.provider].keyName);
    return P.transcribeWav(settings, key, wav, {});
  });
  handle('seg:audioUrl', ({ bookId, session: sess }) => 'file://' + path.join(L.audioDir(bookId), path.basename(sess) + '.wav'));
  handle('ai:format', async (o) => {
    if (!settings.formatEnabled) return { ok: false, reason: 'off', off: true };
    const key = getKey('openrouter') || (settings.formatBaseUrl ? getKey('custom') : '');
    if (!key) return { ok: false, reason: 'no OpenRouter key', off: true };
    return P.aiFormat(settings, key, o);
  });

  handle('mastery:read', () => readMastery());
  handle('mastery:append', (events) => appendLedger(events));
  handle('mastery:setProfile', (patch) => setMasteryProfile(patch));
  handle('mastery:legacy', () => L.listBooks().flatMap((b) => { try { return MASTERY.legacyEvents(b.id, L.openBook(b.id).sessions); } catch { return []; } }));
  handle('mastery:delete', async () => {
    const r = await dialog.showMessageBox(win, { type: 'warning', message: 'Delete all Writing Mastery data?', detail: 'This permanently removes sprint history, goals and settings for this library, from every Mac that syncs it. Your manuscripts, transcripts and recordings are not touched.', buttons: ['Delete', 'Cancel'], defaultId: 1, cancelId: 1 });
    if (r.response !== 0) return false;
    fs.rmSync(masteryDir(), { recursive: true, force: true });
    return true;
  });
  handle('ui:menu', async (items) => new Promise((resolve) => {
    let picked = null;
    const m = Menu.buildFromTemplate(items.map((it) => (it.type === 'separator' ? it : { label: it.label, enabled: it.enabled !== false, click: () => { picked = it.id; } })));
    m.popup({ window: win, callback: () => setTimeout(() => resolve(picked), 0) });
  }));
  handle('ui:confirm', async ({ message, detail, ok }) => {
    const r = await dialog.showMessageBox(win, { type: 'question', message, detail, buttons: [ok || 'OK', 'Cancel'], defaultId: 0, cancelId: 1 });
    return r.response === 0;
  });
  handle('ui:openAudio', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['m4a', 'mp3', 'wav', 'aac', 'mp4', 'ogg', 'webm', 'flac', 'caf'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const f = r.filePaths[0];
    const st = fs.statSync(f);
    if (st.size > 500 * 1024 * 1024) throw new Error('That file is larger than 500 MB.');
    const buf = fs.readFileSync(f);
    return { name: path.basename(f), data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  });
  handle('lib:chooseFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: L.root() });
    if (r.canceled || !r.filePaths[0]) return null;
    settings.libraryPath = r.filePaths[0];
    saveSettings();
    L.setRoot(settings.libraryPath);
    return settings.libraryPath;
  });

  handle('export:run', async ({ format, model, bookId }) => {
    const ext = { docx: 'docx', pdf: 'pdf', md: 'md', txt: 'txt', transcript: 'txt' }[format];
    const suffix = format === 'transcript' ? ' - transcript' : '';
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), L.safeName(model.title) + suffix + '.' + ext) });
    if (r.canceled || !r.filePath) return null;
    let data;
    const opts = { font: settings.exportFont, contact: settings.contact };
    if (format === 'docx') data = await X.toDocx(model, opts);
    else if (format === 'md') data = X.toMarkdown(model);
    else if (format === 'txt') data = X.toText(model);
    else if (format === 'transcript') {
      const book = L.openBook(bookId);
      const chapters = book.chapters.map((c, k) => ({ heading: model.chapters[k]?.heading || c.title || 'Chapter ' + (k + 1), segments: L.readChapter(bookId, c.id).dictation.segments || [] }));
      data = X.toTranscript(book, chapters);
    } else if (format === 'pdf') {
      const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
      await pw.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(X.toPrintHtml(model, opts)));
      data = await pw.webContents.printToPDF({
        pageSize: 'Letter', printBackground: false, displayHeaderFooter: true,
        headerTemplate: X.pdfHeader(model), footerTemplate: '<span></span>',
        margins: { marginType: 'custom', top: 1, bottom: 1, left: 1, right: 1 },
      });
      pw.destroy();
    }
    fs.writeFileSync(r.filePath, data);
    shell.showItemInFolder(r.filePath);
    return r.filePath;
  });
}

/* ------------------------------ WRITING MASTERY ------------------------------ */
// Behavioural data, kept apart from manuscripts: <Library>/.amanuensis/mastery/
// One profile and one append-only ledger per Mac, merged on read. Nothing here is created
// until Writing Mastery is turned on.

const crypto = require('crypto');
const MASTERY = require('./lib/mastery.js');
function masteryDir() { return path.join(L.root(), '.amanuensis', 'mastery'); }
function deviceId() {
  const f = path.join(app.getPath('userData'), 'device.json');
  try { return JSON.parse(fs.readFileSync(f, 'utf8')).id; } catch {}
  const id = 'mac-' + crypto.randomBytes(6).toString('hex');
  L.writeAtomic(f, JSON.stringify({ id }));
  return id;
}
function readMastery() {
  const dir = masteryDir();
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return { exists: false, device: deviceId(), profiles: [], ledgers: [] }; }
  const profiles = [], ledgers = [];
  for (const f of files) {
    const full = path.join(dir, f);
    if (/^profile-.+\.json$/.test(f)) { try { profiles.push(JSON.parse(fs.readFileSync(full, 'utf8'))); } catch { /* a half-synced file: skip */ } }
    else if (/^ledger-.+\.jsonl$/.test(f)) { try { ledgers.push(fs.readFileSync(full, 'utf8')); } catch {} }
  }
  return { exists: true, device: deviceId(), profiles, ledgers };
}
function appendLedger(events) {
  if (!Array.isArray(events) || !events.length) return 0;
  const file = path.join(masteryDir(), 'ledger-' + deviceId() + '.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // A crash can leave a partial last line; start ours on a fresh one.
  let prefix = '';
  try {
    const size = fs.statSync(file).size;
    if (size > 0) {
      const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(1); fs.readSync(fd, b, 0, 1, size - 1); fs.closeSync(fd);
      if (b[0] !== 10) prefix = '\n';
    }
  } catch {}
  fs.appendFileSync(file, prefix + events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return events.length;
}
function setMasteryProfile(patch) {
  const dev = deviceId();
  const file = path.join(masteryDir(), 'profile-' + dev + '.json');
  let cur = { device: dev, fields: {} };
  try { cur = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  // Turning it off must never create the folder; only write if it exists or we are turning on/configuring.
  if (!fs.existsSync(masteryDir()) && patch && patch.enabled === false && Object.keys(patch).length === 1) return null;
  cur.device = dev;
  cur.fields = MASTERY.patchFields(cur.fields, patch, Date.now());
  L.writeAtomic(file, JSON.stringify(cur, null, 1));
  return cur;
}

/* ------------------------------ LIFECYCLE ------------------------------ */

function repairAudio() {
  // A crash mid-take leaves a WAV whose header undercounts its audio. Fix them all on launch.
  for (const b of L.listBooks()) {
    const dir = path.join(L.bookDir(b.id), 'audio');
    try { for (const f of fs.readdirSync(dir)) if (f.endsWith('.wav')) A.repairWav(path.join(dir, f)); } catch {}
  }
}

app.whenReady().then(async () => {
  app.setAboutPanelOptions({
    applicationName: 'Amanuensis', applicationVersion: app.getVersion(), copyright: '© 2026 Xavier Schwindt',
    credits: 'A dictation-first writing app for novelists.\nCover art adapted from NEO by Hugh Howey (MIT License).',
  });
  if (process.platform === 'darwin' && !app.isPackaged) {
    try { app.dock.setIcon(path.join(__dirname, 'build', 'icon.png')); } catch {}
  }
  loadSettings();
  L.setRoot(settings.libraryPath);
  repairAudio();
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media'));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === 'media');
  if (process.platform === 'darwin') {
    try { await systemPreferences.askForMediaAccess('microphone'); } catch {}
  }
  registerIpc();
  buildMenu();
  createWindow();
  app.on('activate', () => { if (!win) createWindow(); });
});

let quitting = false;
app.on('before-quit', (e) => {
  if (quitting || !win) return;
  e.preventDefault();
  quitting = true;
  stopRecording();
  const done = () => app.quit();
  ipcMain.once('app:flushed', done);
  send('app:flush');
  setTimeout(done, 2500);
});
app.on('window-all-closed', () => app.quit());
