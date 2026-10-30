# Stream Deck plugin for TotalMix FX (no Companion) — design

## Intent

The user controls RME TotalMix FX from a Stream Deck through Companion and this module. They want the same
control, including the VU dial and two-key button faders built here, from a **Stream Deck plugin alone**,
so Companion is no longer needed. The Companion TotalMix module will be disabled once the plugin works, so
the two never run at the same time. Personal use on the user's own Windows PC with one **Stream Deck + XL**
and TotalMix FX in **Global OSC** mode (2.1+). Every action the Companion module has comes along, so nothing
is lost when Companion is switched off.

## Goals

- A native Stream Deck plugin that talks OSC to TotalMix directly and offers the actions listed below.
- The VU dial and two-key button faders look and behave like the Companion presets (see the three specs
  of 2026-10-29/30 in this folder: `vu-meter-preset`, `button-fader-presets`, `muted-fader-peek`).
- Every key shows live TotalMix state (on/off, values, channel name), like Companion feedbacks do now.

## Non-goals

- **Snapshot names.** TotalMix OSC reports only snapshot number and active state; no name path was found
  (RME forum, other OSC clients store names locally). Snapshots are shown by number only.
- **"Currently selected submix" as an output choice.** Only Legacy OSC has `labelSubmix`; it needs
  "Submix linked to OSC Control", and the plugin itself changes the selection (`/setSubmix`) to reach other
  targets, so the value would be unreliable. Global OSC has no such path. Every key names its output.
- **Legacy OSC (TotalMix 1.96 tables).** Global OSC only: no protocol-mode or bank-size setting, no Legacy
  code paths exposed or tested. The copied controller may keep its Legacy branches untouched (deleting them
  is optional cleanup, not required).
- Running alongside Companion's TotalMix module (same OSC ports). Not handled.
- Elgato Marketplace publishing, macOS support, multiple TotalMix connections. _(my call)_

## Anti-goals

- Slower or jerkier than the Companion setup (dial steps lagging, meters freezing) — failure even if it works.
- Changing the Companion module. This repo is only the source the plugin copies from.

## Constraints

- Elgato Stream Deck SDK v2 (`@elgato/streamdeck`, Node.js + TypeScript), Windows, a Stream Deck app version
  that supports the Stream Deck + XL.
- Target device: Stream Deck + XL (keys + dials + touch strip). The user says its per-dial strip segment is
  close enough to the Stream Deck +, so the dial drawing uses the Stream Deck + size (200×100 per dial).
- TotalMix supports one OSC remote per port pair; the plugin owns it.
- Stream Deck redraws are costly: key images must be throttled (only when changed; see State → screen).
- No migration of existing Companion pages; the user places the new actions by hand in the Stream Deck app.
  _(my call)_

## Approaches

- **A (picked): new repository, copy the Companion-free core once.** `src/osc/`, `src/protocol/`,
  `src/state/` (except `published-variables.ts` if unused), `src/model/` and their tests are copied into a new
  repo; `asIndex`/`asNumber` from `src/options.ts` are copied too (`model/preset-target.ts` needs `asIndex`).
  Simplest; the projects never affect each other. Cost: fixes made later here are not picked up automatically.
- B: `streamdeck/` package inside this repo sharing the code. One source of truth, but a more complex build
  and merge conflicts with the bitfocus upstream. Rejected by the user.
- C: fork an existing TotalMix Stream Deck plugin (soresore19xx/TotalMix-Controller, shells-dw/streamdeck-totalmix).
  Different code structure; VU and button faders would be rebuilt from scratch. Rejected.

## Architecture

- **Repo:** `C:\Users\user\streamdeck-rme-totalmix`, plugin UUID `com.haeunga0822.rme-totalmix`.
  _(my call)_
- **Connection (one per plugin):** the porting of `src/main.ts` lifecycle — start/stop `OscTransport`,
  `TotalMixController`, connection monitoring (Global `/status/*` + `/sendstate`),
  and the on-demand sync (`registerFeedbackRoute/Channel/Output`, `registerGlobalFeedback`,
  `registerChannelParameterFeedback`, level registration). An action instance registers its targets on
  `willAppear` and on settings change, and releases them on `willDisappear`.
- **Global settings** (Stream Deck global settings, edited from any action's Property Inspector): host,
  target port, feedback port, sync timeout — the same fields and defaults as `src/config.ts`, with the
  protocol fixed to Global OSC (no protocol, profile or bank-size field).
- **Per-action settings** (Property Inspector): channel (bus + index, from the channel list Global OSC
  discovers), output where the action needs a submix target, and the action-specific options below.
- **Drawing:** keys get SVG images via `setImage` (144×144); dials use a custom touch-strip layout with one
  full-size pixmap (200×100) updated via `setFeedback`. Pure render functions `state → SVG string`, so they
  are testable without a Stream Deck. Colours, fonts and geometry follow the Companion presets.
- **State → screen:** controller state changes mark affected action instances dirty; a per-instance throttle
  redraws at most every 40 ms (TotalMix's level rate) and skips identical images. One constant, lowered
  only if the manual test shows the Stream Deck app struggling. _(my call)_
- **Disconnected:** every key and dial shows a dimmed image with a small "OFFLINE" marker. _(my call;
  this is the "connection status" feature — no separate action)_

## Actions

Controller type in brackets. Channel actions show the TotalMix channel name. _(my call: channel name is
part of every channel action instead of a separate display-only action)_

| # | Action | Behaviour |
|---|---|---|
| 1 | Fader + VU meter [dial] | As the Companion preset: rotate ±1 dB, press = mute toggle, L/R bars, blue fader line, level dB / fader dB, MUTED + 0.7 s peek. Setting **"Touch to mute"** (on/off, default on _(my call)_): when on, a touch-strip tap toggles mute; when off, taps do nothing. |
| 2 | Button fader [key] | Setting: role top / bottom / left / right. Two keys with the same channel+output draw one fader as in the button-fader spec. Top/right +1 dB, bottom/left −1 dB, repeating while held (400 ms delay, then every 150 ms) until key-up — no 3 s limit now that the plugin owns the timer. Mute display only. |
| 3 | Snapshot [key] | Setting: mode **recall** (snapshot 1–8; press recalls, lit when active) or **show active** (no number setting; displays the active snapshot number, press does nothing). |
| 4 | Mute [key] | Toggle mute of channel; lit when muted. |
| 5 | Solo (PFL) [key] | Toggle PFL; lit when active. |
| 6 | Input gain [key] | Setting: step (dB, ±). Shows gain value; repeats while held like #2. |
| 7 | Input gain [dial] | Rotate = gain step, press = AutoSet toggle. Shows gain value and a bar. _(my call on press)_ |
| 8 | Input option [key] | Setting: 48V / Instrument / Pad / AutoSet. Toggle; lit when on. (48V is the requested phantom-power action.) |
| 9 | Global FX on/off [key] | Setting: Reverb / Echo. Toggle; lit when on. |
| 10 | Global FX parameter [key] | Setting: parameter (the `set_global_fx_parameter` list), mode set-to-value or step. Shows value. |
| 11 | Global FX parameter [dial] | Rotate = step, press = reset to a set value. Shows parameter name and value. |
| 12 | Pan [dial] | Rotate = pan step, press = centre. Shows pan value and a centre-zero bar. |
| 13 | Control Room [key] | Setting: the `control_room` functions (Dim, Mono, Talkback, …) plus "recall main volume". Lit when on. |
| 14 | Channel processing [key] | Setting: EQ / Dynamics (the `channel_processing_switch` list). Toggle; lit when on. |
| 15 | DURec [key] | Setting: transport function. Shows DURec state/time where TotalMix reports it. |
| 16 | Undo / Redo [key] | Setting: undo or redo. |
| 17 | Layout preset [key] | Setting: layout 1–6. |
| 18 | Fader [key] | Row input / playback / output, output (submix) target for input/playback rows, unit dB or linear. Mode **set** (to a value) or **step** (± amount, repeats while held like #2). Shows fader value. Covers the module's set/adjust fader and the submix (routing) fader keys. |
| 19 | Pan [key] | Same targets as #18. Mode set or step. Shows pan value. |
| 20 | Room EQ [key] | On/off toggle per output; lit when on. |
| 21 | Room EQ parameter [key] | Output, side, parameter, value (as `set_room_eq_parameter`). |
| 22 | DURec channel record [key] | Row input/output + channel; toggles that channel's DURec recording; lit when armed. |
| 23 | Quick Workspace [key] | Setting: workspace number. Send only (TotalMix reports no active state). |
| 24 | TotalMix window [key] | Show / hide. |

Also ported 1:1, for full parity with the module _(my call: you asked for nothing to be lost when
Companion is off)_: Group set/toggle, Output loopback, Channel option (set/toggle — phase, MS, stereo, cue,
width, …), Set channel name, Save snapshot, Channel processing parameter (set). Each is a key with the
module's options as settings and its state lit where the module has a feedback.

Actions a device does not support (no DURec, no Room EQ, no 48V on that input) show a greyed "N/A" instead
of failing silently.

## User guide (README)

The repo's `README.md` is the user guide. Because only Global OSC is supported, it states up front:

- **Required TotalMix version:** TotalMix FX 2.1 or newer (Global OSC). Older versions are not supported.
- **TotalMix OSC settings** (Options → Settings → OSC): enable the Global OSC remote, set the remote IP and
  the two ports to match the plugin's global settings (Windows Global OSC sends no feedback without an
  explicit destination), and the meter settings from this module's `companion/HELP.md` table — Send Peak
  Level Data on, Peak Hold off, Send changes on, linear fader scale optional.
- Install (double-click the `.streamDeckPlugin` file), where to enter host/ports, and a short list of the
  actions. The exact TotalMix menu wording is checked against TotalMix 2.1 while writing it.

## Testing

- Copied core tests keep passing (`codec`, `global-controller`, `fader-curve`, `resolver`,
  `target-synchronizer`, `transport`; `controller`/`profiles` too if the Legacy code is kept).
- New unit tests: render functions (key SVG contains the expected texts/colours for on, off, muted,
  offline); action handlers call the right controller method for a fake controller; hold-repeat stops on
  key-up and on `willDisappear`.
- Manual check on the user's hardware with TotalMix: every action once, meters smooth at 40 ms level updates.

## Left to the builder

- Exact SVG geometry and font sizes (start from the Companion preset coordinates, scaled ×2 for 144 px keys).
- Property Inspector technology (plain HTML + `sdpi-components` is fine) and how channel lists reach it.
- Icons for the action list, plugin name and category text.
- Whether `published-variables.ts` is needed after porting (`main.ts` uses it for Companion variables).
