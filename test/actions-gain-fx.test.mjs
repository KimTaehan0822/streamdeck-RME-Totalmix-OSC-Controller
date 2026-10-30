import assert from 'node:assert/strict'
import test from 'node:test'
import { TotalMixConnection } from '../dist/connection.js'
import { FxParamAction, FxParamDialAction, GainAction, GainDialAction, GlobalFxAction, ProcessingParamAction } from '../dist/actions/gain-fx.js'

const settings = { host: '127.0.0.1', targetPort: 7001, feedbackPort: 9001, syncTimeoutMs: 50 }
const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms))

function setup() {
	const sent = []
	const conn = new TotalMixConnection({
		setInterval: () => undefined,
		createTransport: () => ({ start() {}, close() {}, send: async (address, ...args) => void sent.push({ address, args }) }),
	})
	conn.start(settings)
	const msg = (address, ...args) => conn.controller.handleMessage({ address, args })
	return { conn, sent, msg }
}

/** Fake key or dial; images collects what was drawn. */
function fake(dial, s, multi = false) {
	const images = []
	const action = {
		id: 'a1',
		isDial: () => dial,
		isKey: () => !dial,
		isInMultiAction: () => multi,
		setImage: async (image) => void images.push(decodeURIComponent(image)),
		setFeedback: async ({ canvas }) => void images.push(decodeURIComponent(canvas)),
		setFeedbackLayout: async () => {},
	}
	const ev = (payload = {}) => ({ action, payload: { settings: s, ...payload } })
	return { images, appear: ev(), ev }
}

/** Appears, presses (and releases) a key, returns what it drew and sent. */
async function pressKey(Action, conn, s) {
	const action = new Action(conn)
	const key = fake(false, s)
	await action.onWillAppear(key.appear)
	await wait()
	await action.onKeyDown(key.ev())
	action.onKeyUp?.(key.ev())
	await wait()
	await action.onWillDisappear(key.appear)
	return key.images.at(-1)
}

test('gain key steps the gain by the configured dB', async () => {
	const { conn, sent, msg } = setup()
	msg('/input/2/gain', 10)
	await pressKey(GainAction, conn, { channel: '2', step: '-2' })
	assert.deepEqual(sent.at(-1), { address: '/input/2/gain', args: [8] })
	conn.stop()
})

test('gain key inside a multi-action steps once and does not repeat', async () => {
	const { conn, sent, msg } = setup()
	msg('/input/2/gain', 10)
	const action = new GainAction(conn)
	const key = fake(false, { channel: '2', step: '-2' }, true)
	await action.onWillAppear(key.appear)
	await action.onKeyDown(key.ev())
	await wait(600)
	assert.equal(sent.filter((m) => m.address === '/input/2/gain').length, 1)
	await action.onWillDisappear(key.appear)
	conn.stop()
})

test('gain dial rotate adds ticks times the step', async () => {
	const { conn, sent, msg } = setup()
	msg('/input/0/gain', 20)
	const dial = new GainDialAction(conn)
	const d = fake(true, { channel: '0', step: '0.5' })
	await dial.onWillAppear(d.appear)
	dial.onDialRotate(d.ev({ ticks: 4 }))
	await wait()
	assert.deepEqual(sent.at(-1), { address: '/input/0/gain', args: [22] })
	await dial.onWillDisappear(d.appear)
	conn.stop()
})

test('gain dial press toggles autoset', async () => {
	const { conn, sent, msg } = setup()
	msg('/input/1/autoset', 0)
	const dial = new GainDialAction(conn)
	const d = fake(true, { channel: '1' })
	await dial.onWillAppear(d.appear)
	await dial.onDialDown(d.ev())
	assert.deepEqual(sent.at(-1), { address: '/input/1/autoset', args: [1] })
	await dial.onWillDisappear(d.appear)
	conn.stop()
})

test('gain dial press without AutoSet sends nothing', async () => {
	const { conn, sent, msg } = setup()
	msg('/input/1/autoset', 0)
	conn.controller.state.getDiscoveredCapabilities = () => ({ inputGainChannels: [1], autosetChannels: [] })
	Object.defineProperty(conn.controller.state, 'hasGlobalDiscoveryData', { get: () => true })
	const dial = new GainDialAction(conn)
	const d = fake(true, { channel: '1' })
	await dial.onWillAppear(d.appear)
	await wait()
	assert.match(d.images.at(-1), /N\/A/)
	const before = sent.length
	await dial.onDialDown(d.ev())
	assert.equal(sent.length, before)
	await dial.onWillDisappear(d.appear)
	conn.stop()
})

test('gain on input without gain capability renders N/A', async () => {
	const { conn, sent, msg } = setup()
	msg('/input/0/gain', 10)
	conn.controller.state.getDiscoveredCapabilities = () => ({ inputGainChannels: [], autosetChannels: [] })
	Object.defineProperty(conn.controller.state, 'hasGlobalDiscoveryData', { get: () => true })
	const before = sent.length
	const image = await pressKey(GainAction, conn, { channel: 0 })
	assert.match(image, /N\/A/)
	assert.equal(sent.length, before)
	conn.stop()
})

test('global-fx press switches the effect', async () => {
	const { conn, sent, msg } = setup()
	msg('/echo/enable', 0)
	await pressKey(GlobalFxAction, conn, { effect: 'echoEnable', operation: 'toggle' })
	assert.deepEqual(sent.at(-1), { address: '/echo/enable', args: [1] })
	conn.stop()
})

test('fx-param set sends the value', async () => {
	const { conn, sent } = setup()
	await pressKey(FxParamAction, conn, { parameter: 'reverbTime', mode: 'set', value: '1.5' })
	assert.deepEqual(sent.at(-1), { address: '/reverb/time', args: [1.5] })
	conn.stop()
})

test('fx-param step adds to the current value', async () => {
	const { conn, sent, msg } = setup()
	msg('/reverb/volume', -6)
	await pressKey(FxParamAction, conn, { parameter: 'reverbVolume', mode: 'step', value: '2' })
	assert.deepEqual(sent.at(-1), { address: '/reverb/volume', args: [-4] })
	conn.stop()
})

test('fx-param step is clamped to the native range', async () => {
	const { conn, sent, msg } = setup()
	msg('/reverb/volume', 9999)
	await pressKey(FxParamAction, conn, { parameter: 'reverbVolume', mode: 'step', value: '5' })
	assert.deepEqual(sent.at(-1), { address: '/reverb/volume', args: [10000] })
	conn.stop()
})

test('fx-param step with an unknown current value sends nothing', async () => {
	const { conn, sent } = setup()
	await pressKey(FxParamAction, conn, { parameter: 'reverbVolume', mode: 'step', value: '2' })
	assert.equal(sent.filter((m) => m.address === '/reverb/volume').length, 0)
	conn.stop()
})

test('fx-param-dial rotate steps and press resets', async () => {
	const { conn, sent, msg } = setup()
	msg('/echo/feedback', 10)
	const dial = new FxParamDialAction(conn)
	const d = fake(true, { parameter: 'echoFeedback', step: '3', reset: '0' })
	await dial.onWillAppear(d.appear)
	await wait()
	assert.match(d.images.at(-1), /Echo feedback/)
	dial.onDialRotate(d.ev({ ticks: -2 }))
	await wait()
	assert.deepEqual(sent.at(-1), { address: '/echo/feedback', args: [4] })
	await dial.onDialDown(d.ev())
	assert.deepEqual(sent.at(-1), { address: '/echo/feedback', args: [0] })
	await dial.onWillDisappear(d.appear)
	conn.stop()
})

test('processing-param sets the channel parameter', async () => {
	const { conn, sent } = setup()
	await pressKey(ProcessingParamAction, conn, { row: 'input', channel: '3', parameter: 'eqGain1', value: '4.5' })
	assert.deepEqual(sent.at(-1), { address: '/input/3/eq/band1gain', args: [4.5] })
	conn.stop()
})

for (const [name, Action, s, hint] of [
	['gain', GainAction, {}, /CHANNEL/],
	['global-fx', GlobalFxAction, {}, /SETUP/],
	['fx-param', FxParamAction, { parameter: 'reverbVolume' }, /SETUP/],
	['processing-param', ProcessingParamAction, { row: 'input', channel: 0, parameter: 'nope', value: 1 }, /CHANNEL/],
]) {
	test(`${name} with invalid settings renders setup and sends nothing`, async () => {
		const { conn, sent } = setup()
		const before = sent.length
		assert.match(await pressKey(Action, conn, s), hint)
		assert.equal(sent.length, before)
		conn.stop()
	})
}
