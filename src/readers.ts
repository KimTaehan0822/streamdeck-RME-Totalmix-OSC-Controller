import type { TotalMixConnection } from './connection.js'
import type { MixerChannelTarget, SourceTarget } from './model/device-profile.js'
import type { PresetMixerTarget } from './model/preset-target.js'
import { detectDeviceProfile } from './model/profiles/index.js'
import type { RoomEqSide } from './protocol/controller.js'
import { dbToNormalized, formatDb, normalizedToDb } from './protocol/fader-curve.js'

export type MixTarget = PresetMixerTarget
export type CapabilityKind =
	'gain' | 'phantom' | 'instrument' | 'pad' | 'autoset' | 'duRec' | 'globalFx' | 'roomEq' | 'channelFx'

export function channelOf(t: MixTarget): MixerChannelTarget {
	return t.row === 'output' ? { bus: 'output', index: t.output } : { bus: t.row, index: t.source }
}

function routeOf(t: Exclude<MixTarget, { row: 'output' }>) {
	return { bus: t.row, index: t.source, output: t.destination }
}

export function channelName(c: TotalMixConnection, t: MixerChannelTarget): string {
	c.registerChannel(t)
	return c.controller.state.getChannel(t).name ?? ''
}

export function faderNormalized(c: TotalMixConnection, t: MixTarget): number | undefined {
	if (t.row === 'output') {
		c.registerOutput(t.output)
		return c.controller.state.getOutput(t.output).value
	}
	const route = routeOf(t)
	c.registerRoute(route)
	return c.controller.state.getRoute(route).value
}

export function faderDb(c: TotalMixConnection, t: MixTarget): string {
	let state
	if (t.row === 'output') {
		c.registerOutput(t.output)
		state = c.controller.state.getOutput(t.output)
	} else {
		const route = routeOf(t)
		c.registerRoute(route)
		state = c.controller.state.getRoute(route)
	}
	return state.value === undefined ? '' : state.display || formatDb(normalizedToDb(state.value))
}

function levelSideDb(c: TotalMixConnection, t: MixTarget, side: 'left' | 'right'): number | undefined {
	let channel = channelOf(t)
	// Global OSC sends one level per channel; a stereo pair's right side is the next index.
	if (side === 'right' && channelParameter<boolean>(c, channel, 'stereo') === true) {
		channel = { ...channel, index: channel.index + 1 }
	}
	c.registerChannel(channel)
	const state = c.controller.state.getChannel(channel).levelLeft
	if (state.display) {
		const parsed = Number.parseFloat(state.display.replace(',', '.'))
		if (Number.isFinite(parsed)) return parsed
	}
	return typeof state.value === 'number' ? state.value : undefined
}

export function levelNormalized(c: TotalMixConnection, t: MixTarget, side: 'left' | 'right'): number {
	const db = levelSideDb(c, t, side)
	return db === undefined ? 0 : dbToNormalized(db)
}

export function levelDb(c: TotalMixConnection, t: MixTarget): string {
	const dbs = [levelSideDb(c, t, 'left'), levelSideDb(c, t, 'right')].filter((db) => db !== undefined)
	return dbs.length === 0 ? '' : formatDb(Math.max(...dbs))
}

export function muted(c: TotalMixConnection, t: MixTarget): boolean {
	const channel = channelOf(t)
	if (t.row === 'output') return channelParameter<boolean>(c, channel, 'mute') === true
	c.registerChannel(channel)
	return c.controller.state.getChannel(channel).mute.value === true
}

export function soloed(c: TotalMixConnection, t: SourceTarget): boolean {
	c.registerChannel(t)
	return c.controller.state.getChannel(t).solo.value === true
}

export function gainText(c: TotalMixConnection, input: number): string {
	const target = { bus: 'input' as const, index: input }
	c.registerChannelParameter(target, 'gain')
	const state = c.controller.state.getChannelParameter<number>(target, 'gain')
	const value = state.display ?? state.value
	if (value === undefined) return ''
	const numeric = typeof value === 'number' ? value : Number.parseFloat(value)
	return Number.isFinite(numeric) ? numeric.toFixed(1) : String(value)
}

export function gainNormalized(c: TotalMixConnection, input: number): number | undefined {
	const target = { bus: 'input' as const, index: input }
	c.registerChannelParameter(target, 'gain')
	const state = c.controller.state.getChannelParameter<number>(target, 'gain')
	const device = c.controller.state.detectedDevice
	const configured = device ? detectDeviceProfile(device)?.capabilities.inputGainRanges?.[input] : undefined
	if (!configured || typeof state.value !== 'number') return undefined
	let range = configured
	if (configured.instrument && channelParameter<boolean>(c, target, 'instrument') === true) range = configured.instrument
	if (range.max <= range.min) return 0
	const normalized = Math.max(0, Math.min(1, (state.value - range.min) / (range.max - range.min)))
	return Math.round(normalized * 10_000) / 10_000
}

/** Pan as 0..1 (0 = left, 1 = right). */
export function panValue(c: TotalMixConnection, t: MixTarget): number | undefined {
	if (t.row === 'output') {
		c.registerOutput(t.output)
		return c.controller.state.getOutputPan(t.output).value
	}
	const route = routeOf(t)
	c.registerRoute(route)
	return c.controller.state.getRoutePan(route).value
}

export function panText(c: TotalMixConnection, t: MixTarget): string | number {
	const value = panValue(c, t)
	if (value === undefined) return ''
	const position = Math.round((value * 200 - 100) * 10) / 10
	if (position <= -100) return 'L'
	if (position >= 100) return 'R'
	return position === 0 ? 'C' : position
}

export function channelParameter<T extends number | boolean | string>(
	c: TotalMixConnection,
	t: MixerChannelTarget,
	parameter: string,
): T | undefined {
	c.registerChannelParameter(t, parameter)
	return c.controller.state.getChannelParameter<T>(t, parameter).value
}

export function globalParameter<T extends number | boolean | string>(
	c: TotalMixConnection,
	parameter: string,
): T | undefined {
	if (parameter.startsWith('group:')) c.registerGlobal('groups')
	else if (parameter === 'recordState' || parameter === 'recordTime') c.registerGlobal('duRec')
	else if (/^(reverb|echo)/.test(parameter)) c.registerGlobal('globalFx')
	else if (!parameter.startsWith('status:')) c.registerGlobal('controlRoom')
	return c.controller.state.getGlobalParameter<T>(parameter).value
}

export function activeSnapshot(c: TotalMixConnection): number | undefined {
	c.registerGlobal('snapshots')
	return c.controller.state.activeSnapshot
}

export function roomEqParameter<T extends number | boolean | string>(
	c: TotalMixConnection,
	output: number,
	side: RoomEqSide,
	parameter: string,
): T | undefined {
	c.registerRoomEq(output, side, parameter)
	return c.controller.state.getChannelParameter<T>({ bus: 'output', index: output }, `roomEq:${side}:${parameter}`).value
}

/** A known device profile is authoritative; discovery is the fallback for unknown devices (as in the Companion module). */
export function hasCapability(c: TotalMixConnection, kind: CapabilityKind, input?: number): boolean {
	const state = c.controller.state
	const profile = state.detectedDevice ? detectDeviceProfile(state.detectedDevice) : undefined
	const capabilities = profile?.capabilities ?? state.getDiscoveredCapabilities()
	switch (kind) {
		case 'gain':
			return capabilities.inputGainChannels.includes(input ?? -1)
		case 'phantom':
			return capabilities.phantomChannels.includes(input ?? -1)
		case 'instrument':
			return capabilities.instrumentChannels.includes(input ?? -1)
		case 'pad':
			return capabilities.padChannels.includes(input ?? -1)
		case 'autoset':
			return capabilities.autosetChannels.includes(input ?? -1)
		default:
			return capabilities[kind]
	}
}
