/* Microphone -> 16 kHz mono Int16, posted every 100 ms, with a level for the meter. */
class Pcm16k extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    const rate = (opts.processorOptions && opts.processorOptions.rate) || sampleRate;
    this.ratio = rate / 16000;
    this.k = 0;        // index of the current input sample
    this.next = 0;     // input position of the next output sample
    this.prev = 0;
    this.lp = 0;
    this.alpha = Math.min(1, (2 * Math.PI * 7000) / rate); // one-pole anti-alias filter
    this.out = new Int16Array(1600);
    this.n = 0;
    this.sum = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.lp += this.alpha * (ch[i] - this.lp);
      const y = this.lp;
      while (this.next <= this.k) {
        const frac = this.next - (this.k - 1);
        const v = Math.max(-1, Math.min(1, this.prev + (y - this.prev) * frac));
        this.out[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        this.sum += v * v;
        this.next += this.ratio;
        if (this.n === this.out.length) {
          const buf = this.out.buffer;
          this.port.postMessage({ pcm: buf, rms: Math.sqrt(this.sum / this.n) }, [buf]);
          this.out = new Int16Array(1600);
          this.n = 0;
          this.sum = 0;
        }
      }
      this.prev = y;
      this.k++;
    }
    // keep the counters small
    if (this.k > 1e7) { this.k -= 1e7; this.next -= 1e7; }
    return true;
  }
}
registerProcessor('pcm16k', Pcm16k);
