/*
 * Audio for Amanuensis: 16 kHz mono 16-bit PCM throughout.
 *  - WavWriter: every recording session goes to disk as it happens, so no take is ever lost
 *    to a network error. The header is patched on close; repairWav() fixes it after a crash.
 *  - Segmenter: energy-based voice activity detection that cuts the stream into utterances
 *    at natural pauses. Silence never reaches a transcriber (silence is what makes Whisper invent text).
 */
'use strict';
const fs = require('fs');

const RATE = 16000;

function header(dataBytes) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + dataBytes, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(dataBytes, 40);
  return h;
}

function encodeWav(int16) {
  const data = Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength);
  return Buffer.concat([header(data.length), data]);
}

class WavWriter {
  constructor(file) {
    this.file = file;
    this.fd = fs.openSync(file, 'w');
    fs.writeSync(this.fd, header(0));
    this.bytes = 0;
    this.sinceSync = 0;
  }
  write(int16) {
    const b = Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength);
    fs.writeSync(this.fd, b, 0, b.length, 44 + this.bytes);
    this.bytes += b.length;
    this.sinceSync += b.length;
    if (this.sinceSync > RATE * 2 * 5) { // keep the header honest every ~5 s
      fs.writeSync(this.fd, header(this.bytes), 0, 44, 0);
      this.sinceSync = 0;
    }
  }
  get seconds() { return this.bytes / 2 / RATE; }
  close() {
    if (this.fd == null) return;
    fs.writeSync(this.fd, header(this.bytes), 0, 44, 0);
    fs.closeSync(this.fd);
    this.fd = null;
  }
}

function repairWav(file) {
  try {
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, 'r+');
    const h = Buffer.alloc(44);
    fs.readSync(fd, h, 0, 44, 0);
    const data = Math.max(0, size - 44) & ~1;
    if (h.readUInt32LE(40) !== data) fs.writeSync(fd, header(data), 0, 44, 0);
    fs.closeSync(fd);
  } catch { /* not ours to fix */ }
}

/** Read [startSec, endSec) of a session WAV as a standalone WAV buffer. */
function readWavRange(file, startSec, endSec) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.statSync(file).size;
    const a = 44 + Math.max(0, Math.floor(startSec * RATE)) * 2;
    const b = Math.min(size, 44 + Math.ceil(endSec * RATE) * 2);
    const buf = Buffer.alloc(Math.max(0, b - a));
    fs.readSync(fd, buf, 0, buf.length, a);
    return Buffer.concat([header(buf.length), buf]);
  } finally { fs.closeSync(fd); }
}

class Segmenter {
  /**
   * opts: { silenceMs, maxMs, onStart(seg), onSegment(seg), onLevel(rms) }
   * seg: { id, startSec, endSec, pcm: Int16Array, speechMs }
   */
  constructor(opts) {
    this.o = Object.assign({ silenceMs: 700, maxMs: 22000, minSpeechMs: 250, preRollMs: 300, tailMs: 200 }, opts);
    this.frame = RATE / 50; // 20 ms
    this.pending = new Int16Array(0);
    this.history = [];          // recent frames, for pre-roll
    this.cur = null;            // { id, frames: [], speechFrames, silentRun, startSec, energies }
    this.floor = 0.004;
    this.voicedRun = 0;
    this.t = 0;                 // seconds consumed
    this.n = 0;
  }

  push(int16) {
    let buf = int16;
    if (this.pending.length) {
      buf = new Int16Array(this.pending.length + int16.length);
      buf.set(this.pending); buf.set(int16, this.pending.length);
    }
    let i = 0;
    for (; i + this.frame <= buf.length; i += this.frame) this.frameIn(buf.subarray(i, i + this.frame));
    this.pending = buf.slice(i);
  }

  frameIn(f) {
    let sum = 0;
    for (let k = 0; k < f.length; k++) { const v = f[k] / 32768; sum += v * v; }
    const rms = Math.sqrt(sum / f.length);
    const thresh = Math.max(this.floor * 3, 0.008);
    const voiced = rms > thresh;
    if (!voiced) this.floor = this.floor * 0.98 + rms * 0.02;
    else this.floor = Math.min(this.floor * 1.0005, 0.05);
    this.voicedRun = voiced ? this.voicedRun + 1 : 0;
    const copy = f.slice();
    const frameMs = 20;

    if (!this.cur) {
      this.history.push(copy);
      const keep = Math.ceil(this.o.preRollMs / frameMs);
      if (this.history.length > keep) this.history.shift();
      if (this.voicedRun >= 3) {
        const pre = this.history.splice(0);
        this.cur = {
          id: 's' + Date.now().toString(36) + (this.n++).toString(36),
          frames: pre, energies: pre.map(() => 0), speechFrames: 3, silentRun: 0,
          startSec: Math.max(0, this.t + 0.02 - pre.length * 0.02),
        };
        this.o.onStart && this.o.onStart({ id: this.cur.id, startSec: this.cur.startSec });
      }
    } else {
      const c = this.cur;
      c.frames.push(copy); c.energies.push(rms);
      if (voiced) { c.speechFrames++; c.silentRun = 0; } else c.silentRun++;
      const lenMs = c.frames.length * frameMs;
      if (c.silentRun * frameMs >= this.o.silenceMs) {
        const trim = Math.max(0, c.silentRun - Math.ceil(this.o.tailMs / frameMs));
        this.emit(c.frames.length - trim);
      } else if (lenMs >= this.o.maxMs) {
        // Too long without a pause: cut at the quietest moment of the last 1.5 s.
        const look = 75;
        let best = c.frames.length - 1, bestE = Infinity;
        for (let k = c.frames.length - look; k < c.frames.length; k++) {
          if (k > 0 && c.energies[k] < bestE) { bestE = c.energies[k]; best = k; }
        }
        this.emit(best + 1, true);
      }
    }
    this.t += 0.02;
  }

  emit(count, continuing) {
    const c = this.cur;
    const frames = c.frames.slice(0, count);
    const rest = c.frames.slice(count);
    const pcm = new Int16Array(frames.length * this.frame);
    frames.forEach((fr, k) => pcm.set(fr, k * this.frame));
    const seg = { id: c.id, startSec: c.startSec, endSec: c.startSec + frames.length * 0.02, pcm, speechMs: c.speechFrames * 20 };
    this.cur = null;
    if (seg.speechMs >= this.o.minSpeechMs) this.o.onSegment && this.o.onSegment(seg);
    else this.o.onDiscard && this.o.onDiscard(seg);
    if (continuing && rest.length) {
      this.cur = {
        id: 's' + Date.now().toString(36) + (this.n++).toString(36),
        frames: rest, energies: rest.map(() => 0), speechFrames: rest.length, silentRun: 0, startSec: seg.endSec,
      };
      this.o.onStart && this.o.onStart({ id: this.cur.id, startSec: this.cur.startSec });
    } else this.history = rest.slice(-Math.ceil(this.o.preRollMs / 20));
  }

  /** End of stream: flush whatever is in progress. */
  flush() {
    if (this.cur) this.emit(this.cur.frames.length);
  }
}

module.exports = { RATE, encodeWav, WavWriter, repairWav, readWavRange, Segmenter };
