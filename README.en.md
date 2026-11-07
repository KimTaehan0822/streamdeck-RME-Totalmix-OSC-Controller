# RME TotalMix – Stream Deck Plugin

[한국어](README.md) | **English** | [日本語](README.ja.md)

Control **RME TotalMix FX** with the keys and dials of an Elgato Stream Deck. Faders, mute, solo, gain, FX and snapshots are one key away, and the keys and dial screens show level meters. The plugin talks to TotalMix directly over **Global OSC**, so no other program is needed.

## Download

Get `RME-TotalMix-StreamDeck-v<version>.zip` from the [latest release](https://github.com/KimTaehan0822/streamdeck-rme-totalmix-OSC/releases/latest) page and unzip it. It contains:

- `RME-TotalMix.streamDeckPlugin`: the installer
- The manual as PDF (one per language)
  - `RME TotalMix 스트림덱 플러그인 사용설명서.pdf`: Korean
  - `RME TotalMix Stream Deck Plugin Manual (English).pdf`: English
  - `RME TotalMix Stream Deck プラグイン 取扱説明書 (日本語).pdf`: Japanese
- `THIRD-PARTY-NOTICES.txt`: notices for the open-source software used

## Requirements

- Windows
- Stream Deck software 7.3 or later
- **TotalMix FX 2.1 or later**: Global OSC is required; earlier versions are not supported.
- The dial actions need a Stream Deck +. The key actions work on every Stream Deck.

## Quick start

### 1. Install the plugin

Double-click `RME-TotalMix.streamDeckPlugin` and approve when the Stream Deck software asks to install it.

### 2. Turn on OSC in TotalMix

1. Turn on **Options → Enable OSC Control**. When this switch is off, TotalMix ignores all OSC.
2. In the OSC settings, set the **incoming port to 7001** and the **outgoing port to 9001**.
3. Enter `127.0.0.1` in **Remote Controller Address → IP or Host Name**. This is the value when TotalMix and the Stream Deck run on the same PC. On Windows, TotalMix sends no state back while this field is empty.
4. Choose **Global OSC** in **Compatibility (Mode)**, open **Details** and set it as below.

| TotalMix item | Setting |
| --- | --- |
| Send changes | On (required) |
| Send all data on start | Off |
| Send status | On (recommended) |
| Re-send received | On (recommended) |
| Send faders in linear scale | Either (both supported) |

5. To see level meters, turn on **Send Peak Level Data** and turn off **Peak Hold** in the main OSC settings.

### 3. Make your first keys

1. Open the **RME TotalMix** category in the action list of the Stream Deck software.
2. For example, drag **Fader(2-Button)** onto two keys. Make one the up key and the other the down key, and choose the same channel on both.
3. Before TotalMix is connected, the channel lists show the numbers 1 to 48; once connected they show the real channel names.

## Connection settings (ports)

Select any action and open **▸ TotalMix connection (OSC)** at the very bottom of the settings screen. All actions share these settings.

| Item | Default |
| --- | --- |
| Host | `127.0.0.1` |
| TotalMix port | `7001` |
| Feedback port | `9001` |
| Sync timeout (ms) | `500` |

**If the OSC ports overlap with another program**, for example when the TotalMix module of Bitfocus Companion runs at the same time on the same ports, change the ports. Turn on a second OSC remote in TotalMix with different ports (e.g. incoming 7002 / outgoing 9002), then enter the same numbers in **TotalMix port** and **Feedback port** above. Port changes apply without restarting the Stream Deck software.

## Settings screen language

Open **▸ Language** at the very bottom of the settings screen and choose **English / 한국어 / 日本語**. The settings screen text changes immediately and applies to every action. The default is English. Text on the keys (OFFLINE etc.) and the names in the action list do not change.

## Actions

**Channel keys**

| Action | What it does |
| --- | --- |
| Mute / Solo | Channel mute, solo |
| Input option | 48V, Inst, Pad, AutoSet on/off |
| Output loopback | Output loopback on/off |
| Group | Group setup, toggle |

**Value keys** (repeat while held)

| Action | What it does |
| --- | --- |
| Fader(2-Button) | Raise/lower a fader with two keys, with a level meter on the keys |
| Fader | Set a fader to a value or raise/lower it by a value |
| Pan | Set or adjust pan |
| Input gain | Raise/lower input gain |
| Global FX (Reverb / Echo) | Global reverb, echo on/off |
| FX parameter | Set or adjust an FX parameter |

**Dials (Stream Deck +)**

| Action | Turn | Press |
| --- | --- | --- |
| VU Dial | Adjust fader, shows level meter | Mute (can be changed) |
| Pan Dial | Adjust pan | Center |
| Gain Dial | Adjust gain | Chosen function: mute, 48V, Pad and more |
| FX Parameter Dial | Adjust FX parameter | Reset value |

In the VU Dial's **▸ Press actions** you can choose other actions (mute on/off, recall a set volume and more) for pressing and for turning left or right while pressed.

**Global keys**

| Action | What it does |
| --- | --- |
| Snapshot | Recall a snapshot by number |
| Control Room | Control room functions |
| Layout preset / TotalMix window | Screen layouts, window switching |

See the PDF manual for every option of each action.

## Key hints

| Hint | Meaning | What to do |
| --- | --- | --- |
| **OFFLINE** | TotalMix does not reply | Check TotalMix is running, Enable OSC Control, ports, firewall |
| **N/A** | The device lacks this function | E.g. an input without 48V. Choose another channel |
| **SET CHANNEL** | No channel chosen yet | Choose a channel in the settings screen |
| **SETUP** | Another required setting is empty | Fill it in on the settings screen |

## Troubleshooting

- **It stays OFFLINE:** Check that the TotalMix OSC ports match the plugin's TotalMix port / Feedback port. If another program uses the same ports, change them as in "Connection settings" above.
- **The level meters do not move:** Check that Send Peak Level Data is on in TotalMix.
- **A key keeps repeating although I let go:** Press it once more to stop. Inside a Multi Action, keys run once without repeating.

## Building it yourself

```bash
npm install
npm run pack
```

`npm run pack` produces the `.streamDeckPlugin` file.

## Notices

Licenses of the open-source software this plugin uses are in `THIRD-PARTY-NOTICES.txt`. RME and TotalMix are trademarks of RME Audio. This plugin is an unofficial project not affiliated with RME.
