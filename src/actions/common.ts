import type { JsonObject } from '@elgato/utils'
import type { MixerBus, MixerChannelTarget } from '../model/device-profile.js'

export const BUS_NAME: Record<MixerBus, string> = { input: 'Input', playback: 'Playback', output: 'Output' }
export const ALL: MixerBus[] = ['input', 'playback', 'output']
// Settings come from the PI as strings (select values), so everything is parsed with Number().
// A blank or space-only field is "no value": Number(' ') is 0, which would jump a fader to 0 dB.
export const num = (v: unknown): number => ((typeof v === 'string' && v.trim() === '') || v === null || typeof v === 'boolean' ? NaN : Number(v))
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
/** Alternate mode: at value 2 (within tolerance) go to value 1, otherwise (unknown current included) to value 2. */
export function alternateNext(current: number | undefined, value1: number, value2: number, tolerance: number): { target: number; atValue2: boolean } {
	const atValue2 = current !== undefined && Math.abs(current - value2) <= tolerance
	return { target: atValue2 ? value1 : value2, atValue2 }
}
export const pick =<T extends string>(v: unknown, labels: Record<T, unknown>): T | undefined =>
	typeof v === 'string' && Object.hasOwn(labels, v) ? (v as T) : undefined
