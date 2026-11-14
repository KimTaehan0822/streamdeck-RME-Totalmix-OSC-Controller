import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { test } from 'node:test'
import { renderButtonFader, renderKeyMeter, renderVuStrip, setMeterStyle } from '../dist/render/meter.js'

const view = (o) => ({
	name: 'Mic 1', fader: 0.7, left: 0.75, right: 0.3, faderDb: '-6.0 dB', levelDb: '-12.3 dB',
	muted: false, peek: false, overlay: 'none', ...o,
})
mkdirSync(new URL('./out/', import.meta.url), { recursive: true })
const save = (name, svg) => (writeFileSync(new URL(`./out/${name}.svg`, import.meta.url), svg), svg)
// filled bars are the rects using the gradient without a track opacity
const fills = (svg) => [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="url\(#g\)"\/>/g)].map((m) => m.slice(1).map(Number))
const blueLines = (svg) => (svg.match(/stroke="rgb\(40,140,255\)"/g) ?? []).length

test('bottom half shows a full bar when level is above 0.5 and top half shows the rest', () => {
	const v = view({ left: 0.75, right: 0.25 })
	const bottom = fills(save('bottom', renderButtonFader(v, 'bottom')))
	const top = fills(save('top', renderButtonFader(v, 'top')))
	// bottom key: left bar full (72px = half key), right bar half of that
	assert.equal(bottom[0][3], 72)
	assert.equal(bottom[1][3], 36)
	// top key: left bar half of its 72px bar; right bar (0.25 < 0.5) empty
	assert.equal(top.length, 1)
	assert.equal(top[0][3], 36)
	assert.equal(top[0][1], 72 + 36)
})

test('fader line only in the key whose half contains it', () => {
	const v = view({ fader: 0.7 })
	assert.equal(blueLines(renderButtonFader(v, 'top')), 1)
	assert.equal(blueLines(renderButtonFader(v, 'bottom')), 0)
	assert.equal(blueLines(renderButtonFader(view({ fader: 0.2 }), 'left')), 1)
	assert.equal(blueLines(renderButtonFader(view({ fader: 0.2 }), 'right')), 0)
	assert.equal(blueLines(renderButtonFader(view({ fader: undefined }), 'left')), 0)
})

test('muted shows MUTED and hides level dB', () => {
	for (const svg of [renderVuStrip(view({ muted: true })), renderButtonFader(view({ muted: true }), 'bottom')]) {
		assert.ok(svg.includes('MUTED'))
		assert.ok(!svg.includes('-12.3 dB') && !svg.includes('-6.0 dB'))
		assert.ok(svg.includes('opacity="0.4"'))
	}
	save('strip-muted', renderVuStrip(view({ muted: true })))
	// the other key of the pair has no MUTED slot but hides its level
	const topKey = renderButtonFader(view({ muted: true }), 'top')
	assert.ok(!topKey.includes('MUTED') && !topKey.includes('-6.0 dB'))
})

test('peek shows fader dB instead of MUTED', () => {
	for (const svg of [renderVuStrip(view({ muted: true, peek: true })), renderButtonFader(view({ muted: true, peek: true }), 'right')]) {
		assert.ok(!svg.includes('MUTED'))
		assert.ok(svg.includes('-6.0 dB'))
		assert.ok(!svg.includes('-12.3 dB'))
	}
})

test('vu strip is 200x100', () => {
	const svg = save('strip', renderVuStrip(view()))
	assert.ok(svg.includes('width="200" height="100"'))
	assert.ok(svg.includes('Mic 1') && svg.includes('-12.3 dB') && svg.includes('-6.0 dB'))
	assert.equal(blueLines(svg), 1)
	for (const role of ['left', 'right']) save(role, renderButtonFader(view(), role))
})

test('hangul names are escaped and fit', () => {
	assert.ok(renderVuStrip(view({ name: '마이크 <1>' })).includes('마이크 &lt;1&gt;'))
})

test('dB texts on keys are not truncated', () => {
	for (const role of ['bottom', 'left', 'top', 'right']) {
		const svg = renderButtonFader(view({ levelDb: '-12.3 dB', faderDb: '-12.3 dB' }), role)
		assert.ok(!svg.includes('…'), role)
	}
})

test('strip bar geometry and horizontal roles', () => {
	// left 0.75 of the 176px bar = 132px; right 0.3 = 52.8px
	assert.deepEqual(fills(renderVuStrip(view())).map((f) => f[2]), [132, 52.8])
	// horizontal: left key covers 0-0.5 (bar 94 units * 1.44 = 135.36 px), right key 0.5-1
	assert.equal(fills(renderButtonFader(view({ left: 0.75 }), 'left'))[0][2], 135.36)
	assert.equal(fills(renderButtonFader(view({ left: 0.75 }), 'right'))[0][2], 67.68)
})

test('right key shows the fader value in its bottom row, level row of the left key', () => {
	const svg = renderButtonFader(view({ faderDb: '-6.0 dB' }), 'right')
	const y = Number(/<text x="[\d.]+" y="([\d.]+)"[^>]*>-6\.0 dB</.exec(svg)?.[1])
	assert.ok(y > 100, `value baseline ${y} should sit in the bottom row`)
})

test('capitals count as wider, so an all-caps name is sized below a lowercase one', () => {
	const sizeOf = (name) => Number(/font-size="([\d.]+)"/.exec(renderButtonFader(view({ name }), 'left'))?.[1])
	assert.ok(sizeOf('DAW OUT') <= 26, `DAW OUT at ${sizeOf('DAW OUT')}`)
	assert.ok(sizeOf('daw out') > sizeOf('DAW OUT'))
})

test('a long name shrinks on the VU strip too', () => {
	const svg = renderVuStrip(view({ name: 'Streaming Mix Bus' }))
	assert.ok(svg.includes('>Streaming Mix Bus<'))
})

test('long names shrink to fit the key instead of being cut', () => {
	for (const role of ['left', 'top']) {
		const svg = save(`long-${role}`, renderButtonFader(view({ name: 'Analog 1/2 Mic' }), role))
		assert.ok(svg.includes('>Analog 1/2 Mic<'), role)
		const size = Number(/font-size="([\d.]+)"[^>]*>Analog 1\/2 Mic</.exec(svg)?.[1])
		assert.ok(size < 28.8, `${role} name size ${size}`)
		for (const name of ['Headset Microphone', '게임 PC 사운드 입력단']) assert.ok(renderButtonFader(view({ name }), role).includes(`>${name}<`), name)
	}
})

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
	assert.ok(/<line x1="170.4"[^>]*stroke="rgb\(40,140,255\)"/.test(svg)) // 0 dB fader at 0.9 -> x = 12 + 158.4
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
	// -12 dB -> 0.585: bottom key full, top key holds the rest
	const bottomGreen = (renderButtonFader(v, 'bottom').match(/fill="rgb\(25,209,32\)"/g) ?? []).length
	assert.ok(bottomGreen >= 2)
	assert.ok(renderButtonFader(v, 'top').includes('fill="rgb(25,209,32)"'))
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
