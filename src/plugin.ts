import streamDeck, { type SingletonAction } from '@elgato/streamdeck'
import { TotalMixConnection, type ConnectionSettings } from './connection.js'
import type { MixerBus } from './model/device-profile.js'

export const connection = new TotalMixConnection()

// Tasks 7-10 append their actions here (and their manifest entries).
export const actions: SingletonAction[] = []

type RawSettings = Partial<Record<keyof ConnectionSettings, unknown>>

// Defaults and limits copied from the Companion module's normalizeConfig.
function normalizeSettings(raw: RawSettings): ConnectionSettings {
	return {
		host: String(raw.host || '127.0.0.1'),
		targetPort: Number(raw.targetPort) || 7001,
		feedbackPort: Number(raw.feedbackPort) || 9001,
		syncTimeoutMs: Math.max(100, Math.min(3000, Number(raw.syncTimeoutMs) || 500)),
	}
}

let current: ConnectionSettings | undefined
function apply(raw: RawSettings): void {
	const next = normalizeSettings(raw)
	if (current && JSON.stringify(current) === JSON.stringify(next)) return
	current = next
	connection.start(next)
}

// Dropdowns use <sdpi-select datasource="getChannels:input">; the part after ':' (or payload.bus) is the bus.
streamDeck.ui.onSendToPlugin((ev) => {
	const payload = ev.payload as { event?: unknown; bus?: unknown } | null
	if (typeof payload?.event !== 'string' || !payload.event.startsWith('getChannels')) return
	const bus = (payload.bus ?? payload.event.split(':')[1]) as MixerBus
	const items = connection.controller.state
		.getDiscoveredChannels(bus)
		.map((channel) => ({ value: channel.index, label: channel.label }))
	void streamDeck.ui.sendToPropertyInspector({ event: payload.event, items })
})

streamDeck.settings.onDidReceiveGlobalSettings((ev) => apply(ev.settings))
for (const action of actions) streamDeck.actions.registerAction(action)
await streamDeck.connect()
apply(await streamDeck.settings.getGlobalSettings())
