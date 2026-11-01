import assert from 'node:assert/strict'
import test from 'node:test'
import { TotalMixConnection } from '../dist/connection.js'
import * as r from '../dist/readers.js'
import { dbToBar, normalizedToDb } from '../dist/protocol/fader-curve.js'
import { averageEnergy } from '../dist/state/level-average.js'

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

test('rms and lufs readings average the level and carry their unit', () => {
	const { conn, msg } = setup()
	msg('/level/in/20', -20)
	const mono = { row: 'input', source: 20, destination: 2 }
	assert.equal(r.levelDb(conn, mono, 'rms'), '-20.0 dBFS')
	assert.equal(r.levelDb(conn, mono, 'lufs'), '-20.7 LUFS')
	assert.ok(Math.abs(r.levelBar(conn, mono, 'left', 'rms') - dbToBar(-20)) < 1e-9)
	msg('/input/22/stereo', 1)
	msg('/level/in/22', -20)
	msg('/level/in/23', -20)
	const stereo = { row: 'input', source: 22, destination: 2 }
	assert.equal(r.levelDb(conn, stereo, 'lufs'), '-17.7 LUFS') // loudness sums both sides
	assert.equal(r.levelDb(conn, { row: 'input', source: 30, destination: 2 }, 'lufs'), '')
	conn.stop()
})

test('averageEnergy weights each reading by how long it held, within the window', () => {
	const e = (db) => 10 ** (db / 10)
	assert.equal(averageEnergy('a', -10, 300, 1000), e(-10))
	averageEnergy('a', -30, 300, 1100) // -10 held for 100 ms
	assert.ok(Math.abs(averageEnergy('a', -30, 300, 1300) - (e(-10) + 2 * e(-30)) / 3) < 1e-9)
	assert.ok(Math.abs(averageEnergy('a', -30, 300, 1500) - e(-30)) < 1e-9) // -10 left the window
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
