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

test('durec shows state and time, lit while recording or playing', async () => {
	const { conn, sent, msg } = setup()
	msg('/durec/state', 'Stop')
	msg('/durec/time', '00:00:00')
	await pressKey(DuRecAction, conn, { command: 'record' })
	assert.match(firstImage, />Stop</)
	assert.doesNotMatch(firstImage, /fill="rgb\(200,30,30\)"/)
	assert.deepEqual(sent.find((m) => m.address === '/durec/record'), { address: '/durec/record', args: [1] })
	conn.stop()

	const rec = setup()
	rec.msg('/durec/state', 'Record')
	rec.msg('/durec/time', '00:01:23')
	await pressKey(DuRecAction, rec.conn, { command: 'recordStop' })
	assert.match(firstImage, />00:01:23</)
	assert.match(firstImage, /fill="rgb\(200,30,30\)"/)
	rec.conn.stop()

	const play = setup()
	play.msg('/durec/state', 'Play')
	play.msg('/durec/time', '00:02:00')
	await pressKey(DuRecAction, play.conn, { command: 'playPause' })
	assert.match(firstImage, />00:02:00</)
	assert.match(firstImage, /fill="rgb\(0,100,200\)"/)
	play.conn.stop()
})

test('durec-channel, room-eq and room-eq-param are lit when armed, on or equal', async () => {
	const RED = /fill="rgb\(200,30,30\)"/
	const BLUE = /fill="rgb\(0,100,200\)"/
	const a = setup()
	a.msg('/durec/state', 'Stop')
	a.msg('/input/1/record', 1)
	await pressKey(DuRecChannelAction, a.conn, { row: 'input', channel: '1', operation: 'off' })
	assert.match(firstImage, RED)
	a.conn.stop()
	const b = setup()
	b.msg('/durec/state', 'Stop')
	b.msg('/input/1/record', 0)
	await pressKey(DuRecChannelAction, b.conn, { row: 'input', channel: '1', operation: 'off' })
	assert.doesNotMatch(firstImage, RED)
	b.conn.stop()

	const c = setup()
	c.msg('/output/2/roomeq/enable', 1)
	await pressKey(RoomEqAction, c.conn, { channel: '2', side: 'left', operation: 'off' })
	assert.match(firstImage, BLUE)
	c.conn.stop()
	const d = setup()
	d.msg('/output/2/roomeq/enable', 0)
	await pressKey(RoomEqAction, d.conn, { channel: '2', side: 'left', operation: 'off' })
	assert.doesNotMatch(firstImage, BLUE)
	d.conn.stop()

	const e = setup()
	e.msg('/output/2/roomeq/band3gain', 150)
	await pressKey(RoomEqParamAction, e.conn, { channel: '2', side: 'left', parameter: 'reqGain3', value: '150' })
	assert.match(firstImage, BLUE)
	e.conn.stop()
	const f = setup()
	f.msg('/output/2/roomeq/band3gain', 100)
	await pressKey(RoomEqParamAction, f.conn, { channel: '2', side: 'left', parameter: 'reqGain3', value: '150' })
	assert.doesNotMatch(firstImage, BLUE)
	f.conn.stop()
})

test('room-eq keys without a saved side default to left', async () => {
	const { conn, sent } = setup()
	const image = await pressKey(RoomEqAction, conn, { channel: '2', operation: 'on' })
	assert.doesNotMatch(image, />SETUP</)
	assert.deepEqual(sent.filter((m) => m.address.includes('roomeq')), [{ address: '/output/2/roomeq/enable', args: [1] }])
	await pressKey(RoomEqParamAction, conn, { channel: '2', parameter: 'reqGain3', value: '150' })
	assert.deepEqual(sent.at(-1), { address: '/output/2/roomeq/band3gain', args: [150] })
	conn.stop()
})

test('room-eq side right targets output+1 and both sends to two outputs', async () => {
	const { conn, sent } = setup()
	await pressKey(RoomEqAction, conn, { channel: '2', side: 'right', operation: 'on' })
	assert.deepEqual(sent.filter((m) => m.address.includes('roomeq')), [{ address: '/output/3/roomeq/enable', args: [1] }])
	sent.length = 0
	await pressKey(RoomEqAction, conn, { channel: '2', side: 'both', operation: 'on' })
	assert.deepEqual(sent.filter((m) => m.address.includes('roomeq')), [
		{ address: '/output/2/roomeq/enable', args: [1] },
		{ address: '/output/3/roomeq/enable', args: [1] },
	])
	sent.length = 0
	await pressKey(RoomEqParamAction, conn, { channel: '2', side: 'right', parameter: 'reqGain3', value: '150' })
	assert.deepEqual(sent.at(-1), { address: '/output/3/roomeq/band3gain', args: [150] })
	assert.equal(typeof sent.at(-1).args[0], 'number')
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
	await pressKey(ChannelNameAction, conn, { row: 'input', channel: '0', name: 'Vocals' })
	assert.match(firstImage, />Mic</)
	assert.match(firstImage, />&gt; Vocals</)
	assert.deepEqual(sent.at(-1), { address: '/input/0/name', args: ['Vocals'] })
	conn.stop()
})

test('invalid settings render the specific hint and send nothing', async () => {
	for (const [Action, s, hint] of [
		[SnapshotAction, { mode: 'recall', number: '9' }, 'SETUP'],
		[SaveSnapshotAction, {}, 'SETUP'],
		[LayoutAction, { layout: '7' }, 'SETUP'],
		[ControlRoomAction, { function: 'bogus' }, 'SETUP'],
		[ChannelNameAction, { row: 'input', channel: '0', name: '' }, 'SETUP'],
		[ChannelNameAction, { row: 'input', name: 'x' }, 'CHANNEL'],
		[RoomEqParamAction, { channel: '0', side: 'left', parameter: 'reqGain3', value: '' }, 'SETUP'],
		[RoomEqAction, { side: 'left' }, 'CHANNEL'],
		[DuRecChannelAction, {}, 'CHANNEL'],
	]) {
		const { conn, sent } = setup()
		const image = await pressKey(Action, conn, s)
		assert.match(image, new RegExp(`>${hint}<`), `${Action.name} ${JSON.stringify(s)}`)
		if (hint === 'SETUP') assert.doesNotMatch(image, />CHANNEL</)
		assert.equal(sent.length, 0)
		conn.stop()
	}
})
