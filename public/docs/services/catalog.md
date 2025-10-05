# Service Catalog (DI) — Neon Drift

This catalog enumerates the services that the game expects to be present at runtime (Dependency Injection).
Each service is registered via `src/game/services/index.js` (`register(name, impl)`), and resolved with `getService(name)`.

> **Required** means the game fails fast at boot if missing (via `verifyRequiredServices()`).
> **Optional** means the game can still run without it (feature degrades).

| Service name | Purpose | Minimal interface (required methods/fields) | Lifecycle |
|---|---|---|---|
| `bus` | Event bus instance | `{ on(event, fn) -> off, emit(event, payload) }` | disposable (off handlers) |
| `ui` | UI facade for overlays, HUD | `showCountdown(...), showGameOverOverlay(p), show/hide pause panel, bindOverlayButtons()` | idempotent init |
| `audio` | Sound/BGM/SFX abstraction | `prepareCountdown(el?), resumeAndUnlock(), startEngines(), killEngines(), cutAll(), bgmResetPlay(p)` | disposable |
| `dom` | DOM/element registry | `{ overlay, panel, tickerHUD, tickerInfoCanvas, tickerCanvas, tickerText, bgm }` | idempotent |
| `constants` | Tunable constants | exported values used across orchestrator & render | static |
| `render` (future) | Frame rendering orchestration | `drawFrame(ctx), prepareLevel(level), teardown()` | disposable |
| `input` (future) | Normalized input events | `onAction('pause'|'start'|...), dispose()` | disposable |

**Notes**
- Only the `Game` facade (and orchestration controllers) may resolve services directly.
- Controllers should not import implementations directly; prefer `getService('name')`.


---

## Dispose contract (Slice 19)
- Services **may** implement `dispose()` for cleanup (unsubscribe from bus, release AudioContext nodes, timers, workers, etc.).
- The orchestrator exposes `shutdown()` which calls `disposeHudSubscriptions()` and then disposes **all** registered services via the DI container.
- If a service implements `dispose()`, it will be invoked automatically during `shutdown()`.
