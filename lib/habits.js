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

  return { capturePosition, resolvePosition, matchNoteCommand, noteToShow, summarize, MIN_WORDS_TO_ACKNOWLEDGE };
});
