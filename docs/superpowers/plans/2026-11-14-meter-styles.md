# 레벨미터 디자인 선택 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정 화면에서 레벨미터 디자인을 플러그인 기본 · 토탈믹스 옛 디자인 · 토탈믹스 새 디자인 중 하나로 고르면, 다이얼 화면·키 미터·버튼 페이더가 모두 그 디자인으로 그려진다.

**Architecture:** `src/render/meter.ts`에 모듈 상태값 하나(미터 디자인)를 두고, 막대·색·눈금·페이더 선 위치만 디자인별로 다르게 그린다. `src/plugin.ts`는 전체 설정을 받을 때마다 이 값을 바꾼다. 키는 원래 2초마다 다시 그려지므로 따로 다시 그리기를 부르지 않는다. 설정 화면은 `ui/common.js`의 공통 블록에 접힌 칸을 하나 추가한다.

**Tech Stack:** TypeScript, @elgato/streamdeck 3.0.4, sdpi-components, node --test.

**Spec:** `docs/superpowers/specs/2026-11-14-meter-styles-design.md`

**작업 폴더:** `C:\Users\Kimtan_StreamPC\streamdeck-rme-totalmix`. `main`에서 `feat/meter-styles` 브랜치를 만든다. 첫 커밋에 스펙과 이 계획을 함께 넣는다.

## Global Constraints

- 전체 설정 키 `meterStyle`, 값 `plugin`(기본) · `classic`(토탈믹스 옛) · `modern`(토탈믹스 새). 그 밖의 값과 빈 값은 `plugin`.
- `plugin` 디자인은 지금과 한 픽셀도 다르지 않게 그린다(기존 테스트가 그대로 통과해야 한다).
- 토탈믹스 눈금(0 dB 높이 = 1): -65 → 0, -30 → 0.39, -20 → 0.51, -15 → 0.59, -12 → 0.65, -9 → 0.71, -6 → 0.79, -3 → 0.90, 0 → 1, +6 → 1.111. 각 값에 0.9를 곱해 막대 비율로 쓴다(0 dB = 0.9, +6 dB = 1.0). 점 사이는 직선으로 잇는다. -65 이하는 0, +6 이상은 1.
- 미터와 페이더 값은 지금처럼 `dbToBar` 비율(-65~+6 dB 직선)로 들어온다. 토탈믹스 디자인은 `db = v * 71 - 65`로 되돌린 뒤 위 눈금으로 바꾼다. 막대와 파란 페이더 선 모두 바꾼다.
- 옛 디자인: 바탕 `rgb(31,41,48)`. 색은 dB 위치에 따른 부드러운 그라데이션: -65 `(133,255,3)`, -30 `(163,255,3)`, -20 `(185,255,1)`, -12 `(222,255,1)`, -8 `(249,250,0)`, -6 `(253,225,0)`, -4 `(253,183,0)`, -3 `(253,133,1)`, -1 `(253,80,1)`, 0 `(253,57,1)`, +6 `(253,40,1)`.
- 새 디자인: 바탕 `rgb(50,58,64)`. -3 dB 아래 `rgb(25,209,32)`, -3 ~ -0.3 dB `rgb(255,189,32)`, 그 위 `rgb(255,71,27)`. 막대 끝 2픽셀은 초록 구간 `rgb(12,255,16)`, 노랑 구간 `rgb(255,254,16)`, 빨강 구간 `rgb(255,71,27)`.
- 눈금(두 토탈믹스 디자인만): 0, -6, -10, -20, -40, -60 dB 자리에 막대를 가로지르는 선 `rgba(210,220,230,0.6)`. 숫자는 `0 6 10 20 40 60`(부호 없음), 색 `rgb(160,170,180)`.
  - 다이얼 화면(200×100): 막대 아래, 숫자 크기 11, 기준선 y=71.
  - 세로 버튼 페이더(top/bottom): 막대 왼쪽 x = 13 단위(×1.44), 숫자 크기 15. `6`은 선만.
  - 키 미터와 가로 버튼 페이더(left/right): 선만.
- 글자 배치, 음소거 빗금과 투명도, 파란 페이더 선 모양은 세 디자인 모두 같다.
- 설정 화면 문구: 접힌 칸 제목과 항목 이름 `Meter design`, 선택지 `Plugin (default)` · `TotalMix classic` · `TotalMix new`. 번역 `미터 디자인` / `メーターデザイン`, `플러그인 기본` / `プラグイン標準`, `토탈믹스 옛 디자인` / `TotalMix 旧デザイン`, `토탈믹스 새 디자인` / `TotalMix 新デザイン`.
- 미터 디자인을 바꿔도 TotalMix 연결을 다시 시작하지 않는다.

## Review Focus

1. 미터 디자인 값이 없거나 이상한 값(`"abc"`, 숫자)일 때 → 플러그인 기본으로 그려져야 한다. (Task 1 테스트)
2. 버튼 페이더 2키에서 두 키의 경계(비율 0.5)는 토탈믹스 눈금에서도 막대가 끊김 없이 이어져야 한다: 아래 키가 꽉 찬 뒤에 위 키가 차기 시작. (Task 1 테스트)
3. 페이더가 +6 dB(비율 1)일 때 파란 선이 막대 끝에 그려지고, -∞(비율 0)일 때 시작에 그려져야 한다. (Task 1 테스트)
4. 음소거일 때 토탈믹스 디자인도 지금처럼 투명도 0.4와 빗금이 나와야 한다. (Task 1 테스트)
5. 여러 키의 그림이 한 화면에 섞여도 그라데이션 id가 겹쳐 색이 바뀌지 않아야 한다 — 스트림덱은 키마다 따로 그리므로 문제없지만, 옛 디자인도 지금처럼 `<defs>` 안 그라데이션을 쓴다. (설계상 확인만)

---

### Task 1: 미터 그리기에 세 디자인 넣기

**Files:**
- Modify: `src/render/meter.ts`
- Test: `test/render-meter.test.mjs` (기존 파일 끝에 추가)

**Interfaces — Produces:**
- `export type MeterStyle = 'plugin' | 'classic' | 'modern'`
- `export function setMeterStyle(value: unknown): void` — 모르는 값은 `'plugin'`.
- `renderVuStrip`, `renderKeyMeter`, `renderButtonFader`의 이름과 인자는 그대로.

- [ ] **Step 1: 실패하는 테스트 작성** — 파일 끝에 추가. 각 테스트는 끝에서 `setMeterStyle('plugin')`으로 되돌린다.

```js
import { setMeterStyle, renderKeyMeter } from '../dist/render/meter.js' // 기존 import 줄에 합친다
const bar0 = (db) => Math.max(0, Math.min(1, (db + 65) / 71))

test('unknown meter style falls back to the plugin design', () => {
	const plain = renderVuStrip(view())
	for (const v of ['abc', 3, undefined, null]) {
		setMeterStyle(v)
		assert.equal(renderVuStrip(view()), plain)
	}
})

test('classic style draws the TotalMix track, its colours and the TotalMix scale', () => {
	setMeterStyle('classic')
	const svg = save('classic-strip', renderVuStrip(view({ left: bar0(-12), right: bar0(-3), fader: bar0(0) })))
	assert.ok(svg.includes('fill="rgb(31,41,48)"'))
	assert.ok(svg.includes('stop-color="rgb(133,255,3)"') && svg.includes('stop-color="rgb(253,57,1)"'))
	// -12 dB sits at 0.65 * 0.9 of the 176 px bar starting at x=12
	assert.equal(fills(svg)[0][2], 102.96)
	assert.ok(/<line x1="170.4"[^>]*stroke="rgb\(40,140,255\)"/.test(svg)) // 0 dB fader at 0.9 → x = 12 + 158.4
	for (const label of ['>60<', '>40<', '>20<', '>10<', '>6<', '>0<']) assert.ok(svg.includes(label), label)
	setMeterStyle('plugin')
})

test('modern style splits green, yellow and red zones with a bright tip', () => {
	setMeterStyle('modern')
	const quiet = renderVuStrip(view({ left: bar0(-12), right: 0 }))
	assert.ok(quiet.includes('fill="rgb(50,58,64)"') && quiet.includes('fill="rgb(25,209,32)"') && quiet.includes('fill="rgb(12,255,16)"'))
	assert.ok(!quiet.includes('rgb(255,189,32)'))
	const loud = save('modern-strip', renderVuStrip(view({ left: bar0(-0.1), right: 0 })))
	assert.ok(loud.includes('fill="rgb(255,189,32)"') && loud.includes('fill="rgb(255,71,27)"'))
	setMeterStyle('plugin')
})

test('TotalMix scale keeps the two-key fader continuous at the seam', () => {
	setMeterStyle('modern')
	const v = view({ left: bar0(-12), right: bar0(-30) })
	// -12 dB → 0.585: bottom key full, top key holds the rest
	const bottomGreen = (renderButtonFader(v, 'bottom').match(/fill="rgb\(25,209,32\)"/g) ?? []).length
	assert.ok(bottomGreen >= 2)
	assert.ok(renderButtonFader(v, 'top').includes('fill="rgb(25,209,32)"')) // left bar continues
	setMeterStyle('plugin')
})

test('fader line reaches both ends of the TotalMix scale', () => {
	setMeterStyle('classic')
	assert.ok(/<line x1="188"[^>]*rgb\(40,140,255\)/.test(renderVuStrip(view({ fader: 1 }))))
	assert.ok(/<line x1="12"[^>]*rgb\(40,140,255\)/.test(renderVuStrip(view({ fader: 0 }))))
	setMeterStyle('plugin')
})

test('muted TotalMix meters keep the dimmed bars and the hatch', () => {
	for (const style of ['classic', 'modern']) {
		setMeterStyle(style)
		const svg = renderVuStrip(view({ muted: true }))
		assert.ok(svg.includes('opacity="0.4"') && svg.includes('MUTED'), style)
	}
	setMeterStyle('plugin')
})

test('key meter and horizontal fader show scale lines without numbers', () => {
	setMeterStyle('classic')
	const key = renderKeyMeter({ fader: bar0(0), left: bar0(-12), right: bar0(-12), muted: false })
	assert.ok(key.includes('stroke="rgba(210,220,230,0.6)"') && !key.includes('>60<'))
	const left = renderButtonFader(view(), 'left')
	assert.ok(left.includes('stroke="rgba(210,220,230,0.6)"') && !left.includes('>60<'))
	const bottom = renderButtonFader(view(), 'bottom')
	assert.ok(bottom.includes('>60<') && !bottom.includes('>6<'))
	setMeterStyle('plugin')
})
```

숫자 근거: 다이얼 화면 막대는 x 6~94 단위 × 2 = 12~188 px(176 px). -12 dB → 0.65 × 0.9 = 0.585 → 0.585 × 176 = 102.96. 0 dB → 0.9 × 176 = 158.4 → x = 170.4.

- [ ] **Step 2: 실패 확인**

Run: `npx tsc -p . && node --test test/render-meter.test.mjs`
Expected: 새 테스트들이 `setMeterStyle is not a function` 또는 assert 오류로 FAIL, 기존 테스트는 PASS.

- [ ] **Step 3: `src/render/meter.ts` 구현**
  - `MeterStyle`, 모듈 변수 `let style: MeterStyle = 'plugin'`, `setMeterStyle(value)`.
  - 토탈믹스 눈금 함수 `tmBar(db)`와 `toScale(v)`(`plugin`이면 그대로, 아니면 `tmBar(v * 71 - 65)`). `bar()`와 `marker()`가 받은 값에 적용한다.
  - `gradient()`는 디자인에 맞는 색 점을 쓴다(`plugin`: 지금 `STOPS`, `classic`: Global Constraints의 색을 `tmBar(db)` 위치에, `modern`: 그라데이션 안 씀).
  - `bar()`: `plugin`은 지금 코드 그대로. `classic`은 바탕 사각형 + `url(#g)` 채움. `modern`은 바탕 + 세 구간 사각형 + 끝 2픽셀.
  - `scale(b, s, px, labels?)`: 눈금 선과 숫자. `plugin`이면 빈 문자열. 세 그리기 함수에서 `marker()` 바로 앞에 부른다(위치와 크기는 Global Constraints).
  - 스파이크 코드(`scratchpad/mock3/patch.py`가 만든 `meter.js`)가 참고용으로 있다. 그대로 옮기지 말고 TypeScript 형식과 기존 함수 나눔에 맞춰 쓴다.

- [ ] **Step 4: 통과 확인**

Run: `npx tsc -p . && node --test test/render-meter.test.mjs`
Expected: 전체 PASS.

- [ ] **Step 5: 전체 테스트**

Run: `npx tsc -p . && timeout 200 node --test --test-force-exit test/*.test.mjs`
Expected: 기존 테스트 + 새 7개 모두 PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/render/meter.ts test/render-meter.test.mjs
git commit -m "feat: draw level meters in TotalMix classic and new designs"
```

### Task 2: 전체 설정 연결과 설정 화면

**Files:**
- Modify: `src/plugin.ts` (`apply` 함수)
- Modify: `com.haeunga0822.rme-totalmix.sdPlugin/ui/common.js` (`GLOBAL_BLOCK`, `TEXT`)

**Interfaces — Consumes:** Task 1의 `setMeterStyle(value: unknown)`.

- [ ] **Step 1: `src/plugin.ts`** — `apply(raw)`의 첫 줄에서 `setMeterStyle((raw as { meterStyle?: unknown }).meterStyle)`를 부른다. 연결 설정 비교·`connection.start` 흐름은 그대로 둔다(미터 디자인만 바뀌면 연결은 다시 시작하지 않는다).

- [ ] **Step 2: `ui/common.js`** — `GLOBAL_BLOCK`의 Language 칸 앞에 접힌 칸 추가:

```html
<details class="connection"><summary>Meter design</summary>
<sdpi-item label="Meter design"><sdpi-select setting="meterStyle" global default="plugin">
<option value="plugin">Plugin (default)</option><option value="classic">TotalMix classic</option><option value="modern">TotalMix new</option>
</sdpi-select></sdpi-item>
</details>
```

`TEXT` 표에 Global Constraints의 네 문구(한국어, 일본어)를 추가한다.

- [ ] **Step 3: 빌드와 전체 테스트**

Run: `npx tsc -p . && timeout 200 node --test --test-force-exit test/*.test.mjs`
Expected: 전체 PASS.

- [ ] **Step 4: 커밋**

```bash
git add src/plugin.ts com.haeunga0822.rme-totalmix.sdPlugin/ui/common.js
git commit -m "feat: choose the level meter design in the settings screen"
```

### Task 3: 실제 스트림덱에서 확인

- [ ] **Step 1: 번들과 배포** — `npm run bundle` 후 `bin/plugin.js`, `bin/plugin.js.map`을 `%APPDATA%\Elgato\StreamDeck\Plugins\com.haeunga0822.rme-totalmix.sdPlugin\bin\`에, `ui/common.js`를 같은 폴더의 `ui\`에 복사한다. 플러그인 node 프로세스만 종료해서 다시 뜨게 하고, 새 프로세스의 시작 시각을 확인한다(앱 재시작을 사용자에게 부탁하지 않는다).
- [ ] **Step 2: 사용자 확인 요청** — 설정 화면에서 세 디자인을 차례로 고르고, 다이얼·키 미터·버튼 페이더가 2초 안에 바뀌는지, 숫자가 읽히는지 사용자에게 확인받는다. 확인 요청에는 위 배포 폴더 전체 경로를 적는다.
- [ ] **Step 3: 확인 결과에 따라 고칠 것이 있으면 Task 1/2로 돌아가 테스트부터 고친다.** 확인이 끝나면 커밋은 이미 되어 있으므로 푸시·릴리스는 사용자에게 따로 묻는다.
