import assert from 'node:assert/strict'
import test from 'node:test'
import { TotalMixConnection } from '../dist/connection.js'
import { GroupAction, InputOptionAction, MuteAction, SoloAction } from '../dist/actions/channel-toggles.js'

const settings = { host: '127.0.0.1', targetPort: 7001, feedbackPort: 9001, syncTimeoutMs: 50 }
const tick = () => new Promise((resolve) => setTimeout(resolve, 20))

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

/** Minimal ev.action: a key that records the images it was given. */
function fakeKey(settings) {
	const images = []
	const action = { id: 'k1', isDial: () => false, isKey: () => true, isInMultiAction: () => false, setImage: async (image) => void images.push(decodeURIComponent(image)) }
	return {
		images,
		appear: { action, payload: { settings } },
		press: { action, payload: { settings } },
	}
}

test('missing target renders the setup hint', async () => {
	const { conn } = setup()
	const action = new MuteAction(conn)
	const key = fakeKey({})
	await action.onWillAppear(key.appear)
	await tick()
	assert.match(key.images.at(-1), /CHANNEL/)
	await action.onKeyDown(key.press) // must not throw
	await action.onWillDisappear(key.appear)
	conn.stop()
})

async function press(action, settings) {
	const key = fakeKey(settings)
	await action.onWillAppear(key.appear)
	await tick()
	await action.onKeyDown(key.press)
	const image = key.images.at(-1)
	await action.onWillDisappear(key.appear)
	return image
}

test('mute press toggles via setMute', async () => {
	const { conn, sent, msg } = setup()
	msg('/input/2/mute', 0)
	// select values arrive as strings, 0-based
	await press(new MuteAction(conn), { row: 'input', channel: '2' })
	assert.deepEqual(sent.at(-1), { address: '/input/2/mute', args: [1] })
	conn.stop()
})

test('output mute goes through setChannelOption', async () => {
	const { conn, sent, msg } = setup()
	msg('/output/3/mute', 0)
	await press(new MuteAction(conn), { row: 'output', channel: 3 })
	assert.deepEqual(sent.at(-1), { address: '/output/3/mute', args: [1] })
	conn.stop()
})

test('operation off does not toggle a muted channel back on', async () => {
	const { conn, sent, msg } = setup()
	msg('/input/2/mute', 1)
	await press(new MuteAction(conn), { row: 'input', channel: 2, operation: 'off' })
	assert.deepEqual(sent.at(-1), { address: '/input/2/mute', args: [0] })
	conn.stop()
})

for (const [name, Action, settings] of [
	['non-numeric channel', MuteAction, { row: 'input', channel: 'abc' }],
	['solo on the output row', SoloAction, { row: 'output', channel: 1 }],
]) {
	test(`${name} renders setup and sends nothing`, async () => {
		const { conn, sent } = setup()
		const before = sent.length
		assert.match(await press(new Action(conn), settings), /CHANNEL/)
		assert.equal(sent.length, before)
		conn.stop()
	})
}

test('48V on an input without phantom renders N/A and does not send', async () => {
	const { conn, sent, msg } = setup()
	msg('/input/1/48v', 0)
	// Capabilities discovered with no phantom channels: input 0 is unsupported.
	conn.controller.state.getDiscoveredCapabilities = () => ({ phantomChannels: [], inputGainChannels: [], instrumentChannels: [], padChannels: [], autosetChannels: [] })
	Object.defineProperty(conn.controller.state, 'hasGlobalDiscoveryData', { get: () => true })
	const action = new InputOptionAction(conn)
	const key = fakeKey({ row: 'input', channel: 0, option: 'phantom' })
	await action.onWillAppear(key.appear)
	await tick()
	assert.match(key.images.at(-1), /N\/A/)
	const before = sent.length
	await action.onKeyDown(key.press)
	assert.equal(sent.length, before)
	await action.onWillDisappear(key.appear)
	conn.stop()
})

test('group press sets the group', async () => {
	const { conn, sent, msg } = setup()
	msg('/mutegroup/2', 0)
	const action = new GroupAction(conn)
	const key = fakeKey({ type: 'mute', group: '2', operation: 'on' })
	await action.onWillAppear(key.appear)
	await action.onKeyDown(key.press)
	assert.deepEqual(sent.at(-1), { address: '/mutegroup/2', args: [1] })
	await action.onWillDisappear(key.appear)
	conn.stop()
})
