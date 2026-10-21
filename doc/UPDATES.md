# Player-controlled hosted updates

## Plan and player contract

Implemented for build `2026-10-21.1`, cache `dino-run-v27`.

1. Stage a complete new offline cache in a waiting service worker. A required
   file failing to download prevents activation; either missing song is allowed.
2. Offer a quiet, keyboard/touch-accessible Update available notice only in the
   attract/start menu, outside Help, dialogs, score qualification and gameplay.
   It takes no focus and leaves START accessible. There is no countdown or
   automatic reload. Copy follows the game's existing English UI.
3. Update now sends `SKIP_WAITING` to the waiting worker. Only the consenting
   document reloads after takeover. During activation it cannot start a new run;
   a 12-second failure timeout restores play/retry. Later hides the offer for
   this document visit; a newer worker can offer again.
4. Keep other open tabs running. If another tab activates the worker, their old
   self-contained game continues; their next safe menu offers a voluntary reload.
5. With all controlled pages closed, the browser may activate naturally. First
   installation claims the page without an update prompt or forced reload.
6. Keep `file://` play self-contained. No service worker, update fetch, or
   external runtime script/style is required there. About displays the running
   `BUILD` value, including in offline and minified games.

## Implementation choices

`GameUpdates` is a page coordinator in `dino.html`, independent of simulation and
score storage. Runner draws synchronize safe visibility; dialog observers also
work when the frame loop is paused. Existing waiting and currently installing
workers are both inspected, and newer installs are watched with `updatefound`.
Each tab owns its consent flag. A bare `controllerchange` never grants consent.

Registration uses `updateViaCache: 'none'`. In addition to browser checks, a
foreground timer checks every five minutes and checks also run on return to the
app, reconnect and pageshow, throttled to once per minute. Update/network errors
leave the installed game usable. No API/score requests are cached by the worker.

Hosted HTML is now **cache-first in the active worker's own cache**, rather than
network-first. Therefore a navigation cannot fetch tomorrow's game into today's
cache or use a waiting worker's HTML. Activation/reload can finish offline after
successful installation. Static assets and MP3 ranges use that same version's
cache. Old caches are removed on activation. Already running tabs retain their
embedded code/artwork; future optional resource requests use the new worker.

The first transition from v26 is a special case: existing v26 pages have no update
UI and v26 still serves network-first. They must be reopened/reloaded to receive
the new page code. Until v27 activates, its stronger version-pinning contract
cannot apply. No retroactive update notice is claimed for those old documents.

## Production deployment

The production location is `https://meuse24.info/apps/dino/dino.html`. Relative
worker, manifest, icon, song and score URLs keep this directory as their base.
No root-level worker or new CDN dependency is introduced.

- Edit root `dino.html`; increment `BUILD` and the worker's `CACHE_NAME` for each
  changed hosted game release. Changing HTML alone is **not sufficient** with
  version-pinned caching. Do not change the worker URL between releases.
- Run `npm run build`. Deploy **`release/dino.html` as `/apps/dino/dino.html`**
  and root `service-worker.js` as `/apps/dino/service-worker.js`. Do not deploy
  the generated HTML under `/apps/dino/release/`.
- Publish HTML/assets before the worker, preferably via an atomic deployment of
  the complete release. Partial deployment can otherwise cache mismatched files.
- Serve the worker as JavaScript over HTTPS, with revalidation-friendly HTTP
  headers (for example `Cache-Control: no-cache`). Serve `dino.html` with
  revalidation too so installation fetches obtain the current HTML. No immutable
  CDN caching for these stable URLs. Worker installation uses `cache: 'reload'`
  to avoid silently reusing a fresh local HTTP-cache entry.
- Keep existing manifest/icons, PHP/config/data and optional music in place.
  The minified HTML alone still supports standalone offline file play, but is
  not the whole hosted PWA deployment. Nothing is uploaded by the build.

## Research basis

- [Chrome/Workbox: handling service worker updates](https://developer.chrome.com/docs/workbox/handling-service-worker-updates/)
  documents waiting-worker prompts, explicit activation and reloading after
  takeover. The implementation uses native APIs instead of importing Workbox,
  preserving the standalone HTML contract.
- [web.dev: service worker lifecycle](https://web.dev/articles/service-worker-lifecycle)
  explains waiting, first-install claims, multi-tab implications and complete
  precaching before activation.
- [Construct: offline games](https://www.construct.net/en/tutorials/offline-games-in-construct-3-8)
  describes cached playable webgame exports and background preparation of
  updates. This supports the offline game model; it is not a claim that all
  popular commercial webgames use the same interface.

## Verification

`node tests/update-notice.mjs [game.html]` runs real worker installs and upgrades
under an isolated `/apps/dino/` fixture, with live scores disabled. Desktop,
320x640 portrait and 663x234 landscape cover first install, hidden in-round
updates, round-end offer, modal/Help suppression, native keyboard/touch actions,
Later, already-waiting registration, stable cached navigation, two open tabs,
offline activation/reload/play, one reload per consent, failed required
precaching, replacing waiting updates and natural activation after closing tabs.
The desktop case also simulates a lost activation message and verifies timeout,
input locking and retry, checks dark/reduced-motion rendering, and accepts a
third release after another tab already activated the second. Activation cache
cleanup is verified too. Missing optional music is deliberate. Screenshots and
JSON reports go to `output/updates/`; `DINO_BROWSER=webkit` selects WebKit.

Existing `game-contract.mjs` verifies standalone file play and hosted offline
fallback; `game-over-flow.mjs` checks the real score-entry/death flow;
`release.mjs` checks source/minified behavior and rendering. The installed
develop-web-game client checks gameplay and text state. Browser/mobile emulation
is reported separately from physical phone testing.

Build 2026-10-21.1 verification: Chromium source and delivery and WebKit delivery
pass three update layouts; both source and delivery pass all seven lifecycle/
offline/file scenarios in Chromium and WebKit. Both engines pass round-end/name
entry on delivery. Chromium's 64 source/delivery scenes are pixel-identical,
the installed skill client passes, and real MP3 playback/offline switching/six
range responses pass on delivery. Inspected screenshots include About, all
notice layouts, retry, dark/reduced motion and offline gameplay. No physical
phone run or production deployment. Initial WebKit source update checks also
passed; the final expanded dark/multi-update coverage ran on delivery.

Read-only production HEAD checks on 2026-10-21 returned HTTP 200 for HTML and
worker, with `text/html`/`application/javascript`, Last-Modified and ETag headers.
The HTML length was 233679 bytes (the previous delivery). No Cache-Control header
was present in those responses; the server/CDN configuration was not changed.
