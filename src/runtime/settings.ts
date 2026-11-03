import type { ConnectionSettings } from '../connection.js'
import type { ChannelDefinition, MixerBus } from '../model/device-profile.js'
import { detectDeviceProfile } from '../model/profiles/index.js'

type RawSettings = Partial<Record<keyof ConnectionSettings, unknown>>

const port = (value: unknown, fallback: number): number => {
	const n = Number(value)
	return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : fallback
}

// Defaults and limits copied from the Companion module normalizeConfig; bad input falls back so a typo cannot crash bind().
export function normalizeSettings(raw: RawSettings): ConnectionSettings {
	const timeout = Number(raw.syncTimeoutMs)
	return {
		host: String(raw.host || '127.0.0.1'),
		targetPort: port(raw.targetPort, 7001),
		feedbackPort: port(raw.feedbackPort, 9001),
		syncTimeoutMs: timeout > 0 ? Math.max(100, Math.min(3000, timeout)) : 500,
	}
}

const BUS_LABEL = { input: 'Input', playback: 'Playback', output: 'Output' } as const
const PROFILE_LIST = { input: 'inputs', playback: 'playbacks', output: 'outputs' } as const

/** Dropdown items for a bus; unknown bus gives none, no discovered channels gives 1..48 so actions can be set up offline. */
export function channelItems(
	state: {
		getDiscoveredChannels(bus: MixerBus): ChannelDefinition[]
		getHiddenChannels?(bus: MixerBus, profileChannels: ChannelDefinition[]): ChannelDefinition[]
		detectedDevice?: string
	},
	bus: unknown,
	showHidden = false,
): { value: number; label: string }[] {
	if (bus !== 'input' && bus !== 'playback' && bus !== 'output') return []
	const found = state.getDiscoveredChannels(bus)
	if (found.length) {
		const items = found.map((c) => ({ value: c.index, label: c.label }))
		const profile = showHidden && state.detectedDevice ? detectDeviceProfile(state.detectedDevice) : undefined
		if (!profile || !state.getHiddenChannels) return items
		const hidden = state.getHiddenChannels(bus, profile[PROFILE_LIST[bus]]).map((c) => ({ value: c.index, label: `${c.label} (hidden)` }))
		return [...items, ...hidden].sort((a, b) => a.value - b.value)
	}
	return Array.from({ length: 48 }, (_, i) => ({ value: i, label: `${BUS_LABEL[bus]} ${i + 1}` }))
}
