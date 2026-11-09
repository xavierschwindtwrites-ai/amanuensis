/*
 * Amanuensis text pipeline. Pure functions, no DOM, no network.
 * Loaded by the main process (require) and by the window (<script>, as window.AmanuensisFormat).
 *
 * The rule this file exists to enforce: the author's words are never rewritten.
 *  - preprocess()   turns spoken commands ("new paragraph") into structure and removes
 *                   transcriber artifacts (looped words, stock hallucinations).
 *  - localFormat()  typography, capitalization at the seam, and filler cleanup by level.
 *  - checkWords()   the guard every AI result must pass: the output's words must be the
 *                   input's words, in order, with only the deletions the cleanup level allows.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AmanuensisFormat = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LEVELS = ['Verbatim', 'Light', 'Moderate', 'Aggressive'];
  const LEVEL_HELP = [
    'Every word exactly as spoken. Only punctuation, capitals, quotes and paragraphs change.',
    'Removes um, uh, er and similar noises.',
    'Also removes stutters ("the the") and short false starts.',
    'Also removes longer restarts and verbal tics like "you know" and "I mean".',
  ];

  // Sounds, not words. Safe to remove at Light and above.
  const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'ah', 'ahh', 'hmm', 'hm', 'mm', 'mmm', 'mhm']);
  // Real words that people use as tics. Only Aggressive may remove them.
  const TICS = ['you know', 'i mean', 'like', 'basically', 'literally', 'actually'];
  // Doubled words that are often correct English. Never treated as stutters.
  const DOUBLE_OK = new Set(['had', 'that', 'is', 'do', 'very', 'no', 'yes', 'bye', 'ha', 'so', 'really', 'knock',
    'now', 'well', 'too', 'come', 'go', 'there', 'here', 'never', 'please', 'fine', 'wait', 'run', 'again', 'okay',
    'oh', 'hey', 'help', 'more', 'faster', 'harder', 'closer', 'louder', 'deeper', 'out', 'over', 'round', 'on',
    'tick', 'tock', 'chop', 'tsk', 'yeah', 'yay', 'boo', 'bang', 'blah', 'ho', 'la', 'na', 'ding', 'dong', 'die',
    'kill', 'up', 'down', 'back', 'away', 'hurry', 'stop', 'quick', 'go', 'many', 'far', 'long', 'much']);
  const RESTART_MAX = [0, 0, 4, 10];
  const DELETE_CAP = [0, 0.25, 0.35, 0.45];

  /* ---------- words ---------- */

  function words(text) {
    const t = String(text || '').normalize('NFKC').toLowerCase().replace(/[‘’ʼ`]/g, "'");
    const m = t.match(/[\p{L}\p{N}']+/gu) || [];
    return m.map((w) => w.replace(/'/g, '')).filter(Boolean);
  }

  function countWords(text) {
    const m = String(text || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
    return m ? m.length : 0;
  }

  /* ---------- spoken commands and transcriber artifacts ---------- */

  const BOILERPLATE = /(thanks? (you )?for watching|please subscribe|like and subscribe|subtitles by|transcribed by|amara\.org|see you in the next video|don't forget to subscribe)/i;
  const LONE_HALLUCINATIONS = /^\s*(thank you( very much)?|thanks|you|bye|okay|so|\.|…)[.!]?\s*$/i;

  const STRUCT_COMMANDS = [
    { re: /\b(?:new|next) paragraph\b/gi, type: 'para' },
    { re: /\bnew line\b/gi, type: 'para' },
    { re: /\bscene break\b/gi, type: 'scene' },
    { re: /\b(?:new|next) chapter\b/gi, type: 'chapter' },
  ];

  const PUNCT_COMMANDS = [
    [/\s*\b(?:close quote|end quote|unquote)\b/gi, '"'],
    [/\s*\b(?:open quote|begin quote|quote)\b\s*/gi, ' "'],
    [/\s*\bquestion mark\b/gi, '?'],
    [/\s*\bexclamation (?:point|mark)\b/gi, '!'],
    [/\s*\bsemicolon\b/gi, ';'],
    [/\s*\bcolon\b/gi, ':'],
    [/\s*\bellipsis\b/gi, '…'],
    [/\s*\b(?:em dash|dash)\b\s*/gi, '—'],
    [/\s*\bcomma\b/gi, ','],
    [/\s*\b(?:period|full stop)\b/gi, '.'],
  ];

  function collapseLoops(text, notes) {
    // A word or short phrase repeated 4+ times in a row is a decoder loop, not dictation.
    let out = text;
    for (let n = 1; n <= 6; n++) {
      const min = n === 1 ? 4 : 3;
      const pat = new RegExp('((?:\\S+\\s+){' + (n - 1) + '}\\S+?)[,.]?(?:\\s+\\1[,.]?){' + (min - 1) + ',}', 'gi');
      out = out.replace(pat, (m, unit) => {
        notes.push('collapsed a repeated "' + unit + '"');
        return unit;
      });
    }
    return out;
  }

  /**
   * Raw transcript -> list of pieces: {type:'text', text} | {type:'para'|'scene'|'chapter'}.
   * opts: { structCommands: bool, punctCommands: bool, speechMs: number }
   */
  function preprocess(raw, opts = {}) {
    const notes = [];
    let text = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!text) return { pieces: [], notes };

    // Stock hallucinations from silence or noise.
    if ((opts.speechMs || 99999) < 1500 && LONE_HALLUCINATIONS.test(text)) {
      notes.push('dropped "' + text + '" (likely noise)');
      return { pieces: [], notes };
    }
    const sentences = text.split(/(?<=[.!?])\s+/);
    const kept = sentences.filter((s) => !BOILERPLATE.test(s));
    if (kept.length !== sentences.length) notes.push('dropped transcriber boilerplate');
    text = kept.join(' ');
    // Out-of-script garbage (Whisper drift): drop whole tokens mixing scripts we don't expect.
    text = text.split(' ').filter((w) => !/[Ѐ-ӿ֐-ۿ぀-ヿ一-鿿가-힯]/.test(w) || opts.allowScripts).join(' ');
    text = collapseLoops(text, notes);

    if (opts.punctCommands) {
      for (const [re, rep] of PUNCT_COMMANDS) text = text.replace(re, rep);
    }

    const pieces = [];
    if (opts.structCommands === false) {
      pieces.push({ type: 'text', text });
    } else {
      // Find all structural commands in order.
      const hits = [];
      for (const c of STRUCT_COMMANDS) {
        c.re.lastIndex = 0;
        let m;
        while ((m = c.re.exec(text))) hits.push({ start: m.index, end: m.index + m[0].length, type: c.type });
      }
      hits.sort((a, b) => a.start - b.start);
      let pos = 0;
      for (const h of hits) {
        if (h.start < pos) continue;
        pushText(pieces, text.slice(pos, h.start));
        pieces.push({ type: h.type });
        pos = h.end;
      }
      pushText(pieces, text.slice(pos));
    }
    return { pieces, notes };
  }

  function pushText(pieces, s) {
    // Trim the punctuation a transcriber hangs around a spoken command ("... said. New paragraph. The ...").
    let t = s.replace(/^[\s,.;:!?]+/, '').replace(/[\s,;:]+$/, '').trim();
    if (!words(t).length) return;
    pieces.push({ type: 'text', text: t });
  }

  /* ---------- local cleanup by level ---------- */

  function removeFillers(text) {
    // "Um, I think" -> "I think"; "it was, uh, late" -> "it was late"
    const alt = [...FILLERS].join('|');
    let t = text.replace(new RegExp('(^|[\\s(\\u201C"])(?:' + alt + ')\\b[,.…]*\\s*', 'gi'), '$1');
    t = t.replace(new RegExp(',\\s*(?:' + alt + ')\\b[,.…]*', 'gi'), ',');
    t = t.replace(/,\s*,/g, ',').replace(/,\s*([.!?])/g, '$1').replace(/\s{2,}/g, ' ');
    return t.trim();
  }

  function removeStutters(text) {
    return text.replace(/\b([\p{L}']+)(?:[,]?\s+\1\b)+/giu, (m, w) => (DOUBLE_OK.has(w.toLowerCase()) ? m : w));
  }

  function cleanup(text, level) {
    let t = text;
    if (level >= 1) t = removeFillers(t);
    if (level >= 2) t = removeStutters(t);
    if (level >= 3) {
      t = t.replace(/(^|,\s*|\s)(?:you know|i mean)(?:,\s*|\s+(?=[,.!?]))/gi, '$1').replace(/\s{2,}/g, ' ');
    }
    return t.trim();
  }

  /* ---------- typography ---------- */

  function smartQuotes(text, openBefore) {
    let out = '';
    let open = !!openBefore;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const prev = i ? text[i - 1] : ' ';
      if (c === '"') {
        const opening = /[\s(\[{—–-]/.test(prev) || i === 0 && !open;
        out += opening ? '“' : '”';
        open = opening;
      } else if (c === "'") {
        out += /[\s(\[{—–-]/.test(prev) || i === 0 ? '‘' : '’';
      } else out += c;
    }
    return out;
  }

  function typography(text, ctx = {}) {
    let t = text;
    t = t.replace(/\s*--\s*/g, '—').replace(/(\w)\s+[-–]\s+(\w)/g, '$1—$2');
    t = t.replace(/\.\.\./g, '…').replace(/\s+([,.;:!?])/g, '$1');
    t = smartQuotes(t, ctx.quoteOpen);
    t = t.replace(/\bi\b(?=['’\s,.!?]|$)/g, 'I');
    return t.replace(/\s{2,}/g, ' ').trim();
  }

  const LOWER_OK = new Set(['the', 'a', 'an', 'and', 'but', 'or', 'so', 'then', 'he', 'she', 'it', 'they', 'we', 'you',
    'his', 'her', 'their', 'its', 'our', 'my', 'your', 'of', 'to', 'in', 'on', 'at', 'with', 'for', 'as', 'was', 'were',
    'is', 'are', 'that', 'this', 'these', 'those', 'there', 'when', 'while', 'because', 'if', 'into', 'from', 'by',
    'not', 'just', 'which', 'who', 'where', 'what', 'had', 'has', 'have', 'would', 'could', 'should', 'been', 'him',
    'them', 'me', 'us', 'all', 'some', 'out', 'up', 'down', 'over', 'before', 'after', 'until', 'though', 'even', 'still']);

  /** Fix the capital at the seam between what's already on the page and the new piece. */
  function seamCase(text, ctx = {}) {
    if (!text) return text;
    const sentenceStart = ctx.sentenceStart !== false;
    const m = text.match(/^([“‘"'(]*)([\p{L}]+)/u);
    if (!m) return text;
    const [all, lead, word] = m;
    let fixed = word;
    if (sentenceStart || lead.includes('“')) fixed = word[0].toUpperCase() + word.slice(1);
    else if (word[0] !== word[0].toLowerCase() && LOWER_OK.has(word.toLowerCase())) fixed = word.toLowerCase();
    return lead + fixed + text.slice(all.length);
  }

  /** Describe the text just before the insertion point. */
  function describeContext(before) {
    const tail = String(before || '').replace(/\s+$/, '');
    const quoteOpen = (tail.match(/“/g) || []).length > (tail.match(/”/g) || []).length;
    const sentenceStart = !tail || /[.!?…”"’)]$/.test(tail) && !/[,;:—]”?$/.test(tail);
    return { quoteOpen, sentenceStart, paragraphEmpty: !tail };
  }

  /**
   * Local, offline formatting of one text piece. Never adds words.
   * ctx: { before: string (the paragraph text before the insertion point) }
   */
  function localFormat(text, level, ctx = {}) {
    const d = describeContext(ctx.before);
    let t = cleanup(text, level);
    t = typography(t, d);
    t = seamCase(t, d);
    return t;
  }

  /* ---------- the guard ---------- */

  // Longest common subsequence. `late` prefers keeping later copies of a repeated word,
  // which is how a false start reads ("he grabbed the — he took the sword").
  function lcsAlign(a, b, late) {
    const n = a.length, m = b.length;
    if (late) {
      const r = lcsAlign(a.slice().reverse(), b.slice().reverse(), false);
      return { length: r.length, kept: r.kept.reverse() };
    }
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const kept = new Array(n).fill(false);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j] && dp[i][j] === dp[i + 1][j + 1] + 1) { kept[i] = true; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    return { length: dp[0][0], kept };
  }

  function isTicSpan(ws) {
    let s = ws.join(' ');
    for (let k = 0; k < 6 && s; k++) {
      const before = s;
      for (const t of TICS) if (s === t || s.startsWith(t + ' ')) s = s.slice(t.length).trim();
      if (s === before) break;
    }
    return !s;
  }

  /**
   * Check that `output` uses `input`'s words, in order, deleting only what `level` allows.
   * Returns { ok, reason, removed: [string] }.
   */
  function checkWords(input, output, level) {
    const late = checkAligned(input, output, level, true);
    if (late.ok) return late;
    const early = checkAligned(input, output, level, false);
    return early.ok ? early : late;
  }

  function checkAligned(input, output, level, preferLate) {
    const a = words(input), b = words(output);
    const { length, kept } = lcsAlign(a, b, preferLate);
    if (length !== b.length) {
      const extra = [];
      const inA = new Map();
      a.forEach((w) => inA.set(w, (inA.get(w) || 0) + 1));
      for (const w of b) { if (inA.get(w)) inA.set(w, inA.get(w) - 1); else extra.push(w); }
      return { ok: false, reason: extra.length ? 'added or changed words: ' + extra.slice(0, 5).join(', ') : 'reordered words', removed: [] };
    }
    const removed = [];
    let i = 0;
    while (i < a.length) {
      if (kept[i]) { i++; continue; }
      let j = i;
      while (j < a.length && !kept[j]) j++;
      const span = a.slice(i, j);
      removed.push(span.join(' '));
      const why = spanAllowed(a, i, j, level);
      if (why !== true) return { ok: false, reason: why, removed };
      i = j;
    }
    const dropped = a.length - b.length;
    if (a.length >= 8 && dropped / a.length > DELETE_CAP[level]) {
      return { ok: false, reason: 'removed too much (' + dropped + ' of ' + a.length + ' words)', removed };
    }
    return { ok: true, reason: '', removed };
  }

  function spanAllowed(a, i, j, level) {
    const span = a.slice(i, j);
    if (level === 0) return 'removed "' + span.join(' ') + '" at Verbatim';
    const rest = span.filter((w) => !FILLERS.has(w));
    if (!rest.length) return true;
    if (level < 2) return 'removed "' + rest.join(' ') + '" (only fillers allowed at Light)';
    // Stutters: every remaining word doubles a neighbour.
    const stutter = rest.length <= 3 && span.every((w, k) => {
      if (FILLERS.has(w)) return true;
      const idx = i + k;
      return !DOUBLE_OK.has(w) && (a[idx - 1] === w || a[idx + 1] === w || a[idx + rest.length] === w);
    });
    if (stutter) return true;
    // False start: the span is abandoned and the next kept word restarts it.
    const restart = j < a.length && a[j] === rest[0] && rest.length >= 2 && rest.length <= RESTART_MAX[level];
    if (restart) return true;
    if (level >= 3 && isTicSpan(rest)) return true;
    return 'removed "' + span.join(' ') + '"';
  }

  /* ---------- AI prompt ---------- */

  const LEVEL_RULE = [
    'Keep every single word, including um, uh, stutters and false starts. Delete nothing.',
    'You may delete only pure filler sounds: um, uh, er, erm, ah, hmm, mm. Keep every real word.',
    'You may delete filler sounds (um, uh, er, ah, hmm), accidental doubled words ("the the"), and short false starts where the speaker abandons a phrase of up to four words and immediately restarts it with the same first word. Keep every other word.',
    'You may delete filler sounds, doubled words, false starts where the speaker abandons a phrase and restarts it with the same first word, and the verbal tics "you know", "I mean", "like", "basically", "literally", "actually" when they are tics and not meaning. Keep every other word.',
  ];

  function systemPrompt(level, opts = {}) {
    return [
      'You format dictated fiction for a manuscript. You receive a raw speech-to-text fragment and the manuscript text that comes just before it.',
      '',
      'ABSOLUTE RULE: use the author\'s words exactly as given, in the same order. Never add a word. Never substitute, correct, reorder, paraphrase, or "improve" a word. Never fix grammar, tense, or word choice. Never expand contractions or write numbers differently. Never change a name\'s spelling.',
      'Cleanup: ' + LEVEL_RULE[level],
      '',
      'You MAY change only: punctuation, capitalization, quotation marks, apostrophes, em dashes, ellipses, and paragraph breaks.',
      '',
      'Manuscript conventions (' + (opts.quoteStyle === 'single' ? 'British: single curly quotes for dialogue' : 'American: double curly quotes “ ” for dialogue') + '):',
      '- Put spoken lines in quotation marks. Punctuation goes inside the closing quote.',
      '- A dialogue tag after speech takes a comma inside the quote and a lowercase tag: “I\'m going,” she said.',
      '- A tag before speech takes a comma: He said, “Wait.”',
      '- Start a new paragraph when the speaker changes, and between distinct beats of narration if the fragment clearly shifts.',
      '- If the text before ends inside an open quotation, continue that quotation.',
      '- If the text before ends mid-sentence, continue the sentence: do not capitalize the first word unless it is a name or "I".',
      '- Use an em dash with no spaces (—) for interruptions and an ellipsis character (…) for trailing off.',
      '- Curly apostrophes (’).',
      '',
      'Reply with JSON only: {"new_paragraph": boolean, "paragraphs": ["..."]}',
      '"new_paragraph" is true if the fragment should start a new paragraph rather than continue the last paragraph of the text before.',
      '"paragraphs" holds the formatted fragment split into paragraphs. Do not repeat the text before.',
    ].join('\n');
  }

  function userPrompt(fragment, before, names) {
    return [
      names ? 'Names and terms in this book (spelling reference only): ' + names : '',
      'TEXT BEFORE (do not repeat):',
      '<<<' + (before || '[start of chapter]') + '>>>',
      '',
      'RAW FRAGMENT TO FORMAT:',
      '<<<' + fragment + '>>>',
    ].filter((l) => l !== '').join('\n');
  }

  function parseAiJson(s) {
    if (!s) return null;
    let t = String(s).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < a) return null;
    try {
      const o = JSON.parse(t.slice(a, b + 1));
      const paras = Array.isArray(o.paragraphs) ? o.paragraphs.map((p) => String(p).trim()).filter(Boolean) : null;
      if (!paras || !paras.length) return null;
      return { newParagraph: !!o.new_paragraph, paragraphs: paras };
    } catch { return null; }
  }

  return {
    LEVELS, LEVEL_HELP, FILLERS, words, countWords, preprocess, cleanup, typography, seamCase,
    describeContext, localFormat, checkWords, systemPrompt, userPrompt, parseAiJson,
  };
});
