import assert from 'node:assert/strict'
import test from 'node:test'
import { TotalMixConnection } from '../dist/connection.js'

const settings = { host: '127.0.0.1', targetPort: 7001, feedbackPort: 9001, syncTimeoutMs: 50 }
const tick = () => new Promise((resolve) => setImmediate(resolve))

function setup() {
	const events = []
	const sent = []
	const transports = []
	const intervals = []
	let clock = 1000
	const conn = new TotalMixConnection({
		now: () => clock,
		setInterval: (fn, ms) => {
			intervals.push({ fn, ms })
			return undefined
		},
		createTransport: (_options, callbacks) => {
			const id = transports.length + 1
			transports.push(callbacks)
			return {
				start: () => events.push(`start#${id}`),
				close: () => events.push(`close#${id}`),
				send: async (address, ...args) => {
					sent.push({ address, args })
				},
			}
		},
	})
	const driver = (ms) => intervals.filter((i) => i.ms === ms).at(-1).fn
	return {
		conn,
		events,
		sent,
		transports,
		advance: (ms) => (clock += ms),
		monitor: () => driver(1000)(),
		sync: () => driver(250)(),
	}
}

test('start sends the Global OSC initial state request on listening', async () => {
	const { conn, sent, transports } = setup()
	conn.start(settings)
	assert.equal(conn.status, 'connecting')
	transports[0].onListening()
	await tick()
	assert.equal(sent[0].address, '/sendall')
	assert.deepEqual(sent[0].args, [2])
	conn.stop()
})

test('becomes connected on the first message', async () => {
	const { conn, transports } = setup()
	let changes = 0
	conn.start(settings)
	await tick()
	conn.onChange(() => changes++)
	transports[0].onMessage({ address: '/hello', args: [] })
	await tick()
	assert.equal(conn.status, 'connected')
	assert.equal(conn.online, true)
	assert.equal(changes, 1)
	conn.stop()
})

test('goes offline after 10 s without messages and back online on the next message', () => {
	const { conn, transports, advance, monitor } = setup()
	conn.start(settings)
	transports[0].onMessage({ address: '/hello', args: [] })
	advance(9000)
	monitor()
	assert.equal(conn.online, true)
	advance(1500)
	monitor()
	assert.equal(conn.online, false)
	transports[0].onMessage({ address: '/hello', args: [] })
	assert.equal(conn.online, true)
	conn.stop()
})

test('restart closes the old transport before starting the new one', () => {
	const { conn, events } = setup()
	conn.start(settings)
	conn.start(settings)
	assert.deepEqual(events, ['start#1', 'close#1', 'start#2'])
	conn.stop()
})

test('registered route is synced by the background loop', async () => {
	const { conn, sent, sync } = setup()
	conn.start(settings)
	conn.registerRoute({ bus: 'input', index: 1, output: 3 })
	sync()
	await tick()
	assert.ok(sent.some((m) => m.address === '/sendsubmix/3'))
	conn.stop()
})

test('callbacks from a replaced transport are ignored', () => {
	const { conn, transports } = setup()
	conn.start(settings)
	conn.start(settings)
	transports[0].onMessage({ address: '/hello', args: [] })
	assert.equal(conn.status, 'connecting')
	transports[0].onError(new Error('old'))
	assert.equal(conn.status, 'connecting')
	conn.stop()
})
