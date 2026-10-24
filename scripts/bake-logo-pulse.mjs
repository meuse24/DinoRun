// Development only: bake bass envelopes from the exact shipped MP3s (requires ffmpeg).
// No decoder, AudioContext, FFT or additional request is needed at runtime.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const tracks = {
  'boom-in-the-dunes': 'dino-boom-in-the-dunes.mp3',
  'dino-jump-jump': 'dino-jump-jump.mp3',
};
const lines = [];
for (const [id, file] of Object.entries(tracks)) {
  const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', path.join(root, file),
    '-af', 'highpass=f=45,lowpass=f=180', '-ac', '1', '-ar', '6000', '-f', 'f32le', 'pipe:1'],
  { maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  if (decoded.error || decoded.status !== 0) throw decoded.error || new Error(String(decoded.stderr));
  const pcm = decoded.stdout, strengths = [];
  let background = 0;
  // 200 samples at 6 kHz = one 30 Hz envelope value. Emphasize bass attacks.
  for (let offset = 0; offset < pcm.length; offset += 800) {
    const end = Math.min(pcm.length, offset + 800);
    let power = 0;
    for (let i = offset; i < end; i += 4) power += pcm.readFloatLE(i) ** 2;
    const rms = Math.sqrt(power / ((end - offset) / 4));
    background += (rms - background) * 0.06;
    strengths.push(Math.max(0, rms - background * 0.8));
  }
  const sorted = [...strengths].sort((a, b) => a - b);
  const reference = sorted[Math.floor(sorted.length * 0.97)] || 1;
  let envelope = 0;
  const hex = strengths.map(value => {
    envelope = Math.max(Math.min(1, value / reference), envelope * 0.72);
    return Math.round(envelope * 15).toString(16);
  }).join('');
  lines.push(`          '${id}': '${hex}',`);
  console.log(`${id}: ${hex.length} samples, ${(hex.length / 30).toFixed(2)} s`);
}
const htmlPath = path.join(root, 'dino.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const start = '        // BEGIN BAKED LOGO PULSES';
const end = '        // END BAKED LOGO PULSES';
const block = `${start}\n        const MENU_PULSES = {\n${lines.join('\n')}\n        };\n${end}`;
if (!html.includes(start) || !html.includes(end)) throw new Error('Missing pulse markers');
fs.writeFileSync(htmlPath, html.slice(0, html.indexOf(start)) + block + html.slice(html.indexOf(end) + end.length));
