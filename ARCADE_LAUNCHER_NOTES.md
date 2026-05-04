# Arcade launcher — notes from si-syn integration

A short list of friction points I hit while wiring si-syn into the arcade
platform, and concrete asks for the launcher repo. Bring this to
`paulgibeault.github.io` for triage.

The si-syn repo currently has a working local harness (`./ago`) — a stop-gap
that reproduces same-origin locally by rewriting absolute URLs and skipping the
launcher's service worker. The asks below are about lifting that into the
launcher so every game doesn't reinvent it.

---

## 1. Local-dev harness in the launcher repo

**Pain.** GAME_INTEGRATION.md §12 lists acceptance checks ("launcher save →
exported JSON contains the game's keys", "changing the launcher's font scale
visibly resizes text in the game", "switching to launcher view fires
onSuspend") that all require running both the launcher and the game
**same-origin**. There is no documented way to do that. Every integrator has
to:

- find both repos
- pick a port
- rewrite `https://paulgibeault.github.io/...` → `http://127.0.0.1:PORT/...`
  in the launcher HTML, the launcher SDK file, and the game's SDK `<script>`
- defang or skip the launcher's service worker (it caches a fixed asset list
  and silently masks edits)
- start one server, open browser

**Ask.** Ship `dev.sh` (or `dev.js`) in the launcher repo that takes one or
more sibling game-repo paths and stages everything same-origin:

```
# from paulgibeault.github.io
./dev.sh ../si-syn ../pi-game
# → http://127.0.0.1:4791/  with /si-syn/ and /pi-game/ mounted
```

The si-syn `./ago` script is a working reference implementation (~110 lines
of bash). Lifting it into the launcher repo and parameterizing on game dirs
gets every game's acceptance flow automated for free.

**Suggested defaults.**
- Bind `127.0.0.1` (not `0.0.0.0`); print `127.0.0.1` URLs (avoid IPv6
  ambiguity that bites `localhost`).
- Run `npm run build` in each game dir if it has `package.json`; otherwise
  serve the dir as-is.
- `dev.sh stop` to clean up.
- Skip SW registration in the staged launcher (see §3).

---

## 2. SDK URL portability

**Pain.** GAME_INTEGRATION.md §2 prescribes:

```html
<script src="https://paulgibeault.github.io/arcade-sdk.js"></script>
```

That hardcoded absolute URL means a same-origin local launcher fetches the
SDK over the public internet — which works, but the `event.origin` check in
the SDK (`e.origin !== window.location.origin`) can be subtle when the page
origin and the script origin disagree. More importantly: it has to be
rewritten by any local-dev harness.

**Ask.** Document both options and pick a recommendation:

| Option | `<script src="…">` | Works in production | Works in local launcher | Works opening game-repo's `index.html` standalone (no server) |
| --- | --- | --- | --- | --- |
| Absolute https | `https://paulgibeault.github.io/arcade-sdk.js` | ✅ | ⚠ requires rewrite or accepts cross-origin script | ✅ (fetches from CDN) |
| Root-relative | `/arcade-sdk.js` | ✅ | ✅ no rewrite | ❌ (would resolve to `file:///arcade-sdk.js`) |

I'd recommend root-relative + a one-line note that standalone-from-disk dev
needs an HTTP server (which is true anyway for `<script type="module">`).

If absolute is kept as the recommended form, GAME_INTEGRATION.md should
explicitly call out that local-launcher harnesses must rewrite it.

---

## 3. Service-worker behavior in dev

**Pain.** The launcher's `sw.js` caches a fixed asset list with
`cache.addAll(ASSETS_TO_CACHE)` and uses a stale-while-revalidate-style
fetch handler. In a local dev harness this:

- 404s on first load if any asset in the list is missing from the local
  stage,
- masks subsequent edits to launcher HTML/CSS until the cache version
  bumps.

The si-syn `./ago` works around this by sed-ing the SW registration call
out of the staged `index.html`. That's a hack.

**Ask.** Make the SW dev-aware. Cheapest options, in order of preference:

1. **Skip register on loopback hosts.** In `index.html`:
   ```js
   if ('serviceWorker' in navigator
       && !/^(127\.|localhost|0\.0\.0\.0)/.test(location.hostname)) {
     navigator.serviceWorker.register('sw.js')…
   }
   ```
   Net behavior change: GH Pages still gets PWA caching; local dev never
   does. Trivial to review.

2. **`?nosw=1` query opt-out.** Same shape, gated on a query flag. Slightly
   more flexible for testing the SW itself in dev.

3. **Self-unregister in dev.** The SW could check its own `registration.scope`
   on `install` and call `self.unregister()` if it looks like loopback. More
   complex; not worth it unless option 1 is rejected.

---

## 4. Settings-handshake observability

**Pain.** While verifying that `Arcade.settings.fontScale()` propagated from
the launcher into si-syn, there was no built-in way to see the postMessage
traffic without pasting `window.addEventListener('message', …)` into the
console of each frame. For a game with a slow-rendering UI, "did the
welcome arrive yet?" is a real question.

**Ask.** A tiny dev mode in the SDK:

```js
// arcade-sdk.js
if (localStorage.getItem('arcade.v1._meta.dev') === 'true') {
    var origPost = postToParent;
    postToParent = function (msg) { console.debug('[Arcade →]', msg); origPost(msg); };
    var origOn = onMessage;
    onMessage = function (e) { console.debug('[Arcade ←]', e.data); origOn(e); };
}
```

And on the launcher side, expose a "Dev mode" toggle in settings or `?dev=1`
that flips that key in storage (one global key, both sides honor it). All
games light up at once.

---

## 5. Acceptance-checklist runner (stretch)

**Pain.** §12's eight acceptance checks are good but manual. For per-game
CI / pre-deploy verification:

```
$ npx @arcade/acceptance http://127.0.0.1:4791/si-syn/
✓ loads with no console errors
✓ Arcade.context.framed === true
✓ writes at least one arcade.v1.si-syn.* key
✓ no legacy non-namespaced keys remain
✓ launcher save → contains si-syn keys
✓ font-scale propagates without reload
✗ onSuspend / onResume   (suspend never fired — game is missing the SDK call?)
✓ standalone URL still works
✓ no SW interception of /arcade-sdk.js
```

Could ship as a thin Puppeteer/Playwright wrapper over the protocol. Lower
priority than §1–§3, but very high value once the harness exists, and
catches regressions automatically.

---

## 6. Minor doc nits

- `GAME_INTEGRATION.md §10` says SW must be scoped to `/<gameId>/`, but the
  launcher repo's own SW is at `/sw.js` (root scope). Worth adding a
  sentence: "the launcher's SW lives at root and intentionally caches only
  launcher-owned files". It's correct today, just not stated.
- `ARCADE_PLATFORM.md` references `[index.html:1405]` and `[index.html:1622-1627]`
  but the file has drifted (current iframe creation is around line 540).
  Either remove the line numbers or backfill.

---

## Priorities

If this list is too long, the high-leverage ones are:

1. **§1** — local dev harness. Unblocks every future integration.
2. **§3** — SW skip on loopback. Three-line change, removes a class of "why
   isn't my edit showing up" bugs.
3. **§2** — SDK URL guidance. Doc-only.

The rest are quality-of-life.
