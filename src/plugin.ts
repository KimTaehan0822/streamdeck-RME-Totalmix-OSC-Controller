import streamDeck, { type SingletonAction } from '@elgato/streamdeck'
import { TotalMixConnection, type ConnectionSettings } from './connection.js'
import { channelToggleActions } from './actions/channel-toggles.js'
import { faderActions } from './actions/faders.js'
import { gainFxActions } from './actions/gain-fx.js'
import { globalActions } from './actions/global.js'
import { channelItems, normalizeSettings } from './runtime/settings.js'

export const connection = new TotalMixConnection()

// Every action group is listed here (and in the manifest).
export const actions: SingletonAction[] = [...channelToggleActions(connection), ...faderActions(connection), ...gainFxActions(connection), ...globalActions(connection)]

let current: ConnectionSettings | undefined
function apply(raw: Parameters<typeof normalizeSettings>[0]): void {
	const next = normalizeSettings(raw)
	if (current && JSON.stringify(current) === JSON.stringify(next)) return
	current = next
	connection.start(next)
}

// Dropdowns use <sdpi-select hot-reload datasource="getChannels:input">; the part after ':' (or payload.bus) is the bus.
// The list is re-pushed whenever it changes (e.g. TotalMix connects), which hot-reload picks up.
const requested = new Map<string, string>()
function pushChannels(event: string, bus: unknown, force = false): void {
	const items = channelItems(connection.controller.state, bus)
	const json = JSON.stringify(items)
	if (!force && requested.get(event) === json) return
	requested.set(event, json)
	streamDeck.ui.sendToPropertyInspector({ event, items }).catch(() => {})
}
streamDeck.ui.onSendToPlugin((ev) => {
	const payload = ev.payload as { event?: unknown; bus?: unknown } | null
	if (typeof payload?.event !== 'string' || !payload.event.startsWith('getChannels')) return
	pushChannels(payload.event, payload.bus ?? payload.event.split(':')[1], true)
})
connection.onChange(() => {
	for (const event of requested.keys()) pushChannels(event, event.split(':')[1])
})

// Wait for typing to settle so each keystroke does not restart the connection.
let debounce: NodeJS.Timeout | undefined
streamDeck.settings.onDidReceiveGlobalSettings((ev) => {
	clearTimeout(debounce)
	debounce = setTimeout(() => apply(ev.settings), 500)
})
for (const action of actions) streamDeck.actions.registerAction(action)
await streamDeck.connect()
apply(await streamDeck.settings.getGlobalSettings())
