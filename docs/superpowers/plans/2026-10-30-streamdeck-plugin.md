# Stream Deck plugin for TotalMix FX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Windows Stream Deck plugin that controls TotalMix FX over Global OSC without Companion, with every action of the Companion module plus the VU dial and two-key button faders.

**Architecture:** New repo. The Companion-free core of `companion-module-rme-totalmix` (`osc/`, `protocol/`, `state/`, `model/`) is copied unchanged. A `TotalMixConnection` replaces `src/main.ts`'s lifecycle and exposes the same `register*` methods, so value-reading logic from `src/feedbacks.ts` ports almost line for line into pure "reader" functions. Actions are `SingletonAction`s that read state through readers, draw with pure `state → SVG` render functions, and redraw through a 40 ms throttle.

**Tech Stack:** TypeScript, Node.js 20 (Stream Deck runtime), `@elgato/streamdeck` (Node SDK, current version, pinned), `@elgato/cli` for linking/packing, Rollup for bundling, `node --test` for tests, `sdpi-components` for Property Inspectors.

**Spec:** `docs/superpowers/specs/2026-10-30-streamdeck-plugin-design.md` (in `companion-module-rme-totalmix`; Task 1 copies it into the new repo).

**Source repo** (read-only reference, called SRC below): `C:\Users\user\companion-module-rme-totalmix`.

## Global Constraints

- Repo: `C:\Users\user\streamdeck-rme-totalmix`; plugin UUID `com.haeunga0822.rme-totalmix`; action UUIDs `com.haeunga0822.rme-totalmix.<action-id>`.
- Global OSC only. The controller is always created with `protocolMode: 'global'`. No protocol, profile or bank-size setting anywhere (pass `bankSize: 48` internally).
- Target device Stream Deck + XL. Keys drawn at 144×144; each dial's touch-strip segment drawn at 200×100.
- Global settings: `host` (default `127.0.0.1`), `targetPort`, `feedbackPort`, `syncTimeoutMs` — defaults copied from SRC `src/config.ts`.
- Redraw throttle: at most one image per action instance per 40 ms; identical images are not resent. One exported constant `REDRAW_MS = 40`.
- Colours (from SRC `src/presets.ts`): green `rgb(40,200,80)`, yellow `rgb(240,210,40)` from −18 dB, red from −3 dB, fader line blue `rgb(40,140,255)` with black outline, text white with black outline, MUTED red, mute bars at 40 % opacity with red `/` hatching. Fader peek window 700 ms (`FADER_PEEK_MS`).
- Disconnected → every action shows its image dimmed with an "OFFLINE" marker. Unsupported capability → greyed "N/A".
- Do not modify SRC.

## Review Focus

1. **TotalMix closed or wrong ports** — plugin must not crash; all keys go OFFLINE within 10 s and recover by themselves when TotalMix comes back. → Task 2 test `goes offline after 10 s without messages and back online on the next message`.
2. **Global settings changed while running** (port edited in Property Inspector) — old UDP socket must be closed before the new one binds, or binding fails with EADDRINUSE. → Task 2 test `restart closes the old transport before starting the new one`.
3. **Key released after the action disappeared** (page switch while holding a button fader) — repeat must stop; a stuck repeat would keep raising the volume. → Task 6 test `stop() on willDisappear ends repeating`.
4. **Two button-fader keys with different channels** — each key draws its own channel; no shared state between instances other than the TotalMix state. → Task 8 test `two instances with different targets render independently`.
5. **Channel settings missing or invalid** (freshly dropped action, channel later hidden in TotalMix) — show a "SET CHANNEL" / "N/A" image, never throw. → Task 7 test `missing target renders the setup hint`.

---

## File Structure

```
streamdeck-rme-totalmix/
  package.json, tsconfig.json, rollup.config.mjs, README.md, .gitignore
  docs/superpowers/specs/…-design.md, docs/superpowers/plans/…-plugin.md   (copied)
  src/osc/  src/protocol/  src/state/  src/model/        (copied from SRC unchanged)
  src/util/options.ts            asIndex, asNumber (copied from SRC src/options.ts)
  src/connection.ts              TotalMixConnection (lifecycle, registration, background sync)
  src/readers.ts                 pure state readers ported from SRC src/feedbacks.ts
  src/render/svg.ts              key primitives: text, background, offline/N/A overlays, data URL
  src/render/meter.ts            VU strip (200×100) and button-fader halves (144×144)
  src/render/keys.ts             toggle key, value key, snapshot key renderers
  src/runtime/redraw.ts          Redrawer (40 ms throttle + dedupe)
  src/runtime/hold.ts            HoldRepeater (400 ms delay, 150 ms interval)
  src/runtime/base-action.ts     TotalMixAction base class (connection wiring, redraw, keepalive)
  src/actions/*.ts               one file per action family (see tasks)
  src/plugin.ts                  entry: global settings → connection, register all actions
  com.haeunga0822.rme-totalmix.sdPlugin/
    manifest.json, layouts/strip.json, imgs/…, ui/*.html (Property Inspectors), bin/ (build output)
  test/*.test.mjs                copied core tests + new tests (import from ../dist/)
```

Build: `tsc` → `dist/` (tests import from `../dist/…` exactly like SRC tests); `rollup` bundles `src/plugin.ts` → `*.sdPlugin/bin/plugin.js`. Scripts: `build` (tsc), `bundle` (rollup), `test` (`build && node --test test/*.test.mjs`), `watch` (rollup -w + `streamdeck restart`), `pack` (`streamdeck pack *.sdPlugin`).

---

### Task 1: Scaffold the repo and copy the core

**Files:**
- Create: everything under `streamdeck-rme-totalmix/` listed above except `src/connection.ts`, `src/readers.ts`, `src/render/`, `src/runtime/`, `src/actions/`, `ui/`.
- Copy unchanged from SRC: `src/osc/*`, `src/protocol/*`, `src/state/*`, `src/model/**`, tests `codec`, `global-controller`, `controller`, `fader-curve`, `resolver`, `target-synchronizer`, `transport`, `profiles`, `published-variables`.
- Copy `asIndex`, `asNumber` from SRC `src/options.ts` into `src/util/options.ts`; change the import in `src/model/preset-target.ts` to `../util/options.js` (the only edit to copied code).

**Interfaces:** Produces the core modules at the same relative paths as SRC, so SRC code snippets port with unchanged imports.

- [ ] **Step 1:** `git init`, `package.json` (`"type": "module"`, engines node ≥ 20), install `@elgato/streamdeck` (pin exact), dev: `typescript`, `@types/node`, `rollup`, `@rollup/plugin-typescript`, `@rollup/plugin-node-resolve`, `@rollup/plugin-commonjs`, `@elgato/cli`. `tsconfig.json`: `module`/`moduleResolution` `NodeNext`, `target` ES2022, `strict`, `verbatimModuleSyntax`, `experimentalDecorators` off (SDK uses standard decorators), `outDir dist`, `rootDir src`.
- [ ] **Step 2:** Copy core files and tests as listed. Copy the spec and this plan into `docs/superpowers/`.
- [ ] **Step 3:** Minimal `manifest.json` (Name "RME TotalMix", UUID, `SDKVersion: 2`, `CodePath: bin/plugin.js`, `Nodejs: { Version: "20" }`, `OS: [{ Platform: "windows", MinimumVersion: "10" }]`, `Software.MinimumVersion` = lowest Stream Deck app version that supports the Stream Deck + XL — look it up in Elgato's release notes, `Actions: []`) and a `src/plugin.ts` that only calls `streamDeck.connect()`.
- [ ] **Step 4: Verify** `npm test` → all copied tests PASS; `npm run bundle` → `bin/plugin.js` exists; `npx streamdeck link com.haeunga0822.rme-totalmix.sdPlugin` → plugin listed in Stream Deck app without errors.
- [ ] **Step 5: Commit** `chore: scaffold plugin and copy TotalMix core`.

### Task 2: TotalMixConnection

**Files:** Create `src/connection.ts`; Test `test/connection.test.mjs`.

**Interfaces:**
- Consumes: `OscTransport`, `TotalMixController`, `TargetSynchronizer` (copied core).
- Produces:
  ```ts
  export interface ConnectionSettings { host: string; targetPort: number; feedbackPort: number; syncTimeoutMs: number }
  export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
  export type GlobalFeedbackTarget = 'snapshots' | 'groups' | 'controlRoom' | 'globalFx' | 'duRec'
  export interface ConnectionDeps { createTransport?: (o: OscTransportOptions, c: OscTransportCallbacks) => Pick<OscTransport,'start'|'send'|'close'>; now?: () => number }
  export class TotalMixConnection {
    constructor(deps?: ConnectionDeps)
    readonly controller: TotalMixController          // replaced on each start()
    get status(): ConnectionStatus
    get online(): boolean                             // status === 'connected'
    start(settings: ConnectionSettings): void         // stops the previous transport first
    stop(): void
    onChange(listener: () => void): () => void        // fires (coalesced with setImmediate) on any state/status change
    registerRoute(target: SubmixTarget): void
    registerChannel(target: MixerChannelTarget): void // output bus → registerOutput
    registerOutput(output: number): void
    registerGlobal(target: GlobalFeedbackTarget): void
    registerChannelParameter(target: MixerChannelTarget, parameter: string): void
    registerRoomEq(output: number, side: RoomEqSide, parameter: string): void
    run(operation: (c: TotalMixController) => Promise<void>): Promise<void>  // logs and swallows errors like SRC runCommand
  }
  ```
- Port from SRC `src/main.ts`: `startConnection` (Global branch only), `stopConnection`, `monitorConnection` (Global: status request when quiet > 2 s, offline after 10 s, `markStale()`), `syncNextBackgroundTarget` (Global branch; 250 ms interval), the `register*` bodies without `publishVariable`. Registration keeps SRC's 10 s TTL; keeping targets alive is the actions' job (Task 6).

- [ ] **Step 1: Write failing tests** with a fake transport recording `send` calls and exposing the callbacks, and an injectable `now`:
  - `start sends the Global OSC initial state request on listening` → after `callbacks.onListening()`, sent addresses equal what `controller.requestInitialState()` sends (assert the first address against `global-controller.test.mjs`'s expectation).
  - `becomes connected on the first message` → `status === 'connected'`, one `onChange` call.
  - `goes offline after 10 s without messages and back online on the next message`.
  - `restart closes the old transport before starting the new one` → order of fake `close`/`start` calls is `[start#1, close#1, start#2]`.
  - `registered route is synced by the background loop` → after `registerRoute(t)` and one tick, a `/sendsubmix/<output>` send appears.
- [ ] **Step 2: Run** `npm test` → new tests FAIL (module missing).
- [ ] **Step 3: Implement** `src/connection.ts` as specified.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: TotalMix connection lifecycle`.

### Task 3: Readers

**Files:** Create `src/readers.ts`; Test `test/readers.test.mjs`.

**Interfaces:**
- Consumes: `TotalMixConnection`.
- Produces (every reader registers what it reads, exactly as the SRC feedback it ports):
  ```ts
  export type MixTarget = PresetMixerTarget   // from model/preset-target.ts: input/playback {source,destination} | output {output}
  export function channelOf(t: MixTarget): MixerChannelTarget
  export function channelName(c, t: MixerChannelTarget): string
  export function faderNormalized(c, t: MixTarget): number | undefined
  export function faderDb(c, t: MixTarget): string                 // '' when unknown
  export function levelNormalized(c, t: MixTarget, side: 'left'|'right'): number   // 0 when unknown
  export function levelDb(c, t: MixTarget): string
  export function muted(c, t: MixTarget): boolean
  export function soloed(c, t: SourceTarget): boolean
  export function gainText(c, input: number): string
  export function gainNormalized(c, input: number): number | undefined
  export function panValue(c, t: MixTarget): number | undefined     // 0..1
  export function panText(c, t: MixTarget): string                 // 'L' | 'R' | 'C' | number
  export function channelParameter<T>(c, t: MixerChannelTarget, parameter: string): T | undefined
  export function globalParameter<T>(c, parameter: string): T | undefined   // registers the matching GlobalFeedbackTarget
  export function activeSnapshot(c): number | undefined
  export function roomEqParameter<T>(c, output: number, side: RoomEqSide, parameter: string): T | undefined
  export function hasCapability(c, kind: 'gain'|'phantom'|'instrument'|'pad'|'autoset'|'duRec'|'globalFx'|'roomEq'|'channelFx', input?: number): boolean
  ```
- Port bodies from SRC `src/feedbacks.ts`: `preset_value` / `preset_state` callbacks (lines ~898–1030), helpers `channelLevelDb`, `formatGainFeedback`, `normalizedGain`, `compactGaugeChannelName`, `panPosition`, `panDisplay`, `panCentered`, and the snapshot/group/control-room/global-FX/room-EQ/DURec feedback callbacks. `globalOsc` is always `true`; drop Legacy branches. Mute of an output target reads channel parameter `mute` (as SRC).

- [ ] **Step 1: Write failing tests** feeding OSC messages through `connection.controller.handleMessage(...)` (message shapes from `global-controller.test.mjs`):
  - `levelNormalized right side reads the next channel of a stereo pair` (stereo param true → right uses index+1).
  - `faderDb prefers the TotalMix display text`, falls back to `formatDb(normalizedToDb(v))`.
  - `muted reads output mute from the channel parameter`.
  - `activeSnapshot returns the snapshot TotalMix reports as active`.
  - `readers register their targets` → after `faderDb` on an input target, the connection's background loop syncs that route (reuse Task 2 fake).
- [ ] **Step 2: Run** → FAIL.  **Step 3: Implement.**  **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: state readers ported from Companion feedbacks`.

### Task 4: SVG primitives and simple key renderers

**Files:** Create `src/render/svg.ts`, `src/render/keys.ts`; Test `test/render-keys.test.mjs`.

**Interfaces:**
```ts
// svg.ts
export const KEY = 144
export function svgDataUrl(svg: string): string                 // 'data:image/svg+xml;charset=utf8,' + encodeURIComponent(svg)
export function escapeXml(text: string): string
export function outlinedText(x: number, y: number, text: string, opts: { size: number; fill: string; anchor?: 'start'|'middle'|'end' }): string
export function frame(width: number, height: number, body: string, overlay: Overlay): string
export type Overlay = 'none' | 'offline' | 'unsupported' | 'setup'   // dim + "OFFLINE" | grey + "N/A" | "SET CHANNEL"
// keys.ts
export interface ToggleKeyView { title: string; label?: string; on: boolean; onColor: string; overlay: Overlay }
export function renderToggleKey(v: ToggleKeyView): string           // returns svg string (not data URL)
export interface ValueKeyView { title: string; value: string; bar?: number /*0..1*/; overlay: Overlay }
export function renderValueKey(v: ValueKeyView): string
export interface SnapshotKeyView { number: number | undefined; active: boolean; mode: 'recall'|'show'; overlay: Overlay }
export function renderSnapshotKey(v: SnapshotKeyView): string
```
Text sizes: title 26 px, value 34 px, minimum 20 px; long names are cut to fit with "…" (my call: no shrinking, consistent with the button-fader spec).

- [ ] **Step 1: Failing tests:** `toggle key on uses onColor background`; `offline overlay contains OFFLINE and dims body` (opacity ≤ 0.4); `xml special chars in channel names are escaped` (`A&B<1>` → `A&amp;B&lt;1&gt;`); `show-mode snapshot key shows the active number`.
- [ ] **Step 2–4:** run FAIL → implement → run PASS.
- [ ] **Step 5: Commit** `feat: SVG key renderers`.

### Task 5: Meter renderers (VU strip, button-fader halves)

**Files:** Create `src/render/meter.ts`; Test `test/render-meter.test.mjs`.

**Interfaces:**
```ts
export interface MeterView {
  name: string; fader?: number /*0..1*/; left: number; right: number /*0..1, fader curve*/;
  faderDb: string; levelDb: string; muted: boolean; peek: boolean /*muted && adjusted within 700 ms*/; overlay: Overlay
}
export function renderVuStrip(v: MeterView): string                                   // 200×100
export type FaderRole = 'top' | 'bottom' | 'left' | 'right'
export function renderButtonFader(v: MeterView, role: FaderRole): string              // 144×144
```
Geometry: port SRC `src/presets.ts` — VU dial `fader-vu-encoder` (~line 461, `vuGauge` ~88, `vuText` ~433, mute hatch ~377–400) scaled to 200×100; button faders `buttonFader()` (~476–593) scaled ×2. Bottom/left key covers fader-curve 0–0.5, top/right 0.5–1; a bar or the fader line outside a key's half is clamped and the line is hidden. Colour stops at `dbToNormalized(-18)` and `dbToNormalized(-3)`. Text placement per role from the button-fader spec Layout section. Mute: bars 40 % opacity, red hatching, value texts hidden, red MUTED where the fader dB normally is; `peek` replaces MUTED with white fader dB.

- [ ] **Step 1: Failing tests:** `bottom half shows a full bar when level is above 0.5 and top half shows the rest` (rect widths/heights); `fader line only in the key whose half contains it`; `muted shows MUTED and hides level dB`; `peek shows fader dB instead of MUTED`; `vu strip is 200x100`.
- [ ] **Step 2–4:** FAIL → implement → PASS. The tests also write each SVG to `test/out/*.svg` (git-ignored); open them in a browser next to a screenshot of the Companion presets and adjust coordinates until they match.
- [ ] **Step 5: Commit** `feat: VU strip and button fader renderers`.

### Task 6: Runtime — redraw throttle, hold repeat, base action, plugin entry, Property Inspector

**Files:** Create `src/runtime/redraw.ts`, `src/runtime/hold.ts`, `src/runtime/base-action.ts`, `src/plugin.ts`, `ui/common.js`, `ui/global.html` (fragment included by every PI); Test `test/runtime.test.mjs`.

**Interfaces:**
```ts
// redraw.ts
export const REDRAW_MS = 40
export class Redrawer { constructor(draw: (image: string) => Promise<void>, now?: () => number, schedule?: (fn: () => void, ms: number) => unknown)
  request(render: () => string): void   // at most one draw per REDRAW_MS, latest render wins, skips identical output
  dispose(): void }
// hold.ts
export class HoldRepeater { constructor(step: () => void, delayMs = 400, intervalMs = 150, schedule?/cancel? injectable)
  start(): void   // steps once immediately, then after delay every interval
  stop(): void }
// base-action.ts
export abstract class TotalMixAction<S extends JsonObject> extends SingletonAction<S> {
  constructor(connection: TotalMixConnection)
  protected abstract render(settings: S, ctx: { dial: boolean }): string   // svg; base wraps in data URL / feedback
  protected abstract register(settings: S): void                          // calls connection.register*/readers
}
```
Base class behaviour: `onWillAppear` → keep instance (id → action, settings, Redrawer), register, draw; `onDidReceiveSettings` → update, register, draw; `onWillDisappear` → dispose Redrawer and any HoldRepeater; `connection.onChange` and a 2 s keepalive timer → re-register and `request` redraw for all visible instances. Dials: `setFeedbackLayout('layouts/strip.json')` once on appear, then `setFeedback({ canvas: dataUrl })`; keys: `setImage(dataUrl)`. `layouts/strip.json`: one `pixmap` item `canvas` at rect `[0,0,200,100]`.

`plugin.ts`: read global settings (defaults from Global Constraints) → `connection.start`; on `onDidReceiveGlobalSettings` restart only if a field changed; register every action from Tasks 7–10; `streamDeck.connect()`.

Property Inspector: `sdpi-components` (pin version, loaded from the `ui/` folder, not a CDN). Every PI includes the global block (host, target port, feedback port, sync timeout; bound with `global` attribute). Channel/output dropdowns use an sdpi `datasource`: the plugin answers `sendToPlugin { event: 'getChannels', bus }` with the discovered channels (`controller.state.getDiscoveredChannels(bus, fallbackProfileChannels)` → `{ value: index, label }`).

- [ ] **Step 1: Failing tests:** `Redrawer draws at most once per 40 ms and the last render wins`; `Redrawer skips identical images`; `HoldRepeater steps at 0, 400, 550, 700 ms`; `stop() on willDisappear ends repeating` (no step after stop).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: plugin runtime and global settings` (end-to-end check happens with the first real actions in Task 7).

### Task 7: Channel toggle keys

**Files:** Create `src/actions/channel-toggles.ts`, `ui/channel-toggle.html`; manifest entries; Test `test/actions-toggles.test.mjs`.

Actions (one class each, shared helper for "channel + operation" settings; operation `toggle|on|off`, default toggle):

| id | Settings | Press | Lit when | Controller call |
|---|---|---|---|---|
| `mute` | row, channel | operation | muted | `setMute` (output row → `setChannelOption(target,'mute',op)`) |
| `solo` | row (input/playback), channel | operation | PFL on | `setSolo` |
| `input-option` | input, option `phantom|instrument|pad|autoset` | operation | option on | `setChannelOption` (N/A if `!hasCapability`) |
| `processing` | row, channel, `eqEnable|compexpEnable|lowcutEnable|alevEnable` | operation | on | `setChannelOption` (list = SRC `channel_processing_switch`) |
| `channel-option` | row, channel, option (SRC `channel_option` list, Global entries) | operation or value | on | `setChannelOption` / `setChannelParameterValue` |
| `loopback` | output | operation | on | `setChannelOption({bus:'output',index}, 'loopback', op)` |
| `group` | type `mute|pfl|fader`, group 1–4 | operation | active | `setGroup` |

Every key shows the channel name (title) and the option label (label).

- [ ] **Step 1: Failing tests** (fake connection + fake `ev.action`): `missing target renders the setup hint`; `mute press toggles via setMute`; `48V on an input without phantom renders N/A and does not send`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Manual check** on the Stream Deck + XL with TotalMix: each action toggles and lights; close TotalMix → OFFLINE within 10 s; reopen → recovers.
- [ ] **Step 6: Commit** `feat: channel toggle keys`.

### Task 8: Fader-family keys and dials

**Files:** Create `src/actions/faders.ts`, `ui/fader.html`, `ui/vu-dial.html`; Test `test/actions-faders.test.mjs`.

| id | Type | Settings | Behaviour |
|---|---|---|---|
| `vu-dial` | dial | MixTarget, `touchMute` (bool, default true) | rotate ±1 dB per tick (`adjustSubmixFader`/`adjustOutputFader`, unit db, then `markFaderAdjusted`, redraw again after 700 ms); press = mute toggle; touch tap = mute toggle only if `touchMute`; draws `renderVuStrip` |
| `button-fader` | key | MixTarget, role `top|bottom|left|right` | top/right +1 dB, bottom/left −1 dB via HoldRepeater until key-up; draws `renderButtonFader` |
| `fader` | key | MixTarget, unit db/linear, mode `set|step`, value | set: `setSubmixFader`/`setOutputFader`; step: HoldRepeater; shows fader value |
| `pan-dial` | dial | MixTarget, step (default 1 % ) | rotate = adjust pan, press = centre (`set…Pan(…, 0.5)`); value bar centred |
| `pan` | key | MixTarget, mode set/step, value | as fader key for pan |

- [ ] **Step 1: Failing tests:** `vu-dial rotate of 3 ticks adjusts by +3 dB`; `touch tap does nothing when touchMute is off`; `two instances with different targets render independently`; `button-fader key-up stops repeating`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Manual check:** VU bars move smoothly at TotalMix's 40 ms level rate (TotalMix settings from the README); compare with the Companion dial side by side before Companion is disabled.
- [ ] **Step 6: Commit** `feat: VU dial, button faders, fader and pan controls`.

### Task 9: Gain and FX controls

**Files:** Create `src/actions/gain-fx.ts`, `ui/gain.html`, `ui/fx.html`; Test `test/actions-gain-fx.test.mjs`.

| id | Type | Settings | Behaviour |
|---|---|---|---|
| `gain` | key | input, step dB (default +1) | HoldRepeater `adjustInputGain`; shows `gainText`; N/A without gain capability |
| `gain-dial` | dial | input, step per tick (default 1 dB) | rotate adjust; press = AutoSet toggle (N/A text if no AutoSet); bar = `gainNormalized` |
| `global-fx` | key | `reverbEnable|echoEnable`, operation | `setGlobalFxOption`; lit when on |
| `fx-param` | key | parameter (SRC `set_global_fx_parameter` list), mode set/step, value | `setGlobalFxParameter`; step = current + value |
| `fx-param-dial` | dial | parameter, step per tick, reset value | rotate step, press = set reset value; shows parameter label + display value |
| `processing-param` | key | row, channel, parameter (SRC `channelProcessingParameters`), value | `setChannelParameterValue` |

- [ ] **Step 1: Failing tests:** `gain dial press toggles autoset`; `fx-param step adds to the current value`; `gain on input without gain capability renders N/A`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: gain and FX controls`.

### Task 10: Global keys

**Files:** Create `src/actions/global.ts`, `ui/global-keys.html`; Test `test/actions-global.test.mjs`.

| id | Settings | Behaviour |
|---|---|---|
| `snapshot` | mode `recall` (+ number 1–8) / `show` | recall: `recallSnapshot(n)`, lit when active; show: displays `activeSnapshot`, press does nothing |
| `save-snapshot` | number 1–8 | `saveSnapshot` |
| `control-room` | function (SRC `globalControlRoomPaths` keys) or `recallMainVolume`, operation | `setControlRoom` / `recallMainOutputVolume`; lit when on |
| `durec` | command (`recordStop|record|stop|playPause|next|previous`) | `duRecTransport`; shows state/time from `globalParameter('recordState'/'recordTime')`; N/A without DURec |
| `durec-channel` | row input/output, channel | toggle channel parameter `recordEnable`; lit when armed |
| `undo-redo` | command | `undoRedo` |
| `layout` | 1–6 | `loadLayoutPreset` |
| `quick-workspace` | number | `loadQuickWorkspace`; never lit |
| `window` | show/hide | `showWindow` |
| `room-eq` | output, side, operation | `setRoomEqOption`; lit when on; N/A without Room EQ |
| `room-eq-param` | output, side, parameter, value | `setRoomEqParameter` |
| `channel-name` | row, channel, name | `setChannelName`; shows current name |

- [ ] **Step 1: Failing tests:** `show-mode snapshot key displays the active snapshot and ignores presses`; `recall-mode key lit only when its snapshot is active`; `durec renders N/A without DURec capability`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: snapshot, control room, DURec and other global keys`.

### Task 11: README, icons, packaging, full manual pass

**Files:** `README.md`, `com.haeunga0822.rme-totalmix.sdPlugin/imgs/*` (action list icons 20×20/40×40 and key defaults 72×72/144×144, simple monochrome SVG/PNG), manifest Category "RME TotalMix".

README content (Korean + English headings, user-facing): required **TotalMix FX 2.1 or newer** (Global OSC; older not supported); TotalMix OSC settings (Options → Settings → OSC — enable Global OSC remote, remote IP, ports matching the plugin, Send Peak Level Data on, Peak Hold off, Send changes on, linear scale optional — wording checked against TotalMix 2.1 on the user's PC); install by double-clicking the `.streamDeckPlugin`; where to enter host/ports; action list with one line each; "turn off the Companion TotalMix module first (same ports)".

- [ ] **Step 1:** Write README, icons, manifest metadata.
- [ ] **Step 2: Verify** `npm test` → all PASS; `npx streamdeck validate com.haeunga0822.rme-totalmix.sdPlugin` → no errors; `npm run pack` → `.streamDeckPlugin` file created.
- [ ] **Step 3: Manual pass** on the Stream Deck + XL: every action in the spec's table once (Companion module disabled), port change in global settings without restarting Stream Deck, TotalMix close/reopen.
- [ ] **Step 4: Commit** `docs: user guide and packaging`.
