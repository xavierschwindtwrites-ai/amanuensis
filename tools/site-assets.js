/*
 * Regenerate the landing page's images from the original screenshots and app icon.
 *   npm run site:assets
 * Uses the installed Electron; optional ImageMagick reduces large PNGs. No downloads.
 */
'use strict';
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFileSync, spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, 'site', 'assets');
const budget = 400 * 1024;
const magick = spawnSync('magick', ['-version'], { stdio: 'ignore' }).status === 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amanuensis-site-assets-'));
app.setPath('userData', tmp);

function write(name, data) {
  const file = path.join(out, name);
  fs.writeFileSync(file, data);
  if (magick && data.length > budget) {
    const smaller = path.join(tmp, name);
    execFileSync('magick', [file, '-strip', '-dither', 'None', '-colors', '256', '-define', 'png:compression-level=9', 'PNG8:' + smaller]);
    if (fs.statSync(smaller).size < data.length) fs.copyFileSync(smaller, file);
  }
  const image = nativeImage.createFromPath(file);
  const { width, height } = image.getSize();
  const size = Math.round(fs.statSync(file).size / 1024);
  console.log(`${name}: ${width} × ${height}, ${size} KB`);
  if (fs.statSync(file).size > budget) console.warn(`  Above the 400 KB target; preserved image detail${magick ? '' : ' (ImageMagick not installed)'}.`);
}

function resize(source, name, width) {
  const image = nativeImage.createFromPath(path.join(root, source));
  if (image.isEmpty()) throw new Error('Could not read ' + source);
  write(name, image.resize({ width: Math.min(width, image.getSize().width), quality: 'best' }).toPNG());
}

async function socialPreview() {
  const font = pathToFileURL(path.join(root, 'renderer', 'fonts', 'source-serif-pro-latin-400-normal.otf')).href;
  const icon = pathToFileURL(path.join(root, 'build', 'icon.png')).href;
  const html = path.join(tmp, 'og.html');
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>
    @font-face { font-family: SiteSerif; src: url("${font}"); font-weight: 400; }
    html, body { margin: 0; background: #000; }
  </style><img id="icon" src="${icon}" hidden><canvas id="card" width="1200" height="630"></canvas>`);
  const win = new BrowserWindow({ show: false, width: 1200, height: 630, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await win.loadFile(html);
    const png = await win.webContents.executeJavaScript(`(async () => {
      await document.fonts.load('100px SiteSerif');
      const icon = document.getElementById('icon');
      await icon.decode();
      const c = document.getElementById('card'), x = c.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
      x.font = '100px SiteSerif';
      const name = 'Amanuensis', nameWidth = x.measureText(name).width;
      const fullWidth = x.measureText(name + '.').width;
      x.font = '32px SiteSerif';
      const tagline = 'Speak your novel. Keep every word.';
      const textWidth = Math.max(fullWidth, x.measureText(tagline).width);
      const left = (1200 - 224 - 32 - textWidth) / 2, textX = left + 224 + 32;
      x.drawImage(icon, left, 203, 224, 224);
      x.font = '100px SiteSerif'; x.fillStyle = '#f1eee7';
      x.fillText(name, textX, 305);
      x.fillStyle = '#e5484d'; x.fillText('.', textX + nameWidth, 305);
      x.font = '32px SiteSerif'; x.fillStyle = '#c4beb4';
      x.fillText(tagline, textX, 365);
      return c.toDataURL('image/png');
    })()`);
    write('og.png', Buffer.from(png.split(',')[1], 'base64'));
  } finally { win.destroy(); }
}

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(out, { recursive: true });
    for (const name of ['banner', 'shelf', 'recording', 'transcript', 'put-away', 'scene-card', 'covers']) {
      resize('docs/images/' + name + '.png', name + '.png', ['banner', 'covers'].includes(name) ? 2000 : 1600);
    }
    for (const [name, size] of [['icon-512', 512], ['apple-touch-icon', 180], ['favicon-32', 32]]) resize('build/icon.png', name + '.png', size);
    await socialPreview();
  } catch (e) {
    console.error(e.stack || e);
    process.exitCode = 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    app.exit(process.exitCode || 0);
  }
});
