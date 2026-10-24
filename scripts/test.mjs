import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const features = [
  'jump-feather', 'shield-bubble', 'glow-berry', 'lives', 'level-bonus',
  'rock-boss', 'rock-training', 'attract-screen', 'coins', 'effects-setting',
  'arcade-type', 'heading-motion', 'game-over-flow', 'screen-transitions',
  'menu-overlays', 'volume-controls', 'theme-songs', 'music-logo', 'update-notice',
];
const groups = {
  core: ['assets', 'architecture', 'game-contract'],
  features,
  release: ['assets', 'release', 'game-contract', 'jump-feather', 'shield-bubble', 'glow-berry', 'level-bonus', 'attract-screen', 'game-over-flow'],
};
const [group = 'core', artifact, ...extra] = process.argv.slice(2);
if (!groups[group] || extra.length || artifact?.startsWith('--')) {
  console.error('Usage: node scripts/test.mjs core|features|release [game.html]');
  process.exit(1);
}
const html = artifact ? path.resolve(artifact) : group === 'release' ? path.join(root, 'release/dino.html') : null;
for (const name of groups[group]) {
  console.log(`\nRunning ${name}${html && !['assets', 'architecture', 'release'].includes(name) ? ' on ' + html : ''}`);
  const args = [path.join(root, 'tests', name + '.mjs')];
  // Architecture extracts readable source; release compares source and delivery.
  if (html && !['assets', 'architecture', 'release'].includes(name)) args.push(html);
  const env = { ...process.env };
  if (env.DINO_PLAYWRIGHT) env.DINO_PLAYWRIGHT = path.resolve(env.DINO_PLAYWRIGHT);
  if (env.DINO_TEST_OUTPUT) env.DINO_TEST_OUTPUT = path.join(path.resolve(env.DINO_TEST_OUTPUT), name);
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
