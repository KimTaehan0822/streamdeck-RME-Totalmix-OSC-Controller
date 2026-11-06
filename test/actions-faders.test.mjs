import assert from 'node:assert/strict'
import test from 'node:test'
import { TotalMixConnection } from '../dist/connection.js'
import { ButtonFaderAction, FaderAction, PanDialAction, VuDialAction } from '../dist/actions/faders.js'
import { dbToNormalized, normalizedToDb } from '../dist/protocol/fader-curve.js'

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
function fake(id, dial, s, multi = false) {
	const images = []
	const action = {
		id,
		isDial: () => dial,
		isKey: () => !dial,
		isInMultiAction: () => multi,
		setImage: async (image) => void images.push(decodeURIComponent(image)),
		setFeedback: async ({ canvas }) => void images.push(decodeURIComponent(canvas)),
		setFeedbackLayout: async () => {},
	}
	const ev = (payload = {}) => ({ action, payload: { settings: s, ...payload } })
	return { images, action, appear: ev(), ev }
}

test('vu-dial rotate of 3 ticks adjusts by +3 dB', async () => {
	const { conn, sent, msg } = setup()
	msg('/output/3/faderlin', 0.5)
	const dial = new VuDialAction(conn)
	const d = fake('d1', true, { row: 'output', channel: '3' })
	await dial.onWillAppear(d.appear)
	dial.onDialRotate(d.ev({ ticks: 3 }))
	await wait()
	const last = sent.filter((m) => m.address === '/output/3/faderlin').at(-1)
	assert.ok(Math.abs(last.args[0] - dbToNormalized(normalizedToDb(0.5) + 3)) < 1e-6)
	await dial.onWillDisappear(d.appear)
	conn.stop()
})

test('vu-dial step setting scales each tick (2 ticks x 0.5 dB = +1 dB)', async () => {
	const { conn, sent, msg } = setup()
	msg('/output/3/faderlin', 0.5)
	const dial = new VuDialAction(conn)
	const d = fake('d1', true, { row: 'output', channel: '3', step: '0.5' })
	await dial.onWillAppear(d.appear)
	dial.onDialRotate(d.ev({ ticks: 2 }))
	await wait()
	const last = sent.filter((m) => m.address === '/output/3/faderlin').at(-1)
	assert.ok(Math.abs(last.args[0] - dbToNormalized(normalizedToDb(0.5) + 1)) < 1e-6)
	await dial.onWillDisappear(d.appear)
	conn.stop()
})

test('display name replaces the channel name on the dial and fader keys; blank keeps it', async () => {
	const { conn, msg } = setup()
	msg('/output/3/name', 'Monitors')
	for (const [Action, dial, extra] of [[VuDialAction, true, {}], [ButtonFaderAction, false, { role: 'left' }], [FaderAction, false, { mode: 'step', value: '1' }]]) {
		const action = new Action(conn)
		const named = fake('n1', dial, { row: 'output', channel: 3, displayName: ' My Mix ', ...extra })
		await action.onWillAppear(named.appear)
		await wait()
		assert.match(named.images.at(-1), />My Mix</)
		if (Action === FaderAction) assert.match(named.images.at(-1), /height="6" fill="url\(#g\)"/)
		await action.onWillDisappear(named.appear)
		const blank = fake('n2', dial, { row: 'output', channel: 3, displayName: ' ', ...extra })
		await action.onWillAppear(blank.appear)
		await wait()
		assert.match(blank.images.at(-1), />Monitors</)
		await action.onWillDisappear(blank.appear)
	}
	conn.stop()
})

test('vu-dial press mutes, touch tap does nothing when touchMute is off', async () => {
	const { conn, sent, msg } = setup()
	msg('/output/3/mute', 0)
	const dial = new VuDialAction(conn)
	const off = fake('d1', true, { row: 'output', channel: 3, touchMute: false })
	await dial.onWillAppear(off.appear)
	await dial.onTouchTap(off.ev({ tapPos: [1, 1], hold: false }))
	assert.equal(sent.filter((m) => m.address.endsWith('/mute')).length, 0)
	const on = fake('d1', true, { row: 'output', channel: 3 })
	await dial.onTouchTap(on.ev({ tapPos: [1, 1], hold: false }))
	assert.deepEqual(sent.at(-1), { address: '/output/3/mute', args: [1] })
	await dial.onDialDown(on.ev())
	await dial.onDialUp(on.ev())
	assert.equal(sent.filter((m) => m.address === '/output/3/mute').length, 2)
	await dial.onWillDisappear(on.appear)
	conn.stop()
})

/** VU dial on output 3 (fader 0.5, unmuted) with the given extra settings. */
async function heldDial(extra) {
	const ctx = setup()
	ctx.msg('/output/3/faderlin', 0.5)
	ctx.msg('/output/3/mute', 0)
	const dial = new VuDialAction(ctx.conn)
	const d = fake('d1', true, { row: 'output', channel: 3, ...extra })
	await dial.onWillAppear(d.appear)
	const mutes = () => ctx.sent.filter((m) => m.address === '/output/3/mute')
	const faders = () => ctx.sent.filter((m) => m.address === '/output/3/faderlin')
	const done = async () => {
		await dial.onWillDisappear(d.appear)
		ctx.conn.stop()
	}
	return { ...ctx, dial, d, mutes, faders, done }
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)

test('vu-dial press acts on release, not when turned while held', async () => {
	const { dial, d, mutes, done } = await heldDial({})
	await dial.onDialDown(d.ev())
	assert.equal(mutes().length, 0)
	await dial.onDialUp(d.ev())
	assert.deepEqual(mutes(), [{ address: '/output/3/mute', args: [1] }])
	await dial.onDialDown(d.ev())
	dial.onDialRotate(d.ev({ ticks: 1, pressed: true }))
	await dial.onDialUp(d.ev())
	await wait()
	assert.equal(mutes().length, 1)
	await done()
})

test('vu-dial press recall sets the chosen dB; a bad value sends nothing', async () => {
	const ok = await heldDial({ pressAction: 'recall', pressDb: '-20' })
	await ok.dial.onDialDown(ok.d.ev())
	await ok.dial.onDialUp(ok.d.ev())
	await wait()
	near(ok.faders().at(-1).args[0], dbToNormalized(-20))
	assert.equal(ok.mutes().length, 0)
	await ok.done()
	// a blank-looking value must not jump the fader to 0 dB
	for (const pressDb of ['abc', ' ']) {
		const bad = await heldDial({ pressAction: 'recall', pressDb })
		await bad.dial.onDialDown(bad.d.ev())
		await bad.dial.onDialUp(bad.d.ev())
		await wait()
		assert.equal(bad.faders().length + bad.mutes().length, 0, JSON.stringify(pressDb))
		await bad.done()
	}
})

test('vu-dial pressed turns run the left and right actions once per hold', async () => {
	const { dial, d, mutes, faders, done } = await heldDial({ leftAction: 'muteOn', rightAction: 'recall', rightDb: '0' })
	await dial.onDialDown(d.ev())
	for (const ticks of [-1, -1, 2, 2]) dial.onDialRotate(d.ev({ ticks, pressed: true }))
	await dial.onDialUp(d.ev())
	await wait()
	assert.deepEqual(mutes(), [{ address: '/output/3/mute', args: [1] }])
	assert.equal(faders().length, 1)
	near(faders()[0].args[0], dbToNormalized(0))
	await done()
	// muteOn again would send nothing (mute is already on), so a toggle shows each new hold fires again
	const again = await heldDial({ leftAction: 'muteToggle' })
	for (let i = 0; i < 2; i++) {
		await again.dial.onDialDown(again.d.ev())
		again.dial.onDialRotate(again.d.ev({ ticks: -1, pressed: true }))
		again.dial.onDialRotate(again.d.ev({ ticks: -1, pressed: true }))
		await again.dial.onDialUp(again.d.ev())
		await wait()
	}
	assert.deepEqual(again.mutes().map((m) => m.args[0]), [1, 0])
	await again.done()
})

test('vu-dial pressed turn steps by default on every tick', async () => {
	const { dial, d, mutes, faders, done } = await heldDial({ step: '1' })
	await dial.onDialDown(d.ev())
	dial.onDialRotate(d.ev({ ticks: 2, pressed: true }))
	await wait()
	near(faders().at(-1).args[0], dbToNormalized(normalizedToDb(0.5) + 2))
	await dial.onDialUp(d.ev())
	await wait()
	assert.equal(mutes().length, 0)
	await done()
})

test('vu-dial hold state does not survive the dial disappearing', async () => {
	const { dial, d, mutes, done } = await heldDial({})
	await dial.onDialDown(d.ev())
	dial.onDialRotate(d.ev({ ticks: 1, pressed: true }))
	await dial.onWillDisappear(d.appear)
	await dial.onWillAppear(d.appear)
	await dial.onDialUp(d.ev())
	await dial.onDialDown(d.ev())
	await dial.onDialUp(d.ev())
	await wait()
	assert.equal(mutes().length, 1)
	await done()
})

test('two instances with different targets render independently', async () => {
	const { conn, msg } = setup()
	msg('/output/1/name', 'Alpha')
	msg('/output/2/name', 'Bravo')
	const dial = new VuDialAction(conn)
	const a = fake('a', true, { row: 'output', channel: 1 })
	const b = fake('b', true, { row: 'output', channel: 2 })
	await dial.onWillAppear(a.appear)
	await dial.onWillAppear(b.appear)
	await wait()
	assert.match(a.images.at(-1), /Alpha/)
	assert.doesNotMatch(a.images.at(-1), /Bravo/)
	assert.match(b.images.at(-1), /Bravo/)
	await dial.onWillDisappear(a.appear)
	await dial.onWillDisappear(b.appear)
	conn.stop()
})

test('button-fader key-up stops repeating; bottom lowers, top raises', async () => {
	const { conn, sent, msg } = setup()
	msg('/output/3/faderlin', 0.5)
	const count = () => sent.filter((m) => m.address === '/output/3/faderlin').length
	const key = new ButtonFaderAction(conn)
	const k = fake('k1', false, { row: 'output', channel: 3, role: 'bottom' })
	await key.onWillAppear(k.appear)
	key.onKeyDown(k.ev())
	await wait(550) // first step plus at least one repeat (400 ms delay)
	assert.ok(count() >= 2)
	assert.ok(sent.at(-1).args[0] < 0.5)
	key.onKeyUp(k.ev())
	const after = count()
	await wait(400)
	assert.equal(count(), after)
	await key.onWillDisappear(k.appear)
	conn.stop()
})

test('button-fader inside a multi-action steps once and does not repeat', async () => {
	const { conn, sent, msg } = setup()
	msg('/output/3/faderlin', 0.5)
	const count = () => sent.filter((m) => m.address === '/output/3/faderlin').length
	const key = new ButtonFaderAction(conn)
	const k = fake('k1', false, { row: 'output', channel: 3, role: 'bottom' }, true)
	await key.onWillAppear(k.appear)
	const before = count()
	key.onKeyDown(k.ev())
	await wait(600)
	assert.equal(count(), before + 1)
	await key.onWillDisappear(k.appear)
	conn.stop()
})

test('button-fader step setting sets the dB per press (bottom, 2 dB = -2 dB)', async () => {
	const { conn, sent, msg } = setup()
	msg('/output/3/faderlin', 0.5)
	const key = new ButtonFaderAction(conn)
	const k = fake('k1', false, { row: 'output', channel: 3, role: 'bottom', step: '2' }, true)
	await key.onWillAppear(k.appear)
	key.onKeyDown(k.ev())
	await wait()
	const last = sent.filter((m) => m.address === '/output/3/faderlin').at(-1)
	assert.ok(Math.abs(last.args[0] - dbToNormalized(normalizedToDb(0.5) - 2)) < 1e-6)
	await key.onWillDisappear(k.appear)
	conn.stop()
})

test('valid channel with a missing role or destination shows SETUP, a missing channel shows CHANNEL', async () => {
	const { conn } = setup()
	for (const [Action, dial, s, hint] of [
		[ButtonFaderAction, false, { row: 'output', channel: 1, role: 'middle' }, 'SETUP'],
		[VuDialAction, true, { row: 'input', channel: 1 }, 'SETUP'],
		[ButtonFaderAction, false, { row: 'output', role: 'top' }, 'CHANNEL'],
	]) {
		const f = fake('x', dial, s)
		const action = new Action(conn)
		await action.onWillAppear(f.appear)
		await wait()
		assert.match(f.images.at(-1), new RegExp(`>${hint}<`))
		await action.onWillDisappear(f.appear)
	}
	conn.stop()
})

test('incomplete or invalid settings render setup and send nothing', async () => {
	const { conn, sent } = setup()
	for (const [Action, dial, s, hint] of [
		[VuDialAction, true, {}, 'CHANNEL'],
		[ButtonFaderAction, false, { row: 'output', channel: 1, role: 'middle' }, 'SETUP'],
		[FaderAction, false, { row: 'output', channel: 1, mode: 'set', value: 'abc' }, 'CHANNEL'],
		[FaderAction, false, { row: 'input', channel: 1, mode: 'set', value: 0 }, 'CHANNEL'], // no destination
		[PanDialAction, true, { row: 'output' }, 'CHANNEL'],
	]) {
		const action = new Action(conn)
		const f = fake('x', dial, s)
		await action.onWillAppear(f.appear)
		await wait()
		assert.match(f.images.at(-1), new RegExp(`${hint}`))
		action.onKeyDown?.(f.ev())
		action.onDialRotate?.(f.ev({ ticks: 1 }))
		await action.onDialDown?.(f.ev())
		await action.onDialUp?.(f.ev())
		await action.onWillDisappear(f.appear)
	}
	await wait()
	assert.equal(sent.length, 0)
	conn.stop()
})

test('fader key sets in dB and linear units', async () => {
	const { conn, sent, msg } = setup()
	msg('/mix/in/1/2/faderlin', 0.5)
	const key = new FaderAction(conn)
	const db = fake('k', false, { row: 'input', channel: 1, destination: 2, mode: 'set', unit: 'db', value: '-10' })
	await key.onWillAppear(db.appear)
	key.onKeyDown(db.ev())
	await wait()
	assert.deepEqual(sent.at(-1), { address: '/mix/in/1/2/faderlin', args: [dbToNormalized(-10)] })
	const lin = fake('k', false, { row: 'input', channel: 1, destination: 2, mode: 'set', unit: 'linear', value: '0.25' })
	key.onKeyDown(lin.ev())
	await wait()
	assert.deepEqual(sent.at(-1), { address: '/mix/in/1/2/faderlin', args: [0.25] })
	await key.onWillDisappear(db.appear)
	conn.stop()
})

test('pan-dial press centres the pan', async () => {
	const { conn, sent, msg } = setup()
	msg('/output/3/balpan', 0.8)
	const dial = new PanDialAction(conn)
	const d = fake('p', true, { row: 'output', channel: 3 })
	await dial.onWillAppear(d.appear)
	await dial.onDialDown(d.ev())
	assert.deepEqual(sent.at(-1), { address: '/output/3/balpan', args: [0] })
	const before = sent.length
	dial.onDialRotate(d.ev({ ticks: 2 }))
	await wait()
	assert.equal(sent.length, before + 1)
	// centred by the press; two default steps of 5 are 10 pan units = +0.1 on the -1..1 wire scale
	assert.ok(Math.abs(sent.at(-1).args[0] - 0.1) < 1e-6)
	await dial.onWillDisappear(d.appear)
	conn.stop()
})

test('two button faders with different channels and roles render independently', async () => {
	const { conn, msg } = setup()
	msg('/output/1/name', 'Alpha')
	msg('/output/2/name', 'Bravo')
	const key = new ButtonFaderAction(conn)
	const a = fake('a', false, { row: 'output', channel: 1, role: 'top' })
	const b = fake('b', false, { row: 'output', channel: 2, role: 'bottom' })
	await key.onWillAppear(a.appear)
	await key.onWillAppear(b.appear)
	await wait()
	assert.match(a.images.at(-1), /Alpha/)
	assert.doesNotMatch(a.images.at(-1), /Bravo/)
	assert.doesNotMatch(b.images.at(-1), /Alpha/)
	assert.notEqual(a.images.at(-1), b.images.at(-1))
	await key.onWillDisappear(a.appear)
	await key.onWillDisappear(b.appear)
	conn.stop()
})
