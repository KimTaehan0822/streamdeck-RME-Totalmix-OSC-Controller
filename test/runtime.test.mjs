import assert from 'node:assert/strict'
import test from 'node:test'
import { Redrawer, REDRAW_MS } from '../dist/runtime/redraw.js'
import { HoldRepeater } from '../dist/runtime/hold.js'
import { channelItems, normalizeSettings } from '../dist/runtime/settings.js'

function fakeClock() {
	let t = 0
	const timers = []
	return {
		now: () => t,
		schedule: (fn, ms) => {
			const timer = { at: t + ms, fn }
			timers.push(timer)
			return timer
		},
		cancel: (timer) => timers.splice(timers.indexOf(timer) >>> 0, 1),
		advance(ms) {
			const end = t + ms
			for (;;) {
				timers.sort((a, b) => a.at - b.at)
				if (!timers.length || timers[0].at > end) break
				const timer = timers.shift()
				t = timer.at
				timer.fn()
			}
			t = end
		},
	}
}

test('Redrawer draws at most once per 40 ms and the last render wins', () => {
	const clock = fakeClock()
	const drawn = []
	const redrawer = new Redrawer(async (image) => void drawn.push(image), clock.now, clock.schedule)
	redrawer.request(() => 'a')
	redrawer.request(() => 'b')
	redrawer.request(() => 'c')
	assert.deepEqual(drawn, ['a'])
	clock.advance(REDRAW_MS - 1)
	assert.deepEqual(drawn, ['a'])
	clock.advance(1)
	assert.deepEqual(drawn, ['a', 'c'])
})

test('Redrawer skips identical images', () => {
	const clock = fakeClock()
	const drawn = []
	const redrawer = new Redrawer(async (image) => void drawn.push(image), clock.now, clock.schedule)
	redrawer.request(() => 'a')
	clock.advance(100)
	redrawer.request(() => 'a')
	clock.advance(100)
	assert.deepEqual(drawn, ['a'])
})

test('Redrawer draws nothing after dispose', () => {
	const clock = fakeClock()
	const drawn = []
	const redrawer = new Redrawer(async (image) => void drawn.push(image), clock.now, clock.schedule)
	redrawer.request(() => 'a')
	redrawer.request(() => 'b')
	redrawer.dispose()
	clock.advance(100)
	redrawer.request(() => 'c')
	assert.deepEqual(drawn, ['a'])
})

test('HoldRepeater steps at 0, 400, 550, 700 ms', () => {
	const clock = fakeClock()
	const steps = []
	new HoldRepeater(() => steps.push(clock.now()), 400, 150, clock.schedule, clock.cancel).start()
	clock.advance(700)
	assert.deepEqual(steps, [0, 400, 550, 700])
})

test('stop() on willDisappear ends repeating', () => {
	const clock = fakeClock()
	const steps = []
	const hold = new HoldRepeater(() => steps.push(clock.now()), 400, 150, clock.schedule, clock.cancel)
	hold.start()
	clock.advance(450)
	hold.stop()
	clock.advance(2000)
	assert.deepEqual(steps, [0, 400])
})

test('a throwing render neither throws nor blocks a later good render', () => {
	const clock = fakeClock()
	const drawn = []
	const redrawer = new Redrawer(async (image) => void drawn.push(image), clock.now, clock.schedule)
	const log = console.error
	console.error = () => {}
	try {
		assert.doesNotThrow(() =>
			redrawer.request(() => {
				throw new Error('boom')
			}),
		)
		redrawer.request(() => 'good')
		clock.advance(100)
	} finally {
		console.error = log
	}
	assert.deepEqual(drawn, ['good'])
})

test('a failed draw is retried with the same image', async () => {
	const clock = fakeClock()
	let calls = 0
	const redrawer = new Redrawer(
		async () => {
			if (++calls === 1) throw new Error('x')
		},
		clock.now,
		clock.schedule,
	)
	redrawer.request(() => 'a')
	await new Promise((r) => setImmediate(r))
	clock.advance(100)
	redrawer.request(() => 'a')
	assert.equal(calls, 2)
})

test('normalizeSettings falls back on bad ports and timeouts', () => {
	assert.deepEqual(normalizeSettings({}), { host: '127.0.0.1', targetPort: 7001, feedbackPort: 9001, syncTimeoutMs: 500 })
	const s = normalizeSettings({ host: 'h', targetPort: '70000', feedbackPort: '1.5', syncTimeoutMs: -3 })
	assert.deepEqual(s, { host: 'h', targetPort: 7001, feedbackPort: 9001, syncTimeoutMs: 500 })
	assert.equal(normalizeSettings({ targetPort: '8000' }).targetPort, 8000)
	assert.equal(normalizeSettings({ syncTimeoutMs: 99999 }).syncTimeoutMs, 3000)
})

test('channelItems rejects unknown bus and falls back to 1..48', () => {
	const none = { getDiscoveredChannels: () => [] }
	assert.deepEqual(channelItems(none, undefined), [])
	assert.deepEqual(channelItems(none, 'bogus'), [])
	const fallback = channelItems(none, 'input')
	assert.equal(fallback.length, 48)
	assert.deepEqual(fallback[0], { value: 0, label: 'Input 1' })
	assert.deepEqual(channelItems({ getDiscoveredChannels: () => [{ index: 3, label: 'Mic' }] }, 'output'), [{ value: 3, label: 'Mic' }])
})
