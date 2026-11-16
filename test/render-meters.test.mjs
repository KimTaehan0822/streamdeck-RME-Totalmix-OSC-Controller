import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { test } from 'node:test'
import { SHARED_DESIGNS } from '../dist/render/meters/index.js'
import { renderButtonFader, renderVuStrip, setMeterStyle } from '../dist/render/meter.js'
import { renderValueKey } from '../dist/render/keys.js'
import { dbToBar } from '../dist/protocol/fader-curve.js'

mkdirSync(new URL('./out/meters/', import.meta.url), { recursive: true })
const save = (name, svg) => (writeFileSync(new URL(`./out/meters/${name}.svg`, import.meta.url), svg), svg)
const input = (o = {}) => ({
	name: 'NoneLive', leftDb: -12, rightDb: -14, fader: { db: 0 }, faderText: '0.0 dB', levelText: '-12.0 dB',
	muted: false, peek: false, overlay: 'none', ...o,
})
const keyInput = (o = {}, m = {}) => ({ title: 'NoneLive', value: '-6.0 dB', meter: { leftDb: -12, rightDb: -14, fader: { db: -6 }, muted: false, ...m }, overlay: 'none', ...o })
const ROLES = ['top', 'bottom', 'left', 'right']
const clean = (svg, label) => {
	assert.ok(!svg.includes('NaN'), `${label}: NaN`)
	assert.ok(!svg.includes('undefined'), `${label}: undefined`)
	assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), `${label}: not one svg`)
}

for (const [id, d] of Object.entries(SHARED_DESIGNS)) {
	test(`${id}: every surface draws the name, the values and no stray NaN or cut text`, () => {
		const strip = save(`${id}-strip`, d.strip(input()))
		clean(strip, 'strip')
		assert.ok(strip.includes('NoneLive') && strip.includes('0.0'), 'strip name and fader')
		assert.ok(!strip.includes('…'), 'strip text cut')
		const key = save(`${id}-key`, d.key(keyInput()))
		clean(key, 'key')
		assert.ok(key.includes('NoneLive') && key.includes('-6.0'), 'key name and value')
		assert.ok(!key.includes('…'), 'key text cut')
		const pair = ROLES.map((r) => save(`${id}-${r}`, d.pair(input(), r)))
		pair.forEach((svg, i) => clean(svg, ROLES[i]))
		assert.ok(pair[0].includes('NoneLive') && pair[2].includes('NoneLive'), 'name on the first key of each pair')
		assert.ok(pair.join('').includes('-12.0'), 'level text somewhere on the pair')
	})

	test(`${id}: muted shows MUTED, a peek shows the fader value instead`, () => {
		const strip = save(`${id}-strip-muted`, d.strip(input({ muted: true })))
		assert.ok(strip.includes('MUTED'), 'strip MUTED')
		assert.ok(d.strip(input({ muted: true, peek: true, faderText: '-3.5 dB' })).includes('-3.5'), 'strip peek')
		assert.ok(d.key(keyInput({}, { muted: true })).includes('MUTED'), 'key MUTED')
		for (const role of ['bottom', 'right']) {
			assert.ok(d.pair(input({ muted: true }), role).includes('MUTED'), `${role} MUTED`)
			assert.ok(d.pair(input({ muted: true, peek: true, faderText: '-3.5 dB' }), role).includes('-3.5'), `${role} peek`)
		}
	})

	test(`${id}: silence, NaN, a gain fader, a badge, an empty name and a long name all draw cleanly`, () => {
		for (const [label, o] of [
			['silence', { leftDb: -Infinity, rightDb: -Infinity, levelText: '' }],
			['nan', { leftDb: NaN, rightDb: NaN }],
			['loud', { leftDb: 6, rightDb: 3, fader: { db: 6 } }],
			['gain', { fader: { linear: 0.5 }, faderText: 'Gain +12.0 dB', badge: { text: '48V', fill: 'rgb(40,140,255)' } }],
			['empty', { name: '', faderText: '', levelText: '', fader: undefined, overlay: 'setup' }],
			['long', { name: 'Streaming Mix Bus Left' }],
			['hangul', { name: '보컬 마이크' }],
		]) {
			clean(save(`${id}-strip-${label}`, d.strip(input(o))), `strip ${label}`)
			for (const r of ROLES) clean(d.pair(input(o), r), `${r} ${label}`)
			clean(d.key(keyInput({ title: o.name ?? 'NoneLive' }, { leftDb: o.leftDb ?? -12, rightDb: o.rightDb ?? -14, fader: o.fader })), `key ${label}`)
		}
		assert.ok(d.strip(input({ badge: { text: '48V', fill: 'rgb(40,140,255)' } })).includes('48V'), 'badge shown')
	})
}

test('the meter style setting routes every surface to the chosen shared design, and back', () => {
	const v = { name: 'Mic', fader: dbToBar(0), left: dbToBar(-12), right: dbToBar(-14), faderDb: '0.0 dB', levelDb: '-12.0 dB', muted: false, peek: false, overlay: 'none' }
	const plain = renderVuStrip(v)
	setMeterStyle('vu')
	assert.ok(renderVuStrip(v).includes('#f2b54a'))
	assert.ok(renderButtonFader(v, 'bottom').includes('#f2b54a'))
	assert.ok(renderValueKey({ title: 'Mic', value: '0.0 dB', meter: { fader: dbToBar(0), left: dbToBar(-12), right: dbToBar(-14), muted: false }, overlay: 'none' }).includes('#f2b54a'))
	setMeterStyle('topping')
	assert.ok(renderVuStrip(v).includes('#1F1F1F'))
	setMeterStyle('abc')
	assert.equal(renderVuStrip(v), plain)
	setMeterStyle('plugin')
})

test('a value key without a meter keeps its own look under a shared design', () => {
	const k = { title: 'Reverb', value: '50 %', bar: 0.5, overlay: 'none' }
	setMeterStyle('plugin')
	const plain = renderValueKey(k)
	setMeterStyle('vu')
	assert.equal(renderValueKey(k), plain)
	setMeterStyle('plugin')
})

test('dials and buttons can use different designs; buttons follow the dials when set to same', async () => {
	const { setMeterStyles } = await import('../dist/render/meter.js')
	const v = { name: 'Mic', fader: dbToBar(0), left: dbToBar(-12), right: dbToBar(-14), faderDb: '0.0 dB', levelDb: '-12.0 dB', muted: false, peek: false, overlay: 'none' }
	const keyView = { title: 'Mic', value: '0.0 dB', meter: { fader: dbToBar(0), left: dbToBar(-12), right: dbToBar(-14), muted: false }, overlay: 'none' }
	setMeterStyles('vu', 'topping')
	assert.ok(renderVuStrip(v).includes('#f2b54a') && !renderVuStrip(v).includes('#1F1F1F'))
	assert.ok(renderButtonFader(v, 'top').includes('#1F1F1F') && !renderButtonFader(v, 'top').includes('#f2b54a'))
	assert.ok(renderValueKey(keyView).includes('#1F1F1F'))
	setMeterStyles('classic', 'same')
	assert.ok(renderButtonFader(v, 'top').includes('rgb(31,41,48)'))
	setMeterStyles('big', undefined)
	assert.ok(renderValueKey(keyView).includes('font-weight="300"'))
	setMeterStyles('plugin', 'vu')
	setMeterStyle('plugin') // the one-value form sets both again
	assert.ok(!renderButtonFader(v, 'top').includes('#f2b54a'))
})

test('the VU needle eases toward a new level per key and asks for more frames until it settles', async () => {
	const { smoothNeedle, needleMoving, forgetNeedle, setNeedleClock } = await import('../dist/render/meters/vu.js')
	const d = SHARED_DESIGNS.vu
	let now = 0
	setNeedleClock(() => now)
	const loud = d.strip(input({ leftDb: -14, rightDb: -14 }))
	const quiet = d.strip(input({ leftDb: -Infinity, rightDb: -Infinity }))
	smoothNeedle('k1')
	assert.equal(d.strip(input({ leftDb: -14, rightDb: -14 })), loud, 'first frame jumps straight to the level')
	needleMoving()
	now = 40
	const falling = d.strip(input({ leftDb: -Infinity, rightDb: -Infinity }))
	assert.ok(falling !== quiet && falling !== loud, 'needle is between the two levels after 40 ms')
	assert.equal(needleMoving(), true, 'still moving, so another frame is wanted')
	assert.equal(needleMoving(), false, 'the flag clears once read')
	now = 3000
	assert.equal(d.strip(input({ leftDb: -Infinity, rightDb: -Infinity })), quiet, 'settled after a long pause')
	assert.equal(needleMoving(), false)
	smoothNeedle('k2')
	assert.equal(d.strip(input({ leftDb: -14, rightDb: -14 })), loud, 'another key keeps its own needle')
	smoothNeedle(undefined)
	forgetNeedle('k1')
	forgetNeedle('k2')
	setNeedleClock(Date.now)
})

test('the VU needle reads the peak minus the user offset against a 0 VU set in dBFS; the key shows TotalMix peak level', async () => {
	const { setVuCalibration } = await import('../dist/render/meters/vu.js')
	const d = SHARED_DESIGNS.vu
	const angle = (svg) => {
		const m = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" stroke="#111"/g)][0]
		return Math.atan2(+m[3] - +m[1], +m[2] - +m[4])
	}
	const at = (db) => d.strip(input({ leftDb: db, rightDb: db }))
	setVuCalibration(undefined, undefined)
	const zeroVu = angle(at(-13)) // defaults: 5 dB offset, 0 VU = -18 dBFS
	assert.ok(d.pair(input({ leftDb: -13, rightDb: -13, levelText: '-13.0 dB' }), 'bottom').includes('-13.0 dB'), 'the text is TotalMix peak level, not the estimate')
	assert.ok(!at(-13).includes('dBFS'), 'the face carries no calibration text')
	assert.deepEqual([...at(-13).matchAll(/>(\d+)</g)].map((m) => m[1]), ['20', '10', '7', '5', '3', '0', '3'], 'classic VU numbers')
	setVuCalibration(-20, 3)
	assert.ok(Math.abs(angle(at(-17)) - zeroVu) < 1e-6, '-17 peak - 3 = -20 = 0 VU at -20 reference')
	setVuCalibration('abc', '')
	assert.ok(Math.abs(angle(at(-13)) - zeroVu) < 1e-6, 'a bad reference falls back to -18 and an empty offset to 5')
	setVuCalibration(-18, 99)
	assert.ok(Math.abs(angle(at(-3)) - zeroVu) < 1e-6, 'offset clamped to 15')
	setVuCalibration(-18, -4)
	assert.ok(Math.abs(angle(at(-18)) - zeroVu) < 1e-6, 'a negative offset is held at 0')
	setVuCalibration(undefined, undefined)
})

test('the old +4 and +10 dBu VU choices draw the single VU design', () => {
	const v = { name: 'Mic', fader: dbToBar(0), left: dbToBar(-12), right: dbToBar(-14), faderDb: '0.0 dB', levelDb: '-12.0 dB', muted: false, peek: false, overlay: 'none' }
	setMeterStyle('vu')
	const vu = renderVuStrip(v)
	for (const old of ['vu4', 'vu10']) {
		setMeterStyle(old)
		assert.equal(renderVuStrip(v), vu, old)
	}
	setMeterStyle('plugin')
})

test('the VU needle reads an average over about 300 ms, so a short burst stays low and it falls just as slowly', async () => {
	const { smoothNeedle, forgetNeedle, setNeedleClock } = await import('../dist/render/meters/vu.js')
	const d = SHARED_DESIGNS.vu
	const angle = (svg) => {
		const m = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" stroke="#111"/g)][0]
		return Math.atan2(+m[3] - +m[1], +m[2] - +m[4])
	}
	const steady = (db) => angle(d.strip(input({ leftDb: db, rightDb: db })))
	const [at20, at22] = [steady(-20), steady(-22)] // before naming a key, so these do not feed the average
	let now = 0
	setNeedleClock(() => now)
	smoothNeedle('avg')
	d.strip(input({ leftDb: -Infinity, rightDb: -Infinity }))
	now = 40
	assert.ok(angle(d.strip(input({ leftDb: -6, rightDb: -6 }))) < at20, '40 ms of -6 dBFS still reads below -20 dBFS')
	now = 2000
	d.strip(input({ leftDb: -20, rightDb: -20 }))
	now = 2040
	assert.ok(angle(d.strip(input({ leftDb: -Infinity, rightDb: -Infinity }))) > at22, '40 ms after the sound stops it is still near -20 dBFS')
	smoothNeedle(undefined)
	forgetNeedle('avg')
	setNeedleClock(Date.now)
})
