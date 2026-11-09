/*
 * A stand-in for OpenRouter used by the end-to-end test. It formats dialogue like a well-behaved
 * model, except that it "improves" any fragment containing the word "truth" by adding a word,
 * so the test can prove the guard throws that result away.
 */
'use strict';
const http = require('http');

function format(fragment) {
  let t = fragment.trim().replace(/^um,?\s*/i, '');
  if (/truth/i.test(t)) return { new_paragraph: false, paragraphs: [t.replace(/truth/i, 'whole truth')] };
  const m = t.match(/^(.*?)[,.]?\s+(she|he) (asked|said)\.?$/i);
  if (m) {
    const speech = m[1].replace(/[.,?!]+$/, '');
    const q = /^(where|what|why|who|how|are|is|do)\b/i.test(speech) ? '?' : ',';
    return { new_paragraph: true, paragraphs: [`“${speech[0].toUpperCase() + speech.slice(1)}${q}” ${m[2].toLowerCase()} ${m[3]}.`] };
  }
  if (/truth/i.test(t)) t = t.replace(/truth/i, 'whole truth');
  return { new_paragraph: false, paragraphs: [t] };
}

module.exports = function start(port) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const j = JSON.parse(body || '{}');
      const user = j.messages?.find((m) => m.role === 'user')?.content || '';
      const frag = (user.split('RAW FRAGMENT TO FORMAT:')[1] || '').replace(/^\s*<<</, '').replace(/>>>\s*$/, '');
      const out = format(frag);
      calls.push({ frag, out });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }));
    });
  });
  srv.listen(port, '127.0.0.1');
  return { srv, calls };
};
