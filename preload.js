'use strict';
const { contextBridge, ipcRenderer } = require('electron');

async function call(ch, ...args) {
  const r = await ipcRenderer.invoke(ch, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

contextBridge.exposeInMainWorld('amanuensis', {
  settings: () => call('settings:get'),
  setSettings: (patch) => call('settings:set', patch),
  keyStatus: () => call('keys:status'),
  setKey: (name, value) => call('keys:set', name, value),
  testKey: (name) => call('keys:test', name),
  listModels: () => call('models:list'),

  listBooks: () => call('lib:list'),
  createBook: (o) => call('book:create', o),
  openBook: (id) => call('book:open', id),
  saveBook: (id, meta) => call('book:save', id, meta),
  deleteBook: (id) => call('book:delete', id),
  setCover: (id, seed) => call('book:setCover', id, seed),
  revealBook: (id) => call('book:reveal', id),
  chooseLibrary: () => call('lib:chooseFolder'),
  readChapter: (id, cid) => call('chapter:read', id, cid),
  writeChapter: (id, cid, html, opts) => call('chapter:write', id, cid, html, opts),
  snapshotChapter: (id, cid, html) => call('chapter:snapshot', id, cid, html),
  writeDictation: (id, cid, data) => call('chapter:writeDictation', id, cid, data),
  trashChapter: (id, cid) => call('chapter:trash', id, cid),
  history: (id, cid) => call('chapter:history', id, cid),
  readHistory: (id, cid, f) => call('chapter:readHistory', id, cid, f),
  newId: (p) => call('id:new', p),

  startRecording: (o) => call('rec:start', o),
  stopRecording: () => call('rec:stop'),
  sendAudio: (ab) => ipcRenderer.send('rec:audio', ab),
  onRecEvent: (fn) => ipcRenderer.on('rec:event', (_e, d) => fn(d)),
  retrySegment: (o) => call('seg:retry', o),
  audioUrl: (o) => call('seg:audioUrl', o),
  aiFormat: (o) => call('ai:format', o),

  menu: (items) => call('ui:menu', items),
  confirm: (o) => call('ui:confirm', o),
  openAudio: () => call('ui:openAudio'),
  exportBook: (o) => call('export:run', o),

  masteryRead: () => call('mastery:read'),
  masteryAppend: (events) => call('mastery:append', events),
  masterySetProfile: (patch) => call('mastery:setProfile', patch),
  masteryLegacy: () => call('mastery:legacy'),
  masteryDelete: () => call('mastery:delete'),

  onMenu: (fn) => ipcRenderer.on('menu', (_e, d) => fn(d)),
  onFlush: (fn) => ipcRenderer.on('app:flush', async () => { try { await fn(); } finally { ipcRenderer.send('app:flushed'); } }),
});
