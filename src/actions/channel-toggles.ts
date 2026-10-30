import { action, type KeyDownEvent } from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import type { TotalMixConnection } from '../connection.js'
import type { MixerBus, MixerChannelTarget } from '../model/device-profile.js'
import type { BinaryOperation, GroupType, TotalMixController } from '../protocol/controller.js'
import { channelName, channelParameter, globalParameter, hasCapability, muted, soloed, type CapabilityKind } from '../readers.js'
import { renderToggleKey } from '../render/keys.js'
import { TotalMixAction, type RenderContext } from '../runtime/base-action.js'
import { ALL, BUS_NAME, channelOf, int, num, pick } from './common.js'

const ID = 'com.haeunga0822.rme-totalmix.'

/** What one configured key needs; spec() returning undefined means incomplete settings (setup hint). */
export interface Spec {
	title: () => string
	label: string
	color: string
	read: () => boolean
	press: (c: TotalMixController, op: BinaryOperation) => Promise<void>
	/** false renders N/A and ignores presses; it never gates registration. */
	supported?: () => boolean
}

export const RED = 'rgb(200,30,30)'
const AMBER = 'rgb(210,140,0)'
export const BLUE = 'rgb(0,100,200)'

const operation = (v: unknown): BinaryOperation => (v === 'on' || v === 'off' ? v : 'toggle')
export abstract class ToggleAction extends TotalMixAction<JsonObject> {
	protected abstract spec(s: JsonObject): Spec | undefined
	/** 'config' for keys without a channel. */
	protected readonly setupOverlay: 'setup' | 'config' = 'setup'
	/** Which hint an incomplete key shows; override when a key can be missing something other than its channel. */
	protected setupHint(_s: JsonObject): 'setup' | 'config' {
		return this.setupOverlay
	}

	/** Boolean channel parameter shown as a key; the press goes through setChannelOption. */
	protected option(t: MixerChannelTarget, parameter: string, label: string, color: string, supported?: () => boolean): Spec {
		const c = this.connection
		return {
			title: () => channelName(c, t) || `${BUS_NAME[t.bus]} ${t.index + 1}`,
			label,
			color,
			read: () => channelParameter<boolean>(c, t, parameter) === true,
			press: (ctl, op) => ctl.setChannelOption(t, parameter, op),
			supported,
		}
	}

	protected render(s: JsonObject, ctx: RenderContext): string {
		const spec = this.spec(s)
		if (!spec) return renderToggleKey({ title: '', on: false, onColor: '#000', overlay: this.setupHint(s) })
		const overlay = spec.supported && !spec.supported() ? 'unsupported' : ctx.overlay
		return renderToggleKey({ title: spec.title(), label: spec.label, on: spec.read(), onColor: spec.color, overlay })
	}

	protected register(s: JsonObject): void {
		const spec = this.spec(s)
		spec?.title()
		spec?.read()
	}

	override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
		const s = ev.payload.settings
		const spec = this.spec(s)
		if (!spec || spec.supported?.() === false) return
		await this.connection.run((ctl) => spec.press(ctl, operation(s.operation)))
	}
}

@action({ UUID: ID + 'mute' })
export class MuteAction extends ToggleAction {
	protected spec(s: JsonObject): Spec | undefined {
		const t = channelOf(s, ALL)
		if (!t) return undefined
		const spec = this.option(t, 'mute', 'MUTE', RED)
		if (t.bus === 'output') return spec
		const source = { bus: t.bus as 'input' | 'playback', index: t.index }
		// muted() ignores the destination for input/playback rows, so 0 is a placeholder.
		return {
			...spec,
			read: () => muted(this.connection, { row: source.bus, source: source.index, destination: 0 }),
			press: (ctl, op) => ctl.setMute(source, op),
		}
	}
}

@action({ UUID: ID + 'solo' })
export class SoloAction extends ToggleAction {
	protected spec(s: JsonObject): Spec | undefined {
		const t = channelOf(s, ['input', 'playback'])
		if (!t) return undefined
		const source = { bus: t.bus as 'input' | 'playback', index: t.index }
		return {
			...this.option(t, 'solo', 'SOLO', AMBER),
			read: () => soloed(this.connection, source),
			press: (ctl, op) => ctl.setSolo(source, op),
		}
	}
}

const INPUT_OPTIONS = { phantom: '48V', instrument: 'INST', pad: 'PAD', autoset: 'AUTOSET' }
@action({ UUID: ID + 'input-option' })
export class InputOptionAction extends ToggleAction {
	protected spec(s: JsonObject): Spec | undefined {
		const t = channelOf(s, ['input'])
		const option = pick(s.option, INPUT_OPTIONS)
		if (!t || !option) return undefined
		return this.option(t, option, INPUT_OPTIONS[option], BLUE, () => hasCapability(this.connection, option as CapabilityKind, t.index))
	}
}

const PROCESSING = { eqEnable: 'EQ', compexpEnable: 'COMP/EXP', lowcutEnable: 'LOW CUT', alevEnable: 'AUTO LEVEL' }
@action({ UUID: ID + 'processing' })
export class ProcessingAction extends ToggleAction {
	protected spec(s: JsonObject): Spec | undefined {
		const t = channelOf(s, ALL)
		const option = pick(s.option, PROCESSING)
		if (!t || !option) return undefined
		return this.option(t, option, PROCESSING[option], BLUE, () => hasCapability(this.connection, 'channelFx'))
	}
}

// Global OSC entries of the Companion channel_option list: label and the rows each applies to.
const CHANNEL_OPTIONS: Record<string, [label: string, rows: MixerBus[]]> = {
	mute: ['MUTE', ['output']],
	phase: ['PHASE', ALL],
	phaseRight: ['PHASE R', ALL],
	msProc: ['MS', ['input']],
	stereo: ['STEREO', ALL],
	cue: ['CUE', ['output']],
	talkbackSel: ['TALKBACK', ['output']],
	gainRight: ['GAIN R', ['input']],
	refLevel: ['REF LEVEL', ['input', 'output']],
	width: ['WIDTH', ALL],
}
/** Value options send a number instead of switching; the key lights while the state equals it. */
const VALUE_OPTIONS = new Set(['gainRight', 'refLevel', 'width'])

@action({ UUID: ID + 'channel-option' })
export class ChannelOptionAction extends ToggleAction {
	protected spec(s: JsonObject): Spec | undefined {
		const option = pick(s.option, CHANNEL_OPTIONS)
		if (!option) return undefined
		const [label, rows] = CHANNEL_OPTIONS[option]
		// The PI has no default row here (the valid rows depend on the option), so an unset row is not guessed.
		const t = s.row === undefined ? undefined : channelOf(s, rows)
		if (!t) return undefined
		const spec = this.option(t, option, label, BLUE, option === 'gainRight' ? () => hasCapability(this.connection, 'gain', t.index) : undefined)
		if (!VALUE_OPTIONS.has(option)) return spec
		const value = num(s.value)
		if (!Number.isFinite(value)) return undefined
		return {
			...spec,
			label: `${label} ${value}`,
			read: () => channelParameter<number | boolean | string>(this.connection, t, option) === value,
			press: (ctl) =>
				option === 'refLevel' ? ctl.setChannelParameterDirect(t, option, value) : ctl.setChannelParameterValue(t, option, value),
		}
	}
}

@action({ UUID: ID + 'loopback' })
export class LoopbackAction extends ToggleAction {
	protected spec(s: JsonObject): Spec | undefined {
		const index = int(s.channel, 0)
		return index === undefined ? undefined : this.option({ bus: 'output', index }, 'loopback', 'LOOPBACK', BLUE)
	}
}

const GROUP_TYPES: Record<GroupType, string> = { mute: 'MUTE GROUP', pfl: 'PFL GROUP', fader: 'FADER GROUP' }
@action({ UUID: ID + 'group' })
export class GroupAction extends ToggleAction {
	protected spec(s: JsonObject): Spec | undefined {
		const type = pick(s.type, GROUP_TYPES)
		const group = int(s.group, 1, 4)
		if (!type || group === undefined) return undefined
		return {
			title: () => `Group ${group}`,
			label: GROUP_TYPES[type],
			color: type === 'mute' ? RED : type === 'pfl' ? AMBER : BLUE,
			read: () => globalParameter<boolean>(this.connection, `group:${type}:${group}`) === true,
			press: (ctl, op) => ctl.setGroup(type, group, op),
		}
	}
}

export const channelToggleActions = (connection: TotalMixConnection) =>
	[MuteAction, SoloAction, InputOptionAction, ProcessingAction, ChannelOptionAction, LoopbackAction, GroupAction].map(
		(Action) => new Action(connection),
	)
