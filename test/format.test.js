const test = require('node:test');
const assert = require('node:assert');
const F = require('../lib/format.js');

test('guard accepts punctuation-only changes at Verbatim', () => {
  const r = F.checkWords('where are you going she asked', '“Where are you going?” she asked.', 0);
  assert.ok(r.ok, r.reason);
});

test('guard rejects added words', () => {
  const r = F.checkWords('he ran to the door', 'He ran quickly to the door.', 3);
  assert.equal(r.ok, false);
  assert.match(r.reason, /quickly/);
});

test('guard rejects substitutions', () => {
  const r = F.checkWords('he is gonna run', 'He is going to run.', 3);
  assert.equal(r.ok, false);
});

test('guard rejects reordering', () => {
  const r = F.checkWords('the red big dog', 'The big red dog.', 3);
  assert.equal(r.ok, false);
});

test('guard rejects removing fillers at Verbatim, allows at Light', () => {
  assert.equal(F.checkWords('um I think so', 'I think so.', 0).ok, false);
  assert.ok(F.checkWords('um I think so', 'I think so.', 1).ok);
});

test('Light does not allow removing a stutter; Moderate does', () => {
  assert.equal(F.checkWords('she opened the the door', 'She opened the door.', 1).ok, false);
  assert.ok(F.checkWords('she opened the the door', 'She opened the door.', 2).ok);
});

test('had had is not a stutter', () => {
  assert.equal(F.checkWords('she had had enough', 'She had enough.', 2).ok, false);
});

test('false starts by level', () => {
  const raw = 'he grabbed the he took the sword';
  assert.equal(F.checkWords(raw, 'He took the sword.', 1).ok, false);
  assert.ok(F.checkWords(raw, 'He took the sword.', 2).ok);
  const long = 'she walked down to the river and she ran to the bridge';
  assert.equal(F.checkWords(long, 'She ran to the bridge.', 2).ok, false);
});

test('tics only at Aggressive', () => {
  const raw = 'it was you know really cold';
  assert.equal(F.checkWords(raw, 'It was really cold.', 2).ok, false);
  assert.ok(F.checkWords(raw, 'It was really cold.', 3).ok);
});

test('apostrophes and hyphens are punctuation', () => {
  assert.ok(F.checkWords("its twenty three oclock", "It's twenty-three o'clock.", 0).ok);
});

test('preprocess splits structural commands', () => {
  const { pieces } = F.preprocess('He left. New paragraph. She stayed. Scene break. Morning came.');
  assert.deepEqual(pieces.map((p) => p.type), ['text', 'para', 'text', 'scene', 'text']);
  assert.equal(pieces[0].text, 'He left.');
  assert.equal(pieces[2].text, 'She stayed.');
});

test('preprocess drops lone hallucinations and boilerplate', () => {
  assert.equal(F.preprocess('Thank you.', { speechMs: 600 }).pieces.length, 0);
  const { pieces } = F.preprocess('The ship sank. Thanks for watching!');
  assert.equal(pieces[0].text, 'The ship sank.');
});

test('preprocess collapses decoder loops', () => {
  const { pieces, notes } = F.preprocess('and then do do do do do do she left');
  assert.equal(pieces[0].text, 'and then do she left');
  assert.ok(notes.length);
});

test('spoken punctuation when enabled', () => {
  const { pieces } = F.preprocess('quote hello there comma friend end quote she said period', { punctCommands: true });
  assert.equal(F.localFormat(pieces[0].text, 0, {}), '“hello there, friend” she said.'.replace('“h', '“H'));
});

test('localFormat cleans by level and fixes the seam', () => {
  assert.equal(F.localFormat('Um, the the door opened', 2, { before: 'And then' }), 'the door opened');
  assert.equal(F.localFormat('the door opened.', 0, { before: 'It was late.' }), 'The door opened.');
  assert.equal(F.localFormat('"wait," i said', 0, {}), '“Wait,” I said');
});

test('localFormat never adds words', () => {
  const samples = ['um so like I was you know going', 'the the the cat', 'He said "hi" -- then left...'];
  for (const s of samples) for (let l = 0; l < 4; l++) {
    const out = F.localFormat(s, l, { before: 'x' });
    const r = F.checkWords(s, out, 3);
    assert.ok(F.words(out).every((w) => F.words(s).includes(w)), out);
    assert.ok(r.length !== 0);
  }
});

test('parseAiJson tolerates fences', () => {
  const r = F.parseAiJson('```json\n{"new_paragraph": true, "paragraphs": ["A.", "B."]}\n```');
  assert.deepEqual(r, { newParagraph: true, paragraphs: ['A.', 'B.'] });
});
