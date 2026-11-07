import assert from 'node:assert/strict'
import test from 'node:test'
import { TotalMixConnection } from '../dist/connection.js'
import * as r from '../dist/readers.js'
import { dbToBar, normalizedToDb } from '../dist/protocol/fader-curve.js'

const settings = { host: '127.0.0.1', targetPort: 7001, feedbackPort: 9001, syncTimeoutMs: 50 }
const tick = () => new Promise((resolve) => setImmediate(resolve))

function setup() {
	const sent = []
	const intervals = []
	const transports = []
	const conn = new TotalMixConnection({
		setInterval: (fn, ms) => (intervals.push({ fn, ms }), undefined),
		createTransport: (_o, callbacks) => {
			transports.push(callbacks)
			return { start() {}, close() {}, send: async (address, ...args) => void sent.push({ address, args }) }
		},
	})
	conn.start(settings)
	const msg = (address, ...args) => conn.controller.handleMessage({ address, args })
	return { conn, sent, msg, transports, sync: () => intervals.filter((i) => i.ms === 250).at(-1).fn() }
}

const input1 = { row: 'input', source: 1, destination: 2 }

test('levelBar right side reads the next channel of a stereo pair', () => {
	const { conn, msg } = setup()
	msg('/level/in/1', -20)
	msg('/level/in/2', -6)
	msg('/level/in/3', -40)
	const left = r.levelBar(conn, input1, 'left')
	assert.equal(r.levelBar(conn, input1, 'right'), left) // mono: right mirrors left
	msg('/input/1/stereo', 1)
	assert.equal(r.levelBar(conn, input1, 'right'), dbToBar(-6))
	assert.equal(left, dbToBar(-20))
	assert.equal(r.levelBar(conn, { row: 'input', source: 9, destination: 1 }, 'left'), 0)
	conn.stop()
})

test('the right meter of a stereo output pair does not sync the partner output fader', async () => {
	const { conn, sent, msg, sync } = setup()
	msg('/status/device', 'x')
	msg('/output/4/stereo', 1)
	msg('/level/out/5', -6)
	assert.equal(r.levelBar(conn, { row: 'output', output: 4 }, 'right'), dbToBar(-6))
	// TotalMix never reports a fader for the right half of a pair, so syncing it would block the queue.
	for (let i = 0; i < 5; i++) {
		sync()
		await new Promise((resolve) => setTimeout(resolve, 60))
	}
	assert.ok(!sent.some((m) => m.address === '/sendchan/output/5'), 'partner output 5 was synced')
	conn.stop()
})

test('faderDb prefers the TotalMix display text', () => {
	const { conn, msg } = setup()
	assert.equal(r.faderDb(conn, input1), '')
	msg('/mix/in/1/2/faderlin', 0.5)
	const fallback = r.faderDb(conn, input1)
	assert.match(fallback, /dB/)
	conn.controller.state.setRouteDisplay({ bus: 'input', index: 1, output: 2 }, 'shown')
	assert.equal(r.faderDb(conn, input1), 'shown')
	assert.equal(r.faderBar(conn, input1), dbToBar(normalizedToDb(0.5)))
	conn.stop()
})

test('muted reads output mute from the channel parameter', () => {
	const { conn, msg } = setup()
	msg('/output/3/mute', 1)
	assert.equal(r.muted(conn, { row: 'output', output: 3 }), true)
	msg('/input/1/mute', 1)
	assert.equal(r.muted(conn, input1), true)
	assert.equal(r.muted(conn, { row: 'input', source: 2, destination: 1 }), false)
	conn.stop()
})

test('activeSnapshot returns the snapshot TotalMix reports as active', () => {
	const { conn, msg } = setup()
	assert.equal(r.activeSnapshot(conn), undefined)
	msg('/snapshot/load/4', 2)
	assert.equal(r.activeSnapshot(conn), 4)
	conn.stop()
})

test('panText maps 0..1 to L / C / R / number', () => {
	const { conn, msg } = setup()
	assert.equal(r.panText(conn, input1), '')
	msg('/mix/in/1/2/balpan', 0)
	assert.equal(r.panText(conn, input1), 'C')
	assert.equal(r.panValue(conn, input1), 0.5)
	conn.stop()
})

test('hasCapability is optimistic for an unknown device before discovery data', () => {
	const { conn } = setup()
	for (const kind of ['gain', 'phantom', 'duRec', 'globalFx', 'roomEq', 'channelFx']) {
		assert.equal(r.hasCapability(conn, kind, 2), true, kind)
	}
	conn.stop()
})

test('hasCapability uses discovery after data, but roomEq and channelFx stay true', () => {
	const { conn, msg } = setup()
	msg('/input/2/48v', 0)
	assert.equal(r.hasCapability(conn, 'phantom', 2), true)
	assert.equal(r.hasCapability(conn, 'phantom', 3), false)
	assert.equal(r.hasCapability(conn, 'duRec'), false)
	assert.equal(r.hasCapability(conn, 'roomEq'), true)
	assert.equal(r.hasCapability(conn, 'channelFx'), true)
	conn.stop()
})

test('hasCapability treats a known device profile as authoritative', () => {
	const { conn, msg } = setup()
	msg('/status/device', 'Fireface UFX II')
	msg('/input/2/48v', 0) // discovery must not override the profile
	assert.equal(r.hasCapability(conn, 'phantom', 9), true)
	assert.equal(r.hasCapability(conn, 'phantom', 2), false)
	assert.equal(r.hasCapability(conn, 'pad', 9), false)
	conn.stop()
})

test('readers register their targets', async () => {
	const { conn, sent, transports, sync } = setup()
	r.faderDb(conn, input1)
	transports[0].onMessage({ address: '/status/device', args: ['x'] })
	const before = sent.length
	sync()
	await tick()
	assert.ok(sent.slice(before).length > 0, 'background sync requested the registered route')
	conn.stop()
})
