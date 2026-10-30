import assert from 'node:assert/strict'
import test from 'node:test'
import { TotalMixConnection } from '../dist/connection.js'
import {
	ChannelNameAction, ControlRoomAction, DuRecAction, DuRecChannelAction, LayoutAction, QuickWorkspaceAction, RoomEqAction,
	RoomEqParamAction, SaveSnapshotAction, SnapshotAction, UndoRedoAction, WindowAction,
} from '../dist/actions/global.js'

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

test('durec renders N/A without DURec capability and does not send', async () => {
	const { conn, sent, msg } = setup()
	msg('/input/0/gain', 10)
	conn.controller.state.getDiscoveredCapabilities = () => ({ duRec: false })
	Object.defineProperty(conn.controller.state, 'hasGlobalDiscoveryData', { get: () => true })
	const before = sent.length
	const image = await pressKey(DuRecAction, conn, { command: 'record' })
	assert.match(image, /N\/A/)
	assert.equal(sent.length, before)
	conn.stop()
})

test('durec shows the elapsed time while recording and sends record', async () => {
	const { conn, sent, msg } = setup()
	msg('/durec/state', 'Stop')
	msg('/durec/time', '00:01:23')
	const image = await pressKey(DuRecAction, conn, { command: 'record' })
	assert.deepEqual(sent.find((m) => m.address === '/durec/record'), { address: '/durec/record', args: [1] })
	assert.match(image, /RECORD/)
	conn.stop()
})

test('save-snapshot, layout, quick-workspace, window and undo-redo send their commands', async () => {
	const { conn, sent } = setup()
	await pressKey(SaveSnapshotAction, conn, { number: '4' })
	assert.deepEqual(sent.at(-1), { address: '/snapshot/save/4', args: [1] })
	await pressKey(LayoutAction, conn, { layout: '6' })
	assert.deepEqual(sent.at(-1), { address: '/layout/load/6', args: [1] })
	await pressKey(QuickWorkspaceAction, conn, { number: '12' })
	assert.deepEqual(sent.at(-1), { address: '/loadQuickWorkspace', args: [12] })
	await pressKey(WindowAction, conn, { window: 'hide' })
	assert.deepEqual(sent.at(-1), { address: '/showwindow', args: [0] })
	await pressKey(UndoRedoAction, conn, { command: 'redo' })
	assert.deepEqual(sent.at(-1), { address: '/redo', args: [1] })
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

test('durec-channel arms recordEnable', async () => {
	const { conn, sent, msg } = setup()
	msg('/durec/state', 'Stop')
	msg('/input/1/record', 0)
	await pressKey(DuRecChannelAction, conn, { row: 'input', channel: '1', operation: 'toggle' })
	assert.deepEqual(sent.at(-1), { address: '/input/1/record', args: [1] })
	conn.stop()
})

test('room-eq toggles enable and room-eq-param sends the value', async () => {
	const { conn, sent, msg } = setup()
	msg('/output/2/roomeq/enable', 0)
	await pressKey(RoomEqAction, conn, { channel: '2', side: 'left', operation: 'toggle' })
	assert.deepEqual(sent.at(-1), { address: '/output/2/roomeq/enable', args: [1] })
	await pressKey(RoomEqParamAction, conn, { channel: '2', side: 'left', parameter: 'reqGain3', value: '150' })
	assert.deepEqual(sent.at(-1), { address: '/output/2/roomeq/band3gain', args: [150] })
	conn.stop()
})

test('channel-name shows the current name and renames on press', async () => {
	const { conn, sent, msg } = setup()
	msg('/input/0/name', 'Mic')
	const image = await pressKey(ChannelNameAction, conn, { row: 'input', channel: '0', name: 'Vocals' })
	assert.match(firstImage, />Mic</)
	assert.deepEqual(sent.at(-1), { address: '/input/0/name', args: ['Vocals'] })
	conn.stop()
})

test('invalid settings render the setup hint and send nothing', async () => {
	for (const [Action, s] of [
		[SnapshotAction, { mode: 'recall', number: '9' }],
		[SaveSnapshotAction, {}],
		[LayoutAction, { layout: '7' }],
		[ControlRoomAction, { function: 'bogus' }],
		[ChannelNameAction, { row: 'input', channel: '0', name: '' }],
		[RoomEqParamAction, { channel: '0', side: 'left', parameter: 'reqGain3', value: '' }],
	]) {
		const { conn, sent } = setup()
		const image = await pressKey(Action, conn, s)
		assert.match(image, /SETUP|CHANNEL/)
		assert.equal(sent.length, 0)
		conn.stop()
	}
})
