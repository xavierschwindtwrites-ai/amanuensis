/*
 * Manuscript exports. The window hands over a plain model:
 *   { title, author, chapters: [{ heading, paras: [{ scene, runs: [{ t, i, b }] }] }], words }
 * Standard manuscript format for .docx and .pdf (Shunn): 12 pt, double-spaced, half-inch indents,
 * chapters on new pages a third of the way down, # for scene breaks, a running header.
 */
'use strict';
const JSZip = require('jszip');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function roundedWords(n) {
  if (n < 1000) return Math.max(100, Math.round(n / 100) * 100);
  if (n < 17500) return Math.round(n / 100) * 100;
  return Math.round(n / 1000) * 1000;
}
function surname(author) {
  const parts = String(author || '').trim().split(/\s+/);
  return parts[parts.length - 1] || 'Author';
}
function headerTitle(title) {
  const w = String(title || '').toUpperCase().split(/\s+/).filter((x) => !/^(THE|A|AN)$/.test(x));
  return (w.slice(0, 3).join(' ') || 'UNTITLED');
}

/* ---------- .docx ---------- */

function runXml(r, font) {
  const props = [`<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>`];
  if (r.b) props.push('<w:b/>');
  if (r.i) props.push('<w:i/>');
  return `<w:r><w:rPr>${props.join('')}</w:rPr><w:t xml:space="preserve">${esc(r.t)}</w:t></w:r>`;
}
function para(content, { indent = true, center = false, before = 0, pageBreak = false, keep = false } = {}) {
  const ppr = [
    pageBreak ? '<w:pageBreakBefore/>' : '',
    keep ? '<w:keepNext/>' : '',
    `<w:spacing w:before="${before}" w:after="0" w:line="480" w:lineRule="auto"/>`,
    indent && !center ? '<w:ind w:firstLine="720"/>' : '',
    center ? '<w:jc w:val="center"/>' : '',
  ].join('');
  return `<w:p><w:pPr>${ppr}</w:pPr>${content}</w:p>`;
}

async function toDocx(m, opts = {}) {
  const font = opts.font === 'courier' ? 'Courier New' : 'Times New Roman';
  const R = (t, x = {}) => runXml({ t, ...x }, font);
  const body = [];
  // Title page
  body.push(`<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4680"/><w:gridCol w:w="4680"/></w:tblGrid><w:tr>` +
    `<w:tc><w:tcPr><w:tcW w:w="4680" w:type="dxa"/></w:tcPr><w:p>${R(m.author || '')}</w:p>${(opts.contact || '').split('\n').filter(Boolean).map((l) => `<w:p>${R(l)}</w:p>`).join('')}</w:tc>` +
    `<w:tc><w:tcPr><w:tcW w:w="4680" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr>${R('about ' + roundedWords(m.words).toLocaleString('en-US') + ' words')}</w:p></w:tc></w:tr></w:tbl>`);
  body.push(para(R(m.title || 'Untitled'), { center: true, before: 4800 }));
  body.push(para(R('by ' + (m.author || '')), { center: true }));

  m.chapters.forEach((ch) => {
    body.push(para(R(ch.heading), { center: true, before: 3600, pageBreak: true, keep: true }));
    body.push(para('', { indent: false, keep: true }));
    ch.paras.forEach((p, k) => {
      if (p.scene) body.push(para(R('#'), { center: true }));
      else body.push(para(p.runs.map((r) => runXml(r, font)).join(''), { indent: true }));
    });
  });
  body.push(para(R('END'), { center: true, before: 480 }));

  const sect = `<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/><w:titlePg/></w:sectPr>`;
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join('')}${sect}</w:body></w:document>`;
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}><w:p><w:pPr><w:jc w:val="right"/></w:pPr>${R(surname(m.author) + ' / ' + headerTitle(m.title) + ' / ')}<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/></w:rPr><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:hdr>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>`);
  zip.file('word/document.xml', doc);
  zip.file('word/styles.xml', styles);
  zip.file('word/header1.xml', header);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(m.title)}</dc:title><dc:creator>${esc(m.author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/* ---------- .pdf (as HTML for printToPDF) ---------- */

function toPrintHtml(m, opts = {}) {
  const font = opts.font === 'courier' ? '"Courier New", Courier, monospace' : '"Times New Roman", Times, serif';
  const runs = (rs) => rs.map((r) => { let t = esc(r.t); if (r.i) t = `<i>${t}</i>`; if (r.b) t = `<b>${t}</b>`; return t; }).join('');
  const chapters = m.chapters.map((ch) => `<section class="ch"><h2>${esc(ch.heading)}</h2>${ch.paras.map((p) => (p.scene ? '<p class="scene">#</p>' : `<p>${runs(p.runs)}</p>`)).join('')}</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: Letter; margin: 1in; }
    body { font: 12pt/2 ${font}; color: #000; margin: 0; }
    .title { height: 9in; position: relative; break-after: page; }
    .title .who { position: absolute; top: 0; left: 0; line-height: 1.3; white-space: pre-line; }
    .title .wc { position: absolute; top: 0; right: 0; line-height: 1.3; }
    .title .t { position: absolute; top: 3.6in; width: 100%; text-align: center; }
    .ch { break-before: page; } .ch:first-of-type { break-before: auto; }
    h2 { font: inherit; text-align: center; margin: 2.5in 0 24pt; }
    p { margin: 0; text-indent: .5in; orphans: 2; widows: 2; }
    p.scene { text-indent: 0; text-align: center; }
    .end { text-align: center; text-indent: 0; margin-top: 24pt; }
  </style></head><body>
    <div class="title"><div class="who">${esc(m.author)}${opts.contact ? '\n' + esc(opts.contact) : ''}</div><div class="wc">about ${roundedWords(m.words).toLocaleString('en-US')} words</div><div class="t">${esc(m.title)}<br>by ${esc(m.author)}</div></div>
    ${chapters}<p class="end">END</p></body></html>`;
}
function pdfHeader(m) {
  return `<div style="font: 10pt 'Times New Roman', serif; width: 100%; text-align: right; padding: 0 1in;">${esc(surname(m.author))} / ${esc(headerTitle(m.title))} / <span class="pageNumber"></span></div>`;
}

/* ---------- text ---------- */

function toMarkdown(m) {
  const md = (rs) => rs.map((r) => (r.b && r.i ? `***${r.t}***` : r.b ? `**${r.t}**` : r.i ? `*${r.t}*` : r.t)).join('');
  const out = [`# ${m.title}`, '', m.author ? `by ${m.author}` : '', ''];
  for (const ch of m.chapters) {
    out.push(`## ${ch.heading}`, '');
    for (const p of ch.paras) out.push(p.scene ? '* * *' : md(p.runs), '');
  }
  return out.join('\n');
}
function toText(m) {
  const out = [m.title, m.author ? 'by ' + m.author : '', '', ''];
  for (const ch of m.chapters) {
    out.push(ch.heading, '');
    for (const p of ch.paras) out.push(p.scene ? '* * *' : p.runs.map((r) => r.t).join(''), '');
    out.push('');
  }
  return out.join('\n');
}

function toTranscript(book, chapters) {
  const out = [`${book.title} — dictation transcript (raw, as transcribed)`, `Exported ${new Date().toLocaleString()}`, ''];
  chapters.forEach((ch) => {
    out.push('='.repeat(60), ch.heading, '='.repeat(60), '');
    for (const s of ch.segments) {
      const when = new Date(s.createdAt || 0).toLocaleString();
      const at = s.session ? ` · ${s.session}.wav @ ${fmtTime(s.startSec || 0)}` : '';
      out.push(`[${when}${at}]`, s.raw || '(no transcript)', '');
    }
  });
  return out.join('\n');
}
function fmtTime(sec) { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; }

module.exports = { toDocx, toPrintHtml, pdfHeader, toMarkdown, toText, toTranscript, roundedWords };
