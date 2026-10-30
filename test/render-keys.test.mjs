import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderSnapshotKey, renderToggleKey } from '../dist/render/keys.js'

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
