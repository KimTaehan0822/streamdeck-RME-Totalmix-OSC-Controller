# VU Dial Press Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the VU Dial pick what a press, a pressed-left turn and a pressed-right turn do, with defaults that match today.

**Architecture:** `VuDialAction` moves its press action from `onDialDown` to `onDialUp` and skips it when the dial turned while held. Rotation with `ev.payload.pressed` runs the chosen left/right action: a fader step on every tick, anything else once per hold and direction. The settings page adds a folded `Press actions` block.

**Tech Stack:** TypeScript, @elgato/streamdeck 3.0.4 (`DialRotateEvent.payload.pressed`, `DialUpEvent`), sdpi-components, node:test.

**Spec:** `docs/superpowers/specs/2026-11-07-vu-dial-press-actions-design.md`

## Global Constraints

- Settings keys: `pressAction` (`mute` | `recall`), `pressDb`, `leftAction` / `rightAction` (`step` | `muteToggle` | `muteOn` | `muteOff` | `recall`), `leftDb`, `rightDb`. Missing or unknown → `mute` / `step`.
- Unpressed rotation and touch tap behave exactly as today.
- Recall sets the fader in dB through the same path as the Fader key's Set (`setFader(c, t, value, 'db')`); an empty or non-numeric dB value sends nothing.
- Mute uses today's press path with `on` / `off` / `toggle`.
- Other dials (Gain, Pan, FX) do not change.
- Folded block title `Press actions`; a dB field shows only where `recall` is chosen.

## Review Focus

- Press, no turn, release → press action once; with defaults that is a mute toggle (today's behaviour, now on release).
- Press, turn, release → no press action.
- Pressed turn with a once-only action over several ticks → one command per hold per direction; a new hold fires again.
- A dial removed while held (`onWillDisappear` before `onDialUp`) leaves no stale hold state for the next press.
- Recall with `pressDb` blank or `abc` → nothing sent.

---

### Task 1: Press and pressed-turn actions in `VuDialAction`

**Files:**
- Modify: `src/actions/faders.ts` (`DialAction`, `VuDialAction`)
- Test: `test/actions-faders.test.mjs`

**Interfaces:**
- Consumes: `targetOf`, `setFader`, `adjustFader`, `num`, `pick` (all in `faders.ts` / `common.ts`); `DialUpEvent` from `@elgato/streamdeck`.
- Produces: `VuDialAction.onDialUp(ev)`; `DialAction.press` keeps its role for `PanDialAction` and `onTouchTap`.

- [ ] **Step 1: Write the failing tests**

In `test/actions-faders.test.mjs`, with output 3 at fader 0.5 and mute 0 (`msg`), `fake('d1', true, {...})`:
- `vu-dial press acts on release, not when turned while held`: `onDialDown` alone sends no `/output/3/mute`; `onDialUp` then sends `{ address: '/output/3/mute', args: [1] }`. A second hold: `onDialDown`, `onDialRotate(ev({ ticks: 1, pressed: true }))`, `onDialUp` → no new `/mute` message.
- `vu-dial press recall sets the chosen dB`: `{ pressAction: 'recall', pressDb: '-20' }`, down + up → last `/output/3/faderlin` is `dbToNormalized(-20)` (within 1e-6). With `pressDb: 'abc'` → nothing sent.
- `vu-dial pressed turns run the left and right actions once per hold`: `{ leftAction: 'muteOn', rightAction: 'recall', rightDb: '0' }`; down, rotate `ticks: -1, pressed: true` twice, rotate `ticks: 2, pressed: true` twice, up → exactly one `/output/3/mute` `[1]` and one `/output/3/faderlin` `[dbToNormalized(0)]`. Next hold: down, rotate `ticks: -1, pressed: true`, up → a second `/mute` message.
- `vu-dial pressed turn steps by default on every tick`: no action settings, `step: '1'`; down, rotate `ticks: 2, pressed: true` → `faderlin` is `dbToNormalized(normalizedToDb(0.5) + 2)`; up sends no `/mute`.
- Update `vu-dial press mutes, touch tap ...`: replace `await dial.onDialDown(on.ev())` with down then `await dial.onDialUp(on.ev())`.
- In `incomplete or invalid settings ...` add `await action.onDialUp?.(f.ev())` after `onDialDown`.

- [ ] **Step 2: Run to see them fail**

Run: `npx tsc -p . && node --test test/actions-faders.test.mjs`
Expected: the new tests FAIL (`onDialUp` is not a function, or a mute is sent on dial down).

- [ ] **Step 3: Implement in `src/actions/faders.ts`**

- `VuDialAction` keeps a `Map<string, { turned: boolean; fired: Set<'left' | 'right'> }>` keyed by action id: `onDialDown` sets a fresh entry (no command), `onDialUp` runs the press action unless `turned`, then deletes the entry; `onWillDisappear` deletes it too.
- `rotate`: when `ev.payload.pressed` is false keep today's step. When true, mark `turned`; direction = `ticks < 0 ? 'left' : 'right'`; action = `pick(s[dir + 'Action'], ...) ?? 'step'`; `step` adjusts by `ticks * step` as today; otherwise run once if that direction is not in `fired`.
- One helper `mute(t, op: BinaryOperation)` on the existing press path; `press(t)` becomes `mute(t, 'toggle')` so `onTouchTap` stays the same.
- Recall: `num(s[dir + 'Db'])` (`pressDb` for a press); finite → `this.apply(id, t, true, (c) => setFader(c, t, db, 'db'))`, else nothing.
- `DialAction.onDialDown` stays for `PanDialAction`; `VuDialAction` overrides it.

- [ ] **Step 4: Run the whole suite**

Run: `npx tsc -p . && timeout 200 node --test test/*.test.mjs`
Expected: all pass (165 before + the new ones).

- [ ] **Step 5: Commit**

```bash
git add src/actions/faders.ts test/actions-faders.test.mjs
git commit -m "feat: choose VU dial press and pressed-turn actions"
```

### Task 2: Folded `Press actions` block and docs

**Files:**
- Modify: `com.haeunga0822.rme-totalmix.sdPlugin/ui/vu-dial.html`
- Modify: `README.md` (VU Dial line)
- Doc: the online manual (Claude Doc, VU Dial section and action table) and scratchpad `manual.html`, PDF reprint

**Interfaces:**
- Consumes: Task 1 setting keys and values (Global Constraints).

- [ ] **Step 1: Add the block to `vu-dial.html`**

For `kind === 'vu-dial'` only: a `<details>` styled like `details.connection` in `common.js`, summary `Press actions`, holding three selects — `Press` (`mute` "Mute toggle", `recall` "Recall volume"), `Press + turn left` and `Press + turn right` (`step` "Step volume", `muteToggle` "Mute toggle", `muteOn` "Mute on", `muteOff` "Mute off", `recall` "Recall volume") — each followed by a `Recall volume (dB)` textfield (`pressDb` / `leftDb` / `rightDb`) shown only while its select is `recall` (toggle on `valuechange` and on first draw from saved settings).

- [ ] **Step 2: Check it in a browser**

Serve the `ui` folder and open `vu-dial.html` with a stubbed `SDPIComponents.streamDeckClient` (or install and open it in the Stream Deck app): block folded by default, dB fields appear only for `recall`.

- [ ] **Step 3: Docs**

README and manual: one line each — press and pressed-left/right actions can be chosen under `Press actions`; by default a press mutes on release and a pressed turn steps the volume.

- [ ] **Step 4: Deploy and commit**

Bundle, copy `bin/*` and `ui/vu-dial.html` to the installed plugin, restart its node process (manifest unchanged).

```bash
git add com.haeunga0822.rme-totalmix.sdPlugin/ui/vu-dial.html README.md docs/superpowers
git commit -m "feat: folded press action settings on the VU dial"
```
