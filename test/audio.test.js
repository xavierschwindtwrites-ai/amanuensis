const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../lib/audio.js');

function tone(sec, amp) {
  const n = Math.round(sec * A.RATE);
  const a = new Int16Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.round(Math.sin(i / 8) * amp * 32767 * (0.7 + 0.3 * Math.sin(i / 900)));
  return a;
}
function noise(sec, amp) {
  const n = Math.round(sec * A.RATE);
  const a = new Int16Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.round((Math.random() * 2 - 1) * amp * 32767);
  return a;
}

test('segmenter cuts at pauses and ignores silence', () => {
  const segs = [], starts = [];
  const s = new A.Segmenter({ silenceMs: 600, onStart: (x) => starts.push(x), onSegment: (x) => segs.push(x) });
  const stream = [noise(1, 0.001), tone(1.5, 0.3), noise(1, 0.001), tone(2, 0.3), noise(1.2, 0.001), noise(2, 0.001)];
  for (const chunk of stream) for (let i = 0; i < chunk.length; i += 1600) s.push(chunk.subarray(i, i + 1600));
  s.flush();
  assert.equal(segs.length, 2);
  assert.equal(starts.length, 2);
  assert.ok(segs[0].startSec > 0.6 && segs[0].startSec < 1.05, 'start ' + segs[0].startSec);
  assert.ok(segs[1].endSec - segs[1].startSec > 1.9);
});

test('segmenter splits very long speech', () => {
  const segs = [];
  const s = new A.Segmenter({ maxMs: 5000, onSegment: (x) => segs.push(x) });
  const t = tone(12, 0.3);
  for (let i = 0; i < t.length; i += 1600) s.push(t.subarray(i, i + 1600));
  s.flush();
  assert.ok(segs.length >= 2, 'got ' + segs.length);
  assert.ok(segs.every((x) => x.endSec - x.startSec <= 5.1));
});

test('wav writer, crash repair, range read', () => {
  const f = path.join(os.tmpdir(), 'amanuensis-test-' + process.pid + '.wav');
  const w = new A.WavWriter(f);
  w.write(tone(1, 0.2)); w.write(tone(1, 0.2));
  fs.closeSync(w.fd); // simulate a crash: header never finalized
  A.repairWav(f);
  const buf = fs.readFileSync(f);
  assert.equal(buf.readUInt32LE(40), A.RATE * 2 * 2);
  const part = A.readWavRange(f, 0.5, 1.5);
  assert.equal(part.readUInt32LE(40), A.RATE * 2);
  fs.unlinkSync(f);
});
