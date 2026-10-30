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

test('long names are cut with an ellipsis', () => {
	assert.ok(toggle({ title: 'A very long channel name' }).includes('…'))
})

test('emoji name cut at the boundary still encodes', () => {
	const svg = toggle({ title: 'a'.repeat(9) + '😀😀😀' })
	assert.ok(svg.includes('…'))
	assert.doesNotThrow(() => svgDataUrl(svg))
	assert.doesNotThrow(() => svgDataUrl(toggle({ title: 'x\ud83d' })))
})

test('xml-illegal control chars are removed', () => {
	const svg = toggle({ title: 'A\u0001B\u000bC' })
	assert.ok(svg.includes('>ABC<'))
})

test('long Hangul name is cut', () => {
	const svg = toggle({ title: '마이크채널입력하나둘' })
	assert.ok(svg.includes('…'))
	assert.ok(!svg.includes('둘'))
	assert.ok(toggle({ title: '마이크' }).includes('>마이크<'))
})

test('value bar is clamped to 0..1', () => {
	const v = (bar) => renderValueKey({ title: 'T', value: '0', bar, overlay: 'none' })
	assert.ok(v(5).includes('width="124" height="14" fill="rgb(40,140,255)"'))
	assert.ok(v(-1).includes('width="0" height="14" fill="rgb(40,140,255)"'))
	assert.ok(!renderValueKey({ title: 'T', value: '0', overlay: 'none' }).includes('height="14"'))
})

test('unsupported and setup overlays', () => {
	const u = toggle({ overlay: 'unsupported' })
	assert.ok(u.includes('N/A'))
	assert.ok(Number(/<g opacity="([\d.]+)"/.exec(u)[1]) <= 0.4)
	const s = toggle({ overlay: 'setup' })
	assert.ok(s.includes('>SET<') && s.includes('>CHANNEL<'))
})
