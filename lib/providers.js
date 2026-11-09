/*
 * Speech-to-text and formatting providers. Runs in the main process only:
 * API keys never reach the window.
 */
'use strict';
const F = require('./format.js');

const PROVIDERS = {
  deepgram: { name: 'Deepgram (live streaming)', models: ['nova-3', 'nova-2'], streaming: true, keyName: 'deepgram' },
  groq: { name: 'Groq Whisper (fast)', models: ['whisper-large-v3-turbo', 'whisper-large-v3'], base: 'https://api.groq.com/openai/v1', keyName: 'groq' },
  openai: { name: 'OpenAI', models: ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1'], base: 'https://api.openai.com/v1', keyName: 'openai' },
  openrouter: { name: 'OpenRouter (audio model)', models: ['google/gemini-2.5-flash', 'openai/gpt-4o-audio-preview'], keyName: 'openrouter' },
  custom: { name: 'Custom (OpenAI-compatible URL)', models: ['whisper-1'], keyName: 'custom' },
};

const OPENROUTER = 'https://openrouter.ai/api/v1';
const APP_HEADERS = { 'HTTP-Referer': 'https://github.com/hughhowey/neo', 'X-Title': 'Amanuensis' };

async function http(url, init, timeoutMs = 30000) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { const j = JSON.parse(text); msg = j.error?.message || j.err_msg || j.message || msg; } catch {}
    const e = new Error(res.status + ': ' + msg);
    e.status = res.status;
    throw e;
  }
  try { return JSON.parse(text); } catch { return text; }
}

/** One finished utterance (a WAV buffer) -> text. */
async function transcribeWav(cfg, key, wav, opts = {}) {
  const t0 = Date.now();
  const p = cfg.provider;
  const model = cfg.model || PROVIDERS[p].models[0];
  const lang = (cfg.language || 'en').split('-')[0];
  let text = '';

  if (p === 'deepgram') {
    const q = new URLSearchParams({ model, punctuate: 'true', smart_format: 'false', filler_words: 'true', language: cfg.language || 'en' });
    for (const k of (opts.terms || []).slice(0, 50)) q.append(model === 'nova-3' ? 'keyterm' : 'keywords', k);
    const j = await http('https://api.deepgram.com/v1/listen?' + q, {
      method: 'POST', headers: { Authorization: 'Token ' + key, 'Content-Type': 'audio/wav' }, body: wav,
    });
    text = j.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  } else if (p === 'openrouter') {
    const j = await http(OPENROUTER + '/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...APP_HEADERS },
      body: JSON.stringify({
        model, temperature: 0,
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'Transcribe this dictation exactly, word for word, including filler words like um and uh. Add normal punctuation. Output only the transcript, nothing else. If there is no speech, output nothing.' + (opts.terms?.length ? ' Spellings to use: ' + opts.terms.join(', ') + '.' : '') },
          { type: 'input_audio', input_audio: { data: wav.toString('base64'), format: 'wav' } },
        ] }],
      }),
    }, 45000);
    text = String(j.choices?.[0]?.message?.content || '').trim();
  } else {
    const base = p === 'custom' ? String(cfg.baseUrl || '').replace(/\/+$/, '') : PROVIDERS[p].base;
    if (!base) throw new Error('Set a base URL for the custom provider in Settings.');
    const fd = new FormData();
    fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'utterance.wav');
    fd.append('model', model);
    fd.append('response_format', 'json');
    fd.append('temperature', '0');
    if (lang) fd.append('language', lang);
    if (opts.terms?.length) fd.append('prompt', opts.terms.join(', ').slice(0, 600));
    const headers = key ? { Authorization: 'Bearer ' + key } : {};
    const j = await http(base + '/audio/transcriptions', { method: 'POST', headers, body: fd });
    text = typeof j === 'string' ? j : j.text || '';
  }
  return { text: text.trim(), ms: Date.now() - t0 };
}

/**
 * Deepgram live stream. Words appear as you say them (interim), and each pause
 * closes an utterance (final).
 */
class DeepgramStream {
  constructor(cfg, key, h) {
    this.cfg = cfg; this.key = key; this.h = h;
    this.closed = false; this.backlog = []; this.utter = null; this.n = 0; this.ws = null;
    this.connect();
  }
  url() {
    const model = this.cfg.model || 'nova-3';
    const q = new URLSearchParams({
      model, language: this.cfg.language || 'en', encoding: 'linear16', sample_rate: '16000', channels: '1',
      punctuate: 'true', smart_format: 'false', filler_words: 'true', interim_results: 'true',
      endpointing: String(this.cfg.pauseMs || 600), utterance_end_ms: String(Math.max(1000, (this.cfg.pauseMs || 600) + 400)),
    });
    for (const k of (this.h.terms || []).slice(0, 50)) q.append(model === 'nova-3' ? 'keyterm' : 'keywords', k);
    return 'wss://api.deepgram.com/v1/listen?' + q;
  }
  connect() {
    const ws = new WebSocket(this.url(), ['token', this.key]);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.h.onStatus?.('live');
      for (const b of this.backlog.splice(0)) ws.send(b);
      if (this.closing) this.finish();
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'Results') this.onResults(m);
      else if (m.type === 'UtteranceEnd') this.endUtterance();
    };
    ws.onerror = () => {};
    ws.onclose = (ev) => {
      if (this.closed) { this.endUtterance(); this.h.onClosed?.(); return; }
      this.h.onStatus?.('reconnecting');
      if (ev.code === 1008 || ev.code === 4001 || ev.code === 4008) {
        this.closed = true;
        this.h.onError?.(new Error('Deepgram refused the connection (check the API key and model).'));
        this.h.onClosed?.();
        return;
      }
      setTimeout(() => !this.closed && this.connect(), 700);
    };
  }
  onResults(m) {
    const alt = m.channel?.alternatives?.[0];
    const t = (alt?.transcript || '').trim();
    if (t && !this.utter) {
      this.utter = { id: 'd' + Date.now().toString(36) + (this.n++).toString(36), parts: [], start: m.start };
      this.h.onStart?.({ id: this.utter.id, startSec: m.start });
    }
    if (!this.utter) return;
    if (m.is_final) {
      if (t) this.utter.parts.push(t);
      this.utter.end = m.start + m.duration;
      this.h.onInterim?.(this.utter.id, this.utter.parts.join(' '));
      if (m.speech_final) this.endUtterance();
    } else if (t) {
      this.h.onInterim?.(this.utter.id, [...this.utter.parts, t].join(' '));
    }
  }
  endUtterance() {
    const u = this.utter;
    if (!u) return;
    this.utter = null;
    const text = u.parts.join(' ').trim();
    if (text) this.h.onFinal?.({ id: u.id, text, startSec: u.start, endSec: u.end ?? u.start });
    else this.h.onDiscard?.({ id: u.id });
  }
  send(int16) {
    const ab = int16.buffer.slice(int16.byteOffset, int16.byteOffset + int16.byteLength);
    if (this.ws && this.ws.readyState === 1) this.ws.send(ab);
    else {
      this.backlog.push(ab);
      if (this.backlog.length > 600) this.backlog.shift(); // ~60 s at 100 ms chunks
    }
  }
  /** Stop: let Deepgram finish what it heard, then close. */
  finish() {
    this.closing = true;
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify({ type: 'CloseStream' })); } catch {}
      this.closed = true;
      setTimeout(() => { try { this.ws.close(); } catch {} }, 4000);
    } else if (!this.ws || this.ws.readyState > 1) {
      this.closed = true; this.endUtterance(); this.h.onClosed?.();
    }
  }
}

/** Format one text piece with the AI and verify it. Never throws. */
async function aiFormat(cfg, key, { text, before, level, names }) {
  const t0 = Date.now();
  const base = String(cfg.formatBaseUrl || OPENROUTER).replace(/\/+$/, '');
  try {
    const j = await http(base + '/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...APP_HEADERS },
      body: JSON.stringify({
        model: cfg.formatModel || 'google/gemini-2.5-flash',
        temperature: 0,
        max_tokens: Math.min(4000, 300 + text.length * 2),
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: F.systemPrompt(level, { quoteStyle: cfg.quoteStyle }) },
          { role: 'user', content: F.userPrompt(text, String(before || '').slice(-700), names) },
        ],
      }),
    }, 25000);
    const out = F.parseAiJson(j.choices?.[0]?.message?.content);
    if (!out) return { ok: false, reason: 'unreadable reply', ms: Date.now() - t0 };
    const check = F.checkWords(text, out.paragraphs.join(' '), level);
    if (!check.ok) return { ok: false, reason: check.reason, ms: Date.now() - t0, rejected: out.paragraphs };
    return { ok: true, ...out, removed: check.removed, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, reason: e.message, ms: Date.now() - t0, network: true };
  }
}

async function testKey(name, key, cfg = {}) {
  const auth = { Authorization: 'Bearer ' + key };
  if (name === 'deepgram') await http('https://api.deepgram.com/v1/projects', { headers: { Authorization: 'Token ' + key } }, 10000);
  else if (name === 'groq') await http(PROVIDERS.groq.base + '/models', { headers: auth }, 10000);
  else if (name === 'openai') await http(PROVIDERS.openai.base + '/models', { headers: auth }, 10000);
  else if (name === 'openrouter') await http(OPENROUTER + '/key', { headers: auth }, 10000);
  else if (name === 'custom') await http(String(cfg.baseUrl || '').replace(/\/+$/, '') + '/models', { headers: key ? auth : {} }, 10000);
  return true;
}

async function listFormatModels() {
  const j = await http(OPENROUTER + '/models', {}, 15000);
  return (j.data || []).map((m) => m.id).sort();
}

module.exports = { PROVIDERS, transcribeWav, DeepgramStream, aiFormat, testKey, listFormatModels };
