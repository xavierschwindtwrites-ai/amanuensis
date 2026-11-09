/*
 * Amanuensis writing-habit helpers. Pure functions, no DOM, no network.
 * Deliberately separate from lib/format.js: nothing here touches the manuscript pipeline
 * or the word guard. These only help the author get back in, remember what's next,
 * and see what a session added.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AmanuensisHabits = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const QUOTE_LEN = 40;
  const MIN_WORDS_TO_ACKNOWLEDGE = 10;

  /* ---------- re-entry ---------- */

  /** Remember a caret position as an offset plus the words just before it. */
  function capturePosition(text, offset, scroll) {
    const o = Math.max(0, Math.min(offset | 0, text.length));
    return { offset: o, quote: text.slice(Math.max(0, o - QUOTE_LEN), o), scroll: Math.max(0, Math.round(scroll || 0)) };
  }

  /**
   * Where the caret belongs in `text` now. The chapter may have changed since: look for the
   * remembered words (nearest occurrence to the old offset), else clamp the old offset.
   */
  function resolvePosition(text, saved) {
    if (!saved || typeof saved.offset !== 'number') return text.length;
    const q = typeof saved.quote === 'string' ? saved.quote : '';
    if (q.trim().length >= 8) {
      let best = -1, bestDist = Infinity, i = text.indexOf(q);
      while (i >= 0) {
        const d = Math.abs(i + q.length - saved.offset);
        if (d < bestDist) { best = i; bestDist = d; }
        i = text.indexOf(q, i + 1);
      }
      if (best >= 0) return best + q.length;
    }
    return Math.max(0, Math.min(saved.offset, text.length));
  }

  /* ---------- narrative breadcrumbs ---------- */

  // The whole passage must begin with the phrase, so prose that merely contains it is left alone.
  const NOTE_RE = /^\s*note to self\b[\s,.:;—-]*(.*)$/is;

  /** "Note to self, Leif confronts Sable." -> "Leif confronts Sable." (or null). */
  function matchNoteCommand(raw) {
    const m = String(raw || '').match(NOTE_RE);
    if (!m) return null;
    let body = m[1].trim().replace(/\s+/g, ' ');
    if (!/[\p{L}\p{N}]/u.test(body)) return null;
    body = body[0].toUpperCase() + body.slice(1);
    if (!/[.!?…]$/.test(body)) body += '.';
    return body;
  }

  /** The note to show: the newest open one for this chapter, else the newest open one in the book. */
  function noteToShow(notes, chapterId) {
    const open = (notes || []).filter((n) => !n.dismissedAt && n.text);
    const newest = (list) => list.reduce((a, b) => (!a || b.created > a.created ? b : a), null);
    return newest(open.filter((n) => n.chapterId === chapterId)) || newest(open);
  }


  /* ---------- the scene invitation ---------- */
  // A note can be a small card: the encounter to write, a question to find out, the first thing
  // to say. All three are optional and written by the author; the app never fills in story.

  const CARD_FIELDS = ['scene', 'question', 'move'];
  const cleanLine = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 280);

  /** {scene, question, move} -> the stored card fields plus `text` (for older readers), or null. */
  function sceneCard(fields) {
    const card = {};
    for (const f of CARD_FIELDS) { const v = cleanLine(fields && fields[f]); if (v) card[f] = v; }
    if (!Object.keys(card).length) return null;
    card.text = card.move || card.scene || card.question;
    return card;
  }

  /** A note with a scene or a question is shown as a card; a lone line stays a plain note. */
  function isSceneCard(n) { return !!(n && (n.scene || n.question)); }

  /** The lines to show, in order. A plain note is its text. */
  function cardLines(n) {
    if (!n) return [];
    if (!isSceneCard(n)) return n.text ? [{ kind: 'text', text: n.text }] : [];
    return CARD_FIELDS.filter((f) => n[f]).map((f) => ({ kind: f, text: n[f] }));
  }

  /** What an editor shows for a note: older plain notes become the first move. */
  function cardFields(n) {
    if (!n) return { scene: '', question: '', move: '' };
    if (n.scene || n.question || n.move) return { scene: n.scene || '', question: n.question || '', move: n.move || '' };
    return { scene: '', question: '', move: n.text || '' };
  }

  const MAX_FRAGMENT_WORDS = 14;
  /**
   * If the text before the caret stops mid-sentence, the unfinished words ("and then she
   * turned to"), offered as a suggested first move. '' when the last sentence is complete.
   */
  function trailingFragment(text) {
    const t = String(text || '').replace(/\s+$/, '');
    if (!t || /[.!?…:;"”’)\]—-]$/.test(t)) return '';
    const cut = Math.max(t.lastIndexOf('.'), t.lastIndexOf('!'), t.lastIndexOf('?'), t.lastIndexOf('…'), t.lastIndexOf('\n'));
    const frag = t.slice(cut + 1).replace(/^["”’)\]\s]+/, '').trim();
    const words = frag.split(/\s+/).filter(Boolean);
    if (words.length < 2) return '';
    return words.length > MAX_FRAGMENT_WORDS ? '…' + words.slice(-MAX_FRAGMENT_WORDS).join(' ') : words.join(' ');
  }

  /* ---------- quiet accomplishment ---------- */

  /**
   * What a session added. `base` and `now` map chapter id -> words. Chapters deleted during the
   * session are not counted against it; chapters created during it start from zero.
   * Returns { added, chapterId, message } or null when there is nothing worth saying.
   */
  function summarize(base, now, names) {
    let added = 0;
    const grew = [];
    for (const id of Object.keys(now || {})) {
      const d = (now[id] || 0) - ((base || {})[id] || 0);
      added += d;
      if (d > 0) grew.push([id, d]);
    }
    if (added < MIN_WORDS_TO_ACKNOWLEDGE) return null;
    const n = (x) => x.toLocaleString('en-US') + (x === 1 ? ' word' : ' words');
    if (grew.length === 1 && names && names[grew[0][0]]) {
      return { added, chapterId: grew[0][0], message: names[grew[0][0]] + ' grew by ' + n(added) + '.' };
    }
    return { added, chapterId: null, message: n(added) + ' added to your manuscript.' };
  }

  return { capturePosition, resolvePosition, matchNoteCommand, noteToShow, summarize, MIN_WORDS_TO_ACKNOWLEDGE,
    sceneCard, isSceneCard, cardLines, cardFields, trailingFragment };
});
