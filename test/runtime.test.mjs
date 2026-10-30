import assert from 'node:assert/strict'
import test from 'node:test'
import { Redrawer, REDRAW_MS } from '../dist/runtime/redraw.js'
import { HoldRepeater } from '../dist/runtime/hold.js'

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
