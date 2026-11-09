const test = require('node:test');
const assert = require('node:assert');
const H = require('../lib/habits.js');

test('position survives edits before it', () => {
  const text = 'The rain had not stopped. Marcus stood at the window and watched the street.';
  const off = text.indexOf('watched');
  const saved = H.capturePosition(text, off, 300);
  const edited = 'A new opening line. ' + text;
  assert.equal(H.resolvePosition(edited, saved), edited.indexOf('watched'));
});

test('position clamps when its words are gone', () => {
  const saved = { offset: 500, quote: 'words that no longer exist anywhere' };
  assert.equal(H.resolvePosition('Short now.', saved), 10);
  assert.equal(H.resolvePosition('Short now.', null), 10);
  assert.equal(H.resolvePosition('Short now.', { offset: 3 }), 3);
});

test('position picks the nearest repeat of its words', () => {
  const unit = 'He said nothing at all, again. ';
  const text = unit.repeat(5);
  const off = unit.length * 3 + 'He said nothing at all,'.length;
  assert.equal(H.resolvePosition(text, H.capturePosition(text, off)), off);
});

test('note command only at the start of a passage', () => {
  assert.equal(H.matchNoteCommand('Note to self, Leif confronts Sable about the sword'), 'Leif confronts Sable about the sword.');
  assert.equal(H.matchNoteCommand('note to self: check the timeline.'), 'Check the timeline.');
  assert.equal(H.matchNoteCommand('She wrote a note to self and left.'), null);
  assert.equal(H.matchNoteCommand('Note to self.'), null);
  assert.equal(H.matchNoteCommand('Notes to selfish people'), null);
});

test('note shown: this chapter first, then the book', () => {
  const notes = [
    { id: 1, chapterId: 'a', text: 'old a', created: 1 },
    { id: 2, chapterId: 'a', text: 'new a', created: 3 },
    { id: 3, chapterId: 'b', text: 'b', created: 5 },
    { id: 4, chapterId: 'a', text: 'done a', created: 9, dismissedAt: 10 },
  ];
  assert.equal(H.noteToShow(notes, 'a').text, 'new a');
  assert.equal(H.noteToShow(notes, 'c').text, 'b');
  assert.equal(H.noteToShow([], 'a'), null);
});

test('session summary', () => {
  const names = { a: 'Chapter Seven', b: 'Chapter Eight' };
  assert.equal(H.summarize({ a: 100 }, { a: 930 }, names).message, 'Chapter Seven grew by 830 words.');
  assert.equal(H.summarize({ a: 100, b: 0 }, { a: 600, b: 748 }, names).message, '1,248 words added to your manuscript.');
  assert.equal(H.summarize({ a: 100 }, { a: 105 }, names), null, 'too small to mention');
  assert.equal(H.summarize({ a: 500 }, { a: 200 }, names), null, 'a cutting session says nothing');
  assert.equal(H.summarize({ a: 100, gone: 900 }, { a: 400 }, names).added, 300, 'deleted chapters do not count against');
  assert.equal(H.summarize({ a: 100 }, { a: 100, b: 50 }, names).message, 'Chapter Eight grew by 50 words.');
});

test('scene card keeps only what the author wrote', () => {
  assert.equal(H.sceneCard({ scene: '  ', question: '', move: '' }), null);
  const c = H.sceneCard({ scene: 'Leif corners Sable  at the bridge', question: 'What makes her hand over the sword?', move: '' });
  assert.deepEqual(c, { scene: 'Leif corners Sable at the bridge', question: 'What makes her hand over the sword?', text: 'Leif corners Sable at the bridge' });
  assert.equal(H.sceneCard({ move: 'Start with his accusation.' }).text, 'Start with his accusation.');
});

test('a lone line stays a plain note; a scene or question makes a card', () => {
  assert.equal(H.isSceneCard({ text: 'x', move: 'x' }), false);
  assert.equal(H.isSceneCard({ text: 'x', question: 'y?' }), true);
  assert.deepEqual(H.cardLines({ text: 'Check the timeline.' }), [{ kind: 'text', text: 'Check the timeline.' }]);
  assert.deepEqual(H.cardLines({ scene: 'A', move: 'C', text: 'C' }).map((l) => l.kind), ['scene', 'move']);
});

test('older plain notes open in the editor as the first move', () => {
  assert.deepEqual(H.cardFields({ text: 'Check the timeline.' }), { scene: '', question: '', move: 'Check the timeline.' });
  assert.deepEqual(H.cardFields({ scene: 'A', text: 'A' }), { scene: 'A', question: '', move: '' });
});

test('an unfinished sentence becomes a suggested first move', () => {
  assert.equal(H.trailingFragment('The door opened. She turned to him and said'), 'She turned to him and said');
  assert.equal(H.trailingFragment('The door opened.'), '');
  assert.equal(H.trailingFragment('“Where are you going?” she asked.'), '');
  assert.equal(H.trailingFragment('“Where are you going?” she asked him'), 'she asked him');
  assert.equal(H.trailingFragment('It ended. And'), '');
  assert.equal(H.trailingFragment(''), '');
  const long = 'One. ' + Array.from({ length: 20 }, (_, i) => 'w' + i).join(' ');
  assert.ok(H.trailingFragment(long).startsWith('…w6 '));
});
