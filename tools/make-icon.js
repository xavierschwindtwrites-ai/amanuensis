/*
 * Draws the app icon (build/icon.png, 1024×1024) on Apple's icon grid.
 *   npx electron tools/make-icon.js
 * A dark tile, a warm-white italic serif A (the scribe's capital), and a small red dot:
 * the record light, and a full stop.
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const fontUrl = 'file://' + path.join(__dirname, '..', 'renderer', 'fonts', 'source-serif-pro-latin-400-italic.otf');
const html = `<!doctype html><html><head><style>
@font-face { font-family: 'IconSerif'; src: url('${fontUrl}'); font-style: italic; }
html,body { margin:0; background: transparent; }
</style></head><body><canvas id="c" width="1024" height="1024"></canvas><script>
(async () => {
  await document.fonts.load('italic 600px "IconSerif"');
  const c = document.getElementById('c'), x = c.getContext('2d');
  const S = 1024, M = 100, B = S - 2 * M, R = 186;           // Apple grid: 824 body, ~22.5% corner
  function squircle(ctx, x0, y0, w, h, r) {                    // continuous-corner rounded square
    const k = 0.62;
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.lineTo(x0 + w - r, y0);
    ctx.bezierCurveTo(x0 + w - r * (1 - k), y0, x0 + w, y0 + r * (1 - k), x0 + w, y0 + r);
    ctx.lineTo(x0 + w, y0 + h - r);
    ctx.bezierCurveTo(x0 + w, y0 + h - r * (1 - k), x0 + w - r * (1 - k), y0 + h, x0 + w - r, y0 + h);
    ctx.lineTo(x0 + r, y0 + h);
    ctx.bezierCurveTo(x0 + r * (1 - k), y0 + h, x0, y0 + h - r * (1 - k), x0, y0 + h - r);
    ctx.lineTo(x0, y0 + r);
    ctx.bezierCurveTo(x0, y0 + r * (1 - k), x0 + r * (1 - k), y0, x0 + r, y0);
    ctx.closePath();
  }
  // soft drop shadow, as macOS icons carry
  x.save(); x.shadowColor = 'rgba(0,0,0,0.45)'; x.shadowBlur = 28; x.shadowOffsetY = 12;
  squircle(x, M, M, B, B, R); x.fillStyle = '#0b0b0b'; x.fill(); x.restore();
  // the tile: warm charcoal falling to black
  x.save(); squircle(x, M, M, B, B, R); x.clip();
  const g = x.createLinearGradient(0, M, 0, M + B); g.addColorStop(0, '#2a2724'); g.addColorStop(0.55, '#121110'); g.addColorStop(1, '#050505');
  x.fillStyle = g; x.fillRect(M, M, B, B);
  const glow = x.createRadialGradient(S * 0.5, M + B * 0.18, 0, S * 0.5, M + B * 0.18, B * 0.75);
  glow.addColorStop(0, 'rgba(255,240,220,0.10)'); glow.addColorStop(1, 'rgba(255,240,220,0)');
  x.fillStyle = glow; x.fillRect(M, M, B, B);
  // a faint ruled line, like a manuscript page, under the letter
  x.fillStyle = 'rgba(241,238,231,0.10)'; x.fillRect(M + B * 0.2, M + B * 0.765, B * 0.6, 3);
  // the A
  x.fillStyle = '#f1eee7'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 18; x.shadowOffsetY = 6;
  x.font = 'italic 640px "IconSerif"';
  x.fillText('A', S * 0.462, M + B * 0.755);
  x.shadowColor = 'transparent';
  // the record light / full stop
  const dx = S * 0.745, dy = M + B * 0.728, dr = 34;
  const dg = x.createRadialGradient(dx - 8, dy - 10, 2, dx, dy, dr);
  dg.addColorStop(0, '#ff7a7e'); dg.addColorStop(1, '#d93a40');
  x.fillStyle = dg; x.beginPath(); x.arc(dx, dy, dr, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(229,72,77,0.18)'; x.beginPath(); x.arc(dx, dy, dr * 1.7, 0, Math.PI * 2); x.fill();
  // a hairline highlight on the top edge
  x.restore();
  x.save(); squircle(x, M + 1, M + 1, B - 2, B - 2, R - 1); x.strokeStyle = 'rgba(255,255,255,0.09)'; x.lineWidth = 2; x.stroke(); x.restore();
  window.__png = c.toDataURL('image/png');
})();
</script></body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024, transparent: true, webPreferences: { offscreen: true } });
  const tmp = path.join(app.getPath('temp'), 'amanuensis-icon.html');
  fs.writeFileSync(tmp, html);
  await win.loadFile(tmp);
  let png = null;
  for (let i = 0; i < 50 && !png; i++) { png = await win.webContents.executeJavaScript('window.__png || null'); if (!png) await new Promise((r) => setTimeout(r, 100)); }
  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
  console.log('wrote', out);
  app.exit(0);
});
