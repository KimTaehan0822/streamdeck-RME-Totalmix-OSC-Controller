import assert from 'node:assert/strict'
import test from 'node:test'
import { TotalMixConnection } from '../dist/connection.js'
import { ControlRoomAction, LayoutAction, SnapshotAction, WindowAction } from '../dist/actions/global.js'

const settings = { host: '127.0.0.1', targetPort: 7001, feedbackPort: 9001, syncTimeoutMs: 50 }
let firstImage
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

async function pressKey(Action, conn, s) {
	const images = []
	const action = {
		id: 'a1',
		isDial: () => false,
		isKey: () => true,
		isInMultiAction: () => false,
		setImage: async (image) => void images.push(decodeURIComponent(image)),
	}
	const ev = { action, payload: { settings: s } }
	const instance = new Action(conn)
	await instance.onWillAppear(ev)
	await wait()
	firstImage = images.at(-1)
	await instance.onKeyDown(ev)
	await wait()
	await instance.onWillDisappear(ev)
	return images.at(-1)
}

test('show-mode snapshot key displays the active snapshot and ignores presses', async () => {
	const { conn, sent, msg } = setup()
	msg('/snapshot/load/3', 2)
	const before = sent.length
	const image = await pressKey(SnapshotAction, conn, { mode: 'show' })
	assert.match(image, />3</)
	assert.match(image, /SNAPSHOT/)
	assert.equal(sent.length, before)
	conn.stop()
})

test('recall-mode key lit only when its snapshot is active', async () => {
	const { conn, sent, msg } = setup()
	msg('/snapshot/load/3', 2)
	await pressKey(SnapshotAction, conn, { mode: 'recall', number: '3' })
	assert.match(firstImage, /rgb\(0,65,72\)/)
	assert.deepEqual(sent.at(-1), { address: '/snapshot/load/3', args: [1] })
	await pressKey(SnapshotAction, conn, { mode: 'recall', number: '5' })
	assert.doesNotMatch(firstImage, /rgb\(0,65,72\)/)
	assert.deepEqual(sent.at(-1), { address: '/snapshot/load/5', args: [1] })
	conn.stop()
})

test('layout and window send their commands', async () => {
	const { conn, sent } = setup()
	await pressKey(LayoutAction, conn, { layout: '6' })
	assert.deepEqual(sent.at(-1), { address: '/layout/load/6', args: [1] })
	await pressKey(WindowAction, conn, { window: 'hide' })
	assert.deepEqual(sent.at(-1), { address: '/showwindow', args: [0] })
	conn.stop()
})

test('control-room toggles from the known state and is lit when on', async () => {
	const { conn, sent, msg } = setup()
	msg('/controlroom/dim', 1)
	await pressKey(ControlRoomAction, conn, { function: 'mainDim', operation: 'toggle' })
	assert.match(firstImage, /rgb\(0,100,200\)/)
	assert.deepEqual(sent.at(-1), { address: '/controlroom/dim', args: [0] })
	await pressKey(ControlRoomAction, conn, { function: 'recallMainVolume' })
	assert.deepEqual(sent.at(-1), { address: '/controlroom/recall', args: [1] })
	conn.stop()
})

test('invalid settings render the specific hint and send nothing', async () => {
	for (const [Action, s, hint] of [
		[SnapshotAction, { mode: 'recall', number: '9' }, 'SETUP'],
		[LayoutAction, { layout: '7' }, 'SETUP'],
		[ControlRoomAction, { function: 'bogus' }, 'SETUP'],
	]) {
		const { conn, sent } = setup()
		const image = await pressKey(Action, conn, s)
		assert.match(image, new RegExp(`>${hint}<`), `${Action.name} ${JSON.stringify(s)}`)
		if (hint === 'SETUP') assert.doesNotMatch(image, />CHANNEL</)
		assert.equal(sent.length, 0)
		conn.stop()
	}
})
