// Shared Property Inspector code. Every PI loads sdpi-components.js, then this file, and contains
// <div data-global></div> where the connection settings should appear.
// Channel dropdowns: <sdpi-select setting="channel" datasource="getChannels:input"> (input | playback | output);
// add hot-reload so the list refreshes when TotalMix connects; select values arrive in settings as strings.
// The plugin answers the datasource request with the discovered channels (see src/plugin.ts).
// Folded by default: the connection is set once and only opened to check or change it.
const GLOBAL_BLOCK = `
<style>
	details.connection > summary { cursor: pointer; color: #969696; font-size: 9pt; padding: 4px 0 10px; user-select: none; }
	details.connection > summary:hover, details.connection > summary:focus-visible { color: #d8d8d8; }
	details.connection > summary:focus-visible { outline: 1px solid #708090; }
</style>
<details class="connection"><summary>TotalMix connection (OSC)</summary>
<sdpi-item label="Host"><sdpi-textfield setting="host" global default="127.0.0.1"></sdpi-textfield></sdpi-item>
<sdpi-item label="TotalMix port"><sdpi-textfield setting="targetPort" global default="7001" pattern="^[0-9]{1,5}$"></sdpi-textfield></sdpi-item>
<sdpi-item label="Feedback port"><sdpi-textfield setting="feedbackPort" global default="9001" pattern="^[0-9]{1,5}$"></sdpi-textfield></sdpi-item>
<sdpi-item label="Sync timeout (ms)"><sdpi-textfield setting="syncTimeoutMs" global default="500" pattern="^[0-9]{3,4}$"></sdpi-textfield></sdpi-item>
</details>
<details class="connection"><summary>Language</summary>
<sdpi-item label="Language"><sdpi-select setting="language" global default="en">
<option value="en">English</option><option value="ko">한국어</option><option value="ja">日本語</option>
</sdpi-select></sdpi-item>
</details>`

for (const slot of document.querySelectorAll('[data-global]')) {
	slot.innerHTML = GLOBAL_BLOCK
	for (const s of slot.querySelectorAll('sdpi-select')) s.append(...s.querySelectorAll('option'))
}

// Settings screen language. Pages keep writing English; every label, placeholder, option, summary and span
// is swapped through this table as it lands on the page. Text missing here stays English. [Korean, Japanese]
const TEXT = {
	'TotalMix connection (OSC)': ['TotalMix 연결 (OSC)', 'TotalMix 接続 (OSC)'],
	Host: ['호스트', 'ホスト'],
	'TotalMix port': ['TotalMix 포트', 'TotalMix ポート'],
	'Feedback port': ['피드백 포트', 'フィードバックポート'],
	'Sync timeout (ms)': ['동기화 대기 시간 (ms)', '同期タイムアウト (ms)'],
	Language: ['언어', '言語'],
	Select: ['선택', '選択'],
	'Select channel': ['채널 선택', 'チャンネルを選択'],
	Row: ['줄', '列'],
	Input: ['입력', '入力'],
	Playback: ['재생', '再生'],
	Output: ['출력', '出力'],
	Channel: ['채널', 'チャンネル'],
	Source: ['소스', 'ソース'],
	Destination: ['대상 출력', '出力先'],
	'Display name': ['표시 이름', '表示名'],
	'Empty: name from TotalMix': ['비우면 TotalMix 이름', '空欄: TotalMix の名前'],
	Operation: ['동작', '動作'],
	Toggle: ['토글', 'トグル'],
	On: ['켜기', 'オン'],
	Off: ['끄기', 'オフ'],
	Option: ['옵션', 'オプション'],
	Instrument: ['악기 (Inst)', '楽器 (Inst)'],
	'Group type': ['그룹 종류', 'グループの種類'],
	Group: ['그룹', 'グループ'],
	'Mute group': ['뮤트 그룹', 'ミュートグループ'],
	'PFL group': ['PFL 그룹', 'PFL グループ'],
	'Fader group': ['페이더 그룹', 'フェーダーグループ'],
	'Group 1': ['그룹 1', 'グループ 1'],
	'Group 2': ['그룹 2', 'グループ 2'],
	'Group 3': ['그룹 3', 'グループ 3'],
	'Group 4': ['그룹 4', 'グループ 4'],
	'Key role': ['키 역할', 'キーの役割'],
	'Top key (up)': ['위 키 (올리기)', '上のキー (上げる)'],
	'Bottom key (down)': ['아래 키 (내리기)', '下のキー (下げる)'],
	'Left key (down)': ['왼쪽 키 (내리기)', '左のキー (下げる)'],
	'Right key (up)': ['오른쪽 키 (올리기)', '右のキー (上げる)'],
	'Step per press (dB)': ['한 번 누를 때 (dB)', '1回押すごと (dB)'],
	'1 (e.g. 0.5, 2)': ['1 (예: 0.5, 2)', '1 (例: 0.5, 2)'],
	Mode: ['모드', 'モード'],
	'Set to value': ['값으로 설정', '値に設定'],
	'Step by value (hold repeats)': ['값만큼 조절 (누르면 반복)', '値ずつ調整 (長押しで連続)'],
	Unit: ['단위', '単位'],
	'Linear (0-1)': ['선형 (0-1)', 'リニア (0-1)'],
	Value: ['값', '値'],
	'dB or 0-1 (a step may be negative)': ['dB 또는 0-1 (조절 값은 음수 가능)', 'dB または 0-1 (調整値は負の数も可)'],
	'Pan -100 (left) to 100 (right); a step may be negative': ['팬 -100 (왼쪽) ~ 100 (오른쪽), 조절 값은 음수 가능', 'パン -100 (左) ~ 100 (右)、調整値は負の数も可'],
	Effect: ['이펙트', 'エフェクト'],
	Reverb: ['리버브', 'リバーブ'],
	Echo: ['에코', 'エコー'],
	Parameter: ['파라미터', 'パラメーター'],
	'Reverb type': ['리버브 종류', 'リバーブの種類'],
	'Reverb pre-delay': ['리버브 프리딜레이', 'リバーブ プリディレイ'],
	'Reverb low cut': ['리버브 로우 컷', 'リバーブ ローカット'],
	'Reverb high cut': ['리버브 하이 컷', 'リバーブ ハイカット'],
	'Reverb room scale': ['리버브 룸 크기', 'リバーブ ルームスケール'],
	'Reverb attack': ['리버브 어택', 'リバーブ アタック'],
	'Reverb hold': ['리버브 홀드', 'リバーブ ホールド'],
	'Reverb release': ['리버브 릴리즈', 'リバーブ リリース'],
	'Reverb time': ['리버브 시간', 'リバーブ タイム'],
	'Reverb high damp': ['리버브 하이 댐프', 'リバーブ ハイダンプ'],
	'Reverb smoothness': ['리버브 부드러움', 'リバーブ スムース'],
	'Reverb width': ['리버브 폭', 'リバーブ 幅'],
	'Reverb volume': ['리버브 볼륨', 'リバーブ 音量'],
	'Echo type': ['에코 종류', 'エコーの種類'],
	'Echo delay time': ['에코 딜레이 시간', 'エコー ディレイタイム'],
	'Echo feedback': ['에코 피드백', 'エコー フィードバック'],
	'Echo high cut': ['에코 하이 컷', 'エコー ハイカット'],
	'Echo width': ['에코 폭', 'エコー 幅'],
	'Echo volume': ['에코 볼륨', 'エコー 音量'],
	'TotalMix native unit (-10000 to 10000)': ['TotalMix 내부 단위 (-10000 ~ 10000)', 'TotalMix 内部単位 (-10000 ~ 10000)'],
	'Step per tick': ['한 칸당', '1クリックごと'],
	'Reset value (press)': ['초기값 (누르기)', 'リセット値 (押す)'],
	'Press the dial to set the reset value; with no reset value nothing happens.': [
		'다이얼을 누르면 초기값으로 돌아갑니다. 초기값이 비어 있으면 아무 일도 없습니다.',
		'ダイヤルを押すとリセット値に戻ります。リセット値が空欄なら何もしません。',
	],
	'Step (dB)': ['조절 단위 (dB)', '調整幅 (dB)'],
	'1 (hold repeats; keys may be negative)': ['1 (누르면 반복, 키는 음수 가능)', '1 (長押しで連続、キーは負の数も可)'],
	'Dial press': ['다이얼 누르기', 'ダイヤルを押す'],
	Mute: ['뮤트', 'ミュート'],
	Nothing: ['아무것도 안 함', '何もしない'],
	'Recall (press loads it)': ['불러오기 (누르면 적용)', '呼び出し (押すと読み込み)'],
	'Show the active snapshot': ['현재 스냅샷 표시', '現在のスナップショットを表示'],
	Snapshot: ['스냅샷', 'スナップショット'],
	Function: ['기능', '機能'],
	Dim: ['딤', 'ディム'],
	'Speaker B': ['스피커 B', 'スピーカー B'],
	'Link Speaker B volume to Main': ['스피커 B 볼륨을 메인에 연동', 'スピーカー B の音量をメインに連動'],
	'Mute FX return on Main': ['메인에서 FX 리턴 뮤트', 'メインで FX リターンをミュート'],
	Mono: ['모노', 'モノラル'],
	'External Input': ['외부 입력', '外部入力'],
	Talkback: ['토크백', 'トークバック'],
	'Global Mute enable': ['전체 뮤트 사용', 'グローバルミュートを有効化'],
	'Global PFL enable': ['전체 PFL 사용', 'グローバル PFL を有効化'],
	'Recall main output volume': ['메인 출력 볼륨 불러오기', 'メイン出力の音量を呼び出し'],
	'Layout preset': ['레이아웃 프리셋', 'レイアウトプリセット'],
	Window: ['창', 'ウィンドウ'],
	'Show window': ['창 보이기', 'ウィンドウを表示'],
	'Hide window': ['창 숨기기', 'ウィンドウを隠す'],
	'Touch tap mutes': ['화면 터치로 뮤트', 'タッチでミュート'],
	'Step per tick (dB)': ['한 칸당 (dB)', '1クリックごと (dB)'],
	'Press actions': ['누르기 동작', '押したときの動作'],
	Press: ['누르기', '押す'],
	'Press + turn left': ['누른 채 왼쪽으로', '押しながら左に回す'],
	'Press + turn right': ['누른 채 오른쪽으로', '押しながら右に回す'],
	'Mute toggle': ['뮤트 토글', 'ミュート切り替え'],
	'Mute on': ['뮤트 켜기', 'ミュート オン'],
	'Mute off': ['뮤트 끄기', 'ミュート オフ'],
	'Step volume': ['볼륨 조절', '音量を調整'],
	'Recall volume': ['볼륨 복귀', '音量を呼び出し'],
	'Recall volume (dB)': ['복귀 볼륨 (dB)', '呼び出す音量 (dB)'],
	'e.g. -20 or 0': ['예: -20 또는 0', '例: -20 または 0'],
	'New version available:': ['새 버전이 나왔어요:', '新しいバージョンがあります:'],
	'Open release page': ['릴리즈 페이지 열기', 'リリースページを開く'],
}
let language = 'en'
const tr = (en) => TEXT[en]?.[{ ko: 0, ja: 1 }[language]] ?? en

// The English original is kept in a data- attribute so switching back (or again) always starts from it.
function translate(root) {
	if (!(root instanceof Element)) return
	const all = (sel) => [...(root.matches(sel) ? [root] : []), ...root.querySelectorAll(sel)]
	for (const [attr, key] of [['label', 'enLabel'], ['placeholder', 'enPlaceholder']])
		for (const el of all(`[${attr}]`)) {
			const text = tr((el.dataset[key] ??= el.getAttribute(attr)))
			if (el.getAttribute(attr) === text) continue
			el.setAttribute(attr, text)
			el.requestUpdate?.() // sdpi elements already drawn keep the old text until asked to redraw
		}
	// sdpi-select reads option text only when options are added, so a changed list is re-added.
	const selects = new Set()
	for (const el of all('summary, span, option')) {
		const text = tr((el.dataset.enText ??= el.textContent))
		if (el.textContent === text) continue
		el.textContent = text
		selects.add(el.closest('sdpi-select'))
	}
	for (const s of selects) s?.append(...s.querySelectorAll('option'))
}
function setLanguage(value) {
	language = Object.hasOwn({ en: 0, ko: 0, ja: 0 }, value) ? value : 'en'
	translate(document.body)
}
new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach(translate))).observe(document.body, { childList: true, subtree: true })
document.querySelector('[setting="language"]')?.addEventListener('valuechange', (e) => setLanguage(e.target.value))
SDPIComponents.streamDeckClient.getGlobalSettings().then((g) => setLanguage(g?.language))

// Fields a page adds from script miss what sdpi picks up while the page loads: sdpi-select only sees options
// added after it is on the page, and saved settings only reach fields that existed at connect. Redo both.
async function initFields(root) {
	for (const s of root.querySelectorAll('sdpi-select')) s.append(...s.querySelectorAll('option'))
	await Promise.all([...root.querySelectorAll('[setting]')].map((e) => e.updateComplete))
	await SDPIComponents.streamDeckClient.getSettings()
}

// New-release notice at the bottom of every settings screen (ui/update-check.js).
UpdateCheck.mountPluginNotice('streamdeck-RME-Totalmix-OSC-Controller', { available: 'New version available:', open: 'Open release page' })
