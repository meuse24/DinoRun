// Shared by development/test servers and deployment; never imported by the game.
const MEDIA_ASSETS = Object.freeze([
  'assets/images/icon-180.png', 'assets/images/icon-192.png', 'assets/images/icon-512.png',
  'assets/images/dino.png', 'assets/images/dino.svg',
  'dino-jump-jump.mp3', 'dino-boom-in-the-dunes.mp3',
]);
const HOSTED_ASSETS = Object.freeze([...MEDIA_ASSETS, 'manifest.webmanifest', 'service-worker.js']);
const RELEASE_ASSETS = Object.freeze([...MEDIA_ASSETS, 'manifest.webmanifest']);
const OPTIONAL_FILES = new Set([
  ...RELEASE_ASSETS,
  'highscores.php', 'highscores-lib.php', 'highscores-admin-lib.php', 'admin.php', 'score-console.php',
]);

function deploymentFiles(extras = []) {
  for (const name of extras) if (!OPTIONAL_FILES.has(name)) throw new Error(`Not an allowed extra file: ${name}`);
  return [
    ...new Set([...RELEASE_ASSETS, ...extras]),
    'release/dino.html', 'service-worker.js',
  ].map(local => ({ local, remote: local === 'release/dino.html' ? 'dino.html' : local }));
}

module.exports = { MEDIA_ASSETS, HOSTED_ASSETS, deploymentFiles };
