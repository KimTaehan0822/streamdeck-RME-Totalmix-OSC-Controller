import type { JsonObject } from '@elgato/utils'
import type { MixerBus, MixerChannelTarget } from '../model/device-profile.js'

export const BUS_NAME: Record<MixerBus, string> = { input: 'Input', playback: 'Playback', output: 'Output' }
export const ALL: MixerBus[] = ['input', 'playback', 'output']
// Settings come from the PI as strings (select values), so everything is parsed with Number().
export const num = (v: unknown): number => (v === '' || v === null || typeof v === 'boolean' ? NaN : Number(v))
export const int = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number | undefined => {
	const n = num(v)
	return Number.isInteger(n) && n >= min && n <= max ? n : undefined
}
/** The channel index is the datasource value as-is: 0-based, the same index the controller and state use. A row not saved yet is the PI default, the first allowed one. */
export const channelOf = (s: JsonObject, rows: MixerBus[]): MixerChannelTarget | undefined => {
	const bus = (s.row ?? rows[0]) as MixerBus
	const index = int(s.channel, 0)
	return rows.includes(bus) && index !== undefined ? { bus, index } : undefined
}
export const pick = <T extends string>(v: unknown, labels: Record<T, unknown>): T | undefined =>
	typeof v === 'string' && Object.hasOwn(labels, v) ? (v as T) : undefined
