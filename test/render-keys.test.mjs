import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderSnapshotKey, renderToggleKey, renderValueKey } from '../dist/render/keys.js'
import { svgDataUrl } from '../dist/render/svg.js'

const toggle = (o) => renderToggleKey({ title: 'MUTE', on: false, onColor: 'rgb(255,57,31)', overlay: 'none', ...o })

test('toggle key on uses onColor background', () => {
	assert.ok(toggle({ on: true }).includes('fill="rgb(255,57,31)"'))
	assert.ok(!toggle({ on: false }).includes('rgb(255,57,31)'))
})

test('offline overlay contains OFFLINE and dims body', () => {
	const svg = toggle({ overlay: 'offline' })
	assert.ok(svg.includes('OFFLINE'))
	const opacity = Number(/<g opacity="([\d.]+)"/.exec(svg)?.[1])
	assert.ok(opacity <= 0.4)
})

test('xml special chars in channel names are escaped', () => {
	const svg = toggle({ title: 'A&B<1>' })
	assert.ok(svg.includes('A&amp;B&lt;1&gt;'))
})

test('show-mode snapshot key shows the active number', () => {
	const svg = renderSnapshotKey({ number: 7, active: true, mode: 'show', overlay: 'none' })
	assert.ok(svg.includes('>7</text>'))
})

test('a long name without spaces is cut with an ellipsis', () => {
	assert.ok(toggle({ title: 'Averylongchannelnamewithoutspaces' }).includes('…'))
})

test('emoji name cut at the boundary still encodes', () => {
	const svg = toggle({ title: 'a'.repeat(22) + '😀😀😀' })
	assert.ok(svg.includes('…'))
	assert.doesNotThrow(() => svgDataUrl(svg))
	assert.doesNotThrow(() => svgDataUrl(toggle({ title: 'x\ud83d' })))
})

test('a name with Hangul uses the bold Hangul font; Latin text keeps Segoe UI', () => {
	assert.match(toggle({ title: '보컬 Mic', label: undefined }), /font-family="Malgun Gothic"[^>]*font-weight="700"[^>]*>보컬 Mic</)
	assert.match(toggle({ title: 'Mic', label: undefined }), /font-family="Segoe UI"[^>]*font-weight="600"[^>]*>Mic</)
	assert.match(toggle({ title: '보컬' }), /font-size="21.3"[^>]*>보컬</) // 26 scaled down: Hangul stands taller than Latin
	assert.match(toggle({ title: 'Mic' }), /font-size="26"[^>]*>Mic</)
})

test('xml-illegal control chars are removed', () => {
	const svg = toggle({ title: 'A\u0001B\u000bC' })
	assert.ok(svg.includes('>ABC<'))
})

test('a long name shrinks to fit the key; only one too long even at the smallest size is cut', () => {
	const fitted = toggle({ title: '마이크채널입력하나둘' })
	assert.ok(fitted.includes('>마이크채널입력하나둘<'))
	assert.ok(Number(/font-size="([\d.]+)"[^>]*>마이크/.exec(fitted)[1]) < 26)
	const cut = toggle({ title: '마이크채널입력하나둘'.repeat(3) })
	assert.ok(cut.includes('…'))
	assert.ok(toggle({ title: '마이크' }).includes('>마이크<'))
})

test('value bar is clamped to 0..1', () => {
	const v = (bar) => renderValueKey({ title: 'T', value: '0', bar, overlay: 'none' })
	assert.ok(v(5).includes('width="124" height="14" fill="rgb(40,140,255)"'))
	assert.ok(v(-1).includes('width="0" height="14" fill="rgb(40,140,255)"'))
	assert.ok(!renderValueKey({ title: 'T', value: '0', overlay: 'none' }).includes('height="14"'))
})

test('value key meter: VU colours and fader line in the same 124x14 box', () => {
	const m = (o) => renderValueKey({ title: 'T', value: '0', meter: { fader: 0.5, left: 0.5, right: 0.25, muted: false, ...o }, overlay: 'none' })
	const s = m({})
	assert.ok(s.includes('<linearGradient id="g"'))
	assert.ok(s.includes('x="10" y="108" width="124" height="6" fill="url(#g)" opacity="0.25"'))
	assert.ok(s.includes('x="10" y="116" width="124" height="6" fill="url(#g)" opacity="0.25"'))
	assert.ok(s.includes('x="10" y="108" width="62" height="6" fill="url(#g)"/>'))
	assert.ok(s.includes('x="10" y="116" width="31" height="6" fill="url(#g)"/>'))
	assert.ok(s.includes('<line x1="72" y1="105" x2="72" y2="125" stroke="rgb(40,140,255)"'))
	assert.ok(!s.includes('height="14"'))
	assert.ok(!s.includes('stroke="rgb(255,57,31)"'))
	assert.ok(!m({ fader: undefined }).includes('stroke="rgb(40,140,255)"'))
	const muted = m({ muted: true })
	assert.ok(muted.includes('<g opacity="0.4"><rect x="10" y="108"'))
	assert.ok(muted.includes('stroke="rgb(255,57,31)"'))
	for (const value of ['0.0 dB', '-5.0 dB', '-12.5 dB']) {
		const key = renderValueKey({ title: 'T', value, meter: { left: 0, right: 0, muted: false }, overlay: 'none' })
		assert.ok(key.includes(`font-size="26" font-weight="600" text-anchor="middle" fill="#fff">${value}<`), value)
	}
})

test('unsupported and setup overlays', () => {
	const u = toggle({ overlay: 'unsupported' })
	assert.ok(u.includes('N/A'))
	assert.ok(Number(/<g opacity="([\d.]+)"/.exec(u)[1]) <= 0.4)
	const s = toggle({ overlay: 'setup' })
	assert.ok(s.includes('>SET<') && s.includes('>CHANNEL<'))
})

test('value too wide at 34 px steps down to 26 px instead of being cut', () => {
	const wide = renderValueKey({ title: 'AN 1', value: '-12.5 dB', overlay: 'none' })
	assert.ok(wide.includes('>-12.5 dB<') && wide.includes('font-size="26"'))
	assert.ok(renderValueKey({ title: 'AN 1', value: '+3', overlay: 'none' }).includes('font-size="34"'))
})

test('every built-in label, FX title and FX value shrinks to fit instead of being cut', () => {
	const labels = ['MUTE GROUP', 'PFL GROUP', 'FADER GROUP', 'SPEAKER B', 'GLOBAL MUTE', 'GLOBAL PFL', 'RECALL VOLUME', 'LOOPBACK', 'TALKBACK', 'AUTOSET']
	for (const label of labels) assert.ok(!toggle({ title: 'CONTROL ROOM', label }).includes('…'), label)
	for (const title of ['Reverb smoothness', 'Reverb room scale', 'Echo delay time', 'Mic/Inst 12'])
		assert.ok(!renderValueKey({ title, value: '0', overlay: 'none' }).includes('…'), title)
	for (const value of ['Vintage Plate', 'Medium Room', 'Stereo Echo', '-144.5 dB'])
		assert.ok(!renderValueKey({ title: 'T', value, overlay: 'none' }).includes('…'), value)
})

const texts = (svg) => [...svg.matchAll(/font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)].map((m) => [m[2], Number(m[1])])

test('long control room and group words wrap onto two lines instead of shrinking small', () => {
	const t = texts(toggle({ title: 'CONTROL ROOM', label: 'GLOBAL MUTE' }))
	assert.deepEqual(t.map(([x]) => x), ['CONTROL', 'ROOM', 'GLOBAL', 'MUTE'])
	for (const [x, size] of t) assert.ok(size >= 20, `${x} ${size}`)
	const g = texts(toggle({ title: 'Group 1', label: 'FADER GROUP' }))
	assert.deepEqual(g.map(([x]) => x), ['Group 1', 'FADER', 'GROUP'])
})

test('a short title and label keep the one-line layout', () => {
	assert.deepEqual(texts(toggle({ title: 'GamePC', label: 'MUTE' })), [['GamePC', 26], ['MUTE', 26]])
})

test('a long FX title wraps; its value stays on one line', () => {
	const t = texts(renderValueKey({ title: 'Reverb smoothness', value: 'Vintage Plate', overlay: 'none' }))
	assert.deepEqual(t.map(([x]) => x), ['Reverb', 'smoothness', 'Vintage Plate'])
	assert.ok(t[0][1] >= 20 && t[1][1] >= 20, JSON.stringify(t))
})
