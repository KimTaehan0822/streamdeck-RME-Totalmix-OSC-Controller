# 두 값 번갈아 모드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fader·Pan·FX 파라미터 키에 '두 값 번갈아' 모드를 넣는다. 누를 때마다 지금 값이 값 2와 같으면 값 1로, 아니면 값 2로 보내고, 키 상태(아이콘)를 값 2일 때 2번째로 바꾼다.

**Architecture:** 공통 규칙(같은 값인지, 다음에 보낼 값, 키 상태)은 `src/actions/common.ts`의 작은 함수 하나에 둔다. Fader·Pan 키는 부모 `ValueKeyAction`에서, FX 파라미터 키는 자기 `onKeyDown`에서 이 함수를 쓴다. 설정 화면은 모드 목록과 값 2 칸만 늘린다.

**Tech Stack:** TypeScript, @elgato/streamdeck 3.0.4, sdpi-components, node --test.

**Spec:** `docs/superpowers/specs/2026-11-14-alternate-values-design.md`

**작업 폴더:** `C:\Users\Kimtan_StreamPC\streamdeck-rme-totalmix`. `main`에서 `feat/alternate-values` 브랜치를 만든다. 첫 커밋에 스펙과 이 계획을 넣는다.

## Global Constraints

- 모드 값 `alternate`. 기존 `set`, `step`은 동작과 기본값이 그대로다.
- 값 1 = 설정 `value`(기존 칸), 값 2 = 새 설정 `value2`. `alternate`일 때 둘 중 하나라도 숫자가 아니면 설정 미완성(기존 값 키처럼 SET CHANNEL)으로 그리고 아무것도 보내지 않는다.
- 다음 값: `current`가 값 2와 "같으면" 값 1, 아니면(모르는 값 포함) 값 2.
- "같음" 기준(차이 ≤ 허용치): Fader dB 단위 0.2, Fader 선형 단위 0.005, Pan 1, FX `max(|값 2| × 0.01, 0.01)`.
- 비교에 쓰는 지금 값: Fader dB = `normalizedToDb(상태 value)`, Fader 선형 = 상태 value, Pan = `상태 value × 200 − 100`, FX = `globalParameter<number>`.
- 키 상태: `alternate`이고 지금 값이 값 2와 같으면 1, 그 밖(다른 모드 포함)은 0.
- manifest: `fader`, `pan`, `fx-param` 액션에 `"States": [{ "Image": "imgs/fader" }, { "Image": "imgs/fader" }]`, `"DisableAutomaticStates": true`.
- 설정 화면 문구: 모드 `Alternate two values`, 칸 이름 `Value 1`(alternate일 때 기존 Value 칸), `Value 2`. 번역 `두 값 번갈아` / `2つの値を交互に`, `값 1` / `値 1`, `값 2` / `値 2`.
- `alternate`는 누르고 있어도 반복하지 않는다(`set`처럼 한 번).

## Review Focus

1. 지금 값을 아직 모를 때(TotalMix 연결 직후) 누르면 값 2로 가야 한다. (Task 1 테스트)
2. TotalMix가 -30 대신 -29.9 dB를 돌려줘도 다음 누름은 값 1로 가야 한다(허용치 안). (Task 1 테스트)
3. 값 1과 값 2가 같으면 누를 때마다 같은 값이 가고 오류가 없어야 한다. (Task 1 테스트)
4. 다른 모드(set/step)의 키는 상태가 늘 0이고 동작이 바뀌지 않아야 한다. (기존 테스트 + Task 1 테스트)
5. 멀티 액션 안에서도 한 번만 보내야 한다(hold 반복 없음). (설계상 `set`과 같은 경로라 확인만)

---

### Task 1: 번갈아 규칙과 세 키의 동작

**Files:**
- Modify: `src/actions/common.ts` (공통 함수), `src/actions/faders.ts` (`ValueKeyAction`, `FaderAction`, `PanAction`), `src/actions/gain-fx.ts` (`FxParamAction`)
- Test: `test/actions-faders.test.mjs`, `test/actions-gain-fx.test.mjs` (끝에 추가)

**Interfaces — Produces** (`src/actions/common.ts`):
- `export function alternateNext(current: number | undefined, value1: number, value2: number, tolerance: number): { target: number; atValue2: boolean }` — `atValue2`는 지금 값이 값 2와 같은지(키 상태에 씀), `target`은 다음에 보낼 값.

**Interfaces — 키 쪽:**
- `ValueKeyAction`에 `protected abstract current(t: MixTarget, s: JsonObject): number | undefined`와 `protected abstract tolerance(s: JsonObject): number`. `valid()`는 `alternate`일 때 `value2`도 숫자인지 본다. `keyState(s)` 재정의.
- `FxParamAction`은 같은 규칙을 자기 `valid`/`onKeyDown`/`keyState`에 넣는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/actions-faders.test.mjs` 끝:

```js
test('fader alternate goes to value 2, then back to value 1 once TotalMix reports value 2', async () => {
	const { conn, sent, msg } = setup()
	const key = new FaderAction(conn)
	const k = fake('k', false, { row: 'input', channel: 1, destination: 2, mode: 'alternate', unit: 'db', value: '-10', value2: '-30' })
	await key.onWillAppear(k.appear)
	key.onKeyDown(k.ev()) // current unknown -> value 2
	await wait()
	assert.deepEqual(sent.at(-1), { address: '/mix/in/1/2/faderlin', args: [dbToNormalized(-30)] })
	msg('/mix/in/1/2/faderlin', dbToNormalized(-29.9)) // within 0.2 dB of value 2
	key.onKeyDown(k.ev())
	await wait()
	assert.deepEqual(sent.at(-1), { address: '/mix/in/1/2/faderlin', args: [dbToNormalized(-10)] })
	msg('/mix/in/1/2/faderlin', dbToNormalized(-10))
	key.onKeyDown(k.ev())
	await wait()
	assert.deepEqual(sent.at(-1), { address: '/mix/in/1/2/faderlin', args: [dbToNormalized(-30)] })
	await key.onWillDisappear(k.appear)
	conn.stop()
})

test('fader alternate without value 2 is incomplete and sends nothing', async () => {
	const { conn, sent } = setup()
	const key = new FaderAction(conn)
	const k = fake('k', false, { row: 'input', channel: 1, destination: 2, mode: 'alternate', unit: 'db', value: '-10' })
	await key.onWillAppear(k.appear)
	key.onKeyDown(k.ev())
	await wait()
	assert.equal(sent.filter((m) => m.address === '/mix/in/1/2/faderlin').length, 0)
	assert.match(k.images.at(-1), /SETUP/)
	await key.onWillDisappear(k.appear)
	conn.stop()
})

test('pan alternate compares on the -100..100 scale and sets the key state at value 2', async () => {
	const { conn, sent, msg } = setup()
	const states = []
	const key = new PanAction(conn)
	const k = fake('k', false, { row: 'output', channel: 3, mode: 'alternate', value: '0', value2: '50' })
	k.action.setState = async (s) => void states.push(s)
	msg('/output/3/balpan', 0.5) // pan 50 = value 2
	await key.onWillAppear(k.appear)
	await wait()
	assert.equal(states.at(-1), 1)
	key.onKeyDown(k.ev())
	await wait()
	assert.deepEqual(sent.at(-1), { address: '/output/3/balpan', args: [0] })
	await key.onWillDisappear(k.appear)
	conn.stop()
})
```

`PanAction`을 import 줄에 추가한다. 상태 0 확인(다른 모드): 같은 파일에

```js
test('set mode keys keep state 0', async () => {
	const { conn, msg } = setup()
	const states = []
	const key = new FaderAction(conn)
	const k = fake('k', false, { row: 'input', channel: 1, destination: 2, mode: 'set', unit: 'db', value: '-10' })
	k.action.setState = async (s) => void states.push(s)
	msg('/mix/in/1/2/faderlin', dbToNormalized(-10))
	await key.onWillAppear(k.appear)
	await wait()
	assert.ok(states.every((s) => s === 0))
	await key.onWillDisappear(k.appear)
	conn.stop()
})
```

`test/actions-gain-fx.test.mjs` 끝:

```js
test('fx-param alternate switches between the two values', async () => {
	const { conn, sent, msg } = setup()
	msg('/reverb/time', 1.5)
	await pressKey(FxParamAction, conn, { parameter: 'reverbTime', mode: 'alternate', value: '1.5', value2: '3' })
	assert.deepEqual(sent.at(-1), { address: '/reverb/time', args: [3] })
	msg('/reverb/time', 3)
	await pressKey(FxParamAction, conn, { parameter: 'reverbTime', mode: 'alternate', value: '1.5', value2: '3' })
	assert.deepEqual(sent.at(-1), { address: '/reverb/time', args: [1.5] })
	conn.stop()
})

test('alternate with equal values sends that value every time', async () => {
	const { conn, sent, msg } = setup()
	msg('/reverb/time', 2)
	await pressKey(FxParamAction, conn, { parameter: 'reverbTime', mode: 'alternate', value: '2', value2: '2' })
	assert.deepEqual(sent.at(-1), { address: '/reverb/time', args: [2] })
	conn.stop()
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx tsc -p . && node --test test/actions-faders.test.mjs test/actions-gain-fx.test.mjs`
Expected: 새 테스트들이 FAIL(`alternate`를 모르는 모드로 보고 SETUP·전송 없음), 기존 테스트 PASS.

- [ ] **Step 3: 구현**
  - `common.ts`: `alternateNext`.
  - `faders.ts`: `MODES`에 `alternate: 1`. `ValueKeyAction.valid`에 `value2` 확인. `onKeyDown`: `alternate`이면 `alternateNext(this.current(t, s), value, value2, this.tolerance(s)).target`을 `send(..., set=true, ...)`로 한 번 보낸다. `keyState`: `alternate`이고 `atValue2`이면 1, 아니면 0(설정이 미완성이면 0).
  - `FaderAction.current`: 단위 dB면 `normalizedToDb(state.value)`, 선형이면 `state.value`(행이 output이면 `getOutput`, 아니면 `getRoute`; 둘 다 이미 `faderBar`가 하는 등록 방식을 따른다). `tolerance`: dB 0.2, 선형 0.005.
  - `PanAction.current`: `panValue × 200 − 100`. `tolerance` 1.
  - `gain-fx.ts`: `MODES`에 `alternate: 1`, `valid`에 `value2`, `onKeyDown`에 `alternate` 가지(한 번, `clampFx`), `keyState`. 허용치 `Math.max(Math.abs(value2) * 0.01, 0.01)`.

- [ ] **Step 4: 통과 확인**

Run: `npx tsc -p . && node --test test/actions-faders.test.mjs test/actions-gain-fx.test.mjs`
Expected: 전체 PASS.

- [ ] **Step 5: 전체 테스트**

Run: `npx tsc -p . && timeout 200 node --test --test-force-exit test/*.test.mjs`
Expected: 기존 191개 + 새 6개 모두 PASS.

- [ ] **Step 6: 커밋** — `git add src/actions test && git commit -m "feat: alternate between two values on fader, pan and FX parameter keys"`

### Task 2: manifest와 설정 화면

**Files:**
- Modify: `com.haeunga0822.rme-totalmix.sdPlugin/manifest.json` (`fader`, `pan`, `fx-param` 액션의 `States`, `DisableAutomaticStates`)
- Modify: `com.haeunga0822.rme-totalmix.sdPlugin/ui/fader.html`, `ui/fx.html` (`MODES`에 `alternate: 'Alternate two values'`, 값 2 칸)
- Modify: `com.haeunga0822.rme-totalmix.sdPlugin/ui/common.js` (`TEXT` 번역 3개)

- [ ] **Step 1: manifest** — Global Constraints 값 그대로. 다른 액션은 건드리지 않는다. `node -e "JSON.parse(require('fs').readFileSync('com.haeunga0822.rme-totalmix.sdPlugin/manifest.json','utf8'))"`로 JSON 확인.
- [ ] **Step 2: 설정 화면** — 모드가 `alternate`일 때만 Value 칸 이름을 `Value 1`로 바꾸고 그 아래 `<sdpi-textfield setting="value2">`(`Value 2`) 칸을 보인다. 모드 선택이 바뀌면 다시 그린다(`fader.html`의 `row` 처리처럼 `valuechange`로 `draw()`).
- [ ] **Step 3: 확인** — `npx tsc -p . && timeout 200 node --test --test-force-exit test/*.test.mjs` 전체 PASS, `common.js`·html 스크립트 문법 확인.
- [ ] **Step 4: 커밋** — `git commit -m "feat: alternate mode and value 2 in the settings screen"`

### Task 3: 실제 스트림덱 확인

- [ ] **Step 1: 배포** — `npm run bundle` 후 `bin/plugin.js`, `bin/plugin.js.map`, `manifest.json`, `ui/fader.html`, `ui/fx.html`, `ui/common.js`를 `%APPDATA%\Elgato\StreamDeck\Plugins\com.haeunga0822.rme-totalmix.sdPlugin\` 같은 자리에 복사하고 플러그인 node 프로세스만 다시 시작, 시작 시각 확인.
- [ ] **Step 2: 사용자 확인 요청** — manifest의 상태 두 개는 Stream Deck 앱이 다시 읽어야 보이는 점을 알린다(앱 재시작을 부탁하지 말고, 동작 확인은 지금 할 수 있고 아이콘 두 개는 앱이 다음에 켜질 때부터라고 설명). Fader·Pan·FX 키를 '두 값 번갈아'로 바꿔 누를 때마다 오가는지 확인받는다. 배포 폴더 전체 경로를 적는다.
