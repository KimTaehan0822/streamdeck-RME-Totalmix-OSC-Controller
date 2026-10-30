import { action, type DialDownEvent, type DialRotateEvent, type KeyDownEvent, type WillDisappearEvent } from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import type { TotalMixConnection } from '../connection.js'
import { channelName, channelParameter, gainNormalized, gainText, globalParameter, globalParameterText, hasCapability, levelBar, levelDb, muted } from '../readers.js'
import { renderVuStrip } from '../render/meter.js'
import { FADER_PEEK_MS, faderAdjustedRecently, markFaderAdjusted } from '../state/fader-peek.js'
import { renderValueKey, renderValueStrip } from '../render/keys.js'
import { TotalMixAction, type RenderContext } from '../runtime/base-action.js'
import { BLUE, ToggleAction, type Spec } from './channel-toggles.js'
import { BUS_NAME, int, num, pick } from './common.js'

const ID = 'com.haeunga0822.rme-totalmix.'
const MODES = { set: 1, step: 1 }
const SETUP_KEY = renderValueKey({ title: '', value: '', overlay: 'setup' })
const CONFIG_KEY = renderValueKey({ title: '', value: '', overlay: 'config' })
const CONFIG_STRIP = renderValueStrip({ title: '', value: '', overlay: 'config' })

// Global OSC value range of the Companion set_global_fx_parameter action; it has no per-parameter ranges.
const FX_MIN = -10000
const FX_MAX = 10000
const clampFx = (v: number) => Math.min(FX_MAX, Math.max(FX_MIN, v))

const FX_PARAMS = {
	reverbType: 'Reverb type',
	reverbPredelay: 'Reverb pre-delay',
	reverbLowcut: 'Reverb low cut',
	reverbHighcut: 'Reverb high cut',
	reverbRoomscale: 'Reverb room scale',
	reverbAttack: 'Reverb attack',
	reverbHold: 'Reverb hold',
	reverbRelease: 'Reverb release',
	reverbTime: 'Reverb time',
	reverbHighdamp: 'Reverb high damp',
	reverbSmooth: 'Reverb smoothness',
	reverbWidth: 'Reverb width',
	reverbVolume: 'Reverb volume',
	echoType: 'Echo type',
	echoDelaytime: 'Echo delay time',
	echoFeedback: 'Echo feedback',
	echoHighcut: 'Echo high cut',
	echoWidth: 'Echo width',
	echoVolume: 'Echo volume',
}

/** Step settings are strings from the PI; empty or invalid falls back to the default. */
const stepOf = (v: unknown, fallback: number): number => {
	const n = num(v)
	return Number.isFinite(n) ? n : fallback
}

const inputName = (c: TotalMixConnection, input: number) => channelName(c, { bus: 'input', index: input }) || `${BUS_NAME.input} ${input + 1}`

@action({ UUID: ID + 'gain' })
export class GainAction extends TotalMixAction<JsonObject> {
	protected render(s: JsonObject, ctx: RenderContext): string {
		const input = int(s.channel, 0)
		if (input === undefined) return SETUP_KEY
		const overlay = hasCapability(this.connection, 'gain', input) ? ctx.overlay : 'unsupported'
		return renderValueKey({ title: inputName(this.connection, input), value: gainText(this.connection, input), bar: gainNormalized(this.connection, input), overlay })
	}

	protected register(s: JsonObject): void {
		const input = int(s.channel, 0)
		if (input === undefined) return
		inputName(this.connection, input)
		gainText(this.connection, input)
	}

	override onKeyDown(ev: KeyDownEvent<JsonObject>): void {
		const s = ev.payload.settings
		const input = int(s.channel, 0)
		if (input === undefined || !hasCapability(this.connection, 'gain', input)) return
		const step = stepOf(s.step, 1)
		this.hold(ev.action, () => void this.connection.run((c) => c.adjustInputGain(input, step)))
	}
}

// What a Gain Dial press switches; AutoSet exists only on some interfaces, so Mute is the default.
const PRESS = { mute: 'MUTED', phantom: '48V', pad: 'PAD', instrument: 'INST', autoset: 'AUTOSET', none: '' }
type Press = keyof typeof PRESS
const pressOf = (s: JsonObject): Press => pick(s.press ?? 'mute', PRESS) ?? 'mute'
const inputMix = (input: number) => ({ row: 'input' as const, source: input, destination: 0 })

const GAIN_SETUP = renderVuStrip({ name: '', left: 0, right: 0, faderDb: '', levelDb: '', muted: false, peek: false, overlay: 'setup' })

/** Same strip as the VU Dial: input level bars, the gain position as the line, level dB left and gain right. */
@action({ UUID: ID + 'gain-dial' })
export class GainDialAction extends TotalMixAction<JsonObject> {
	/** One pending redraw per action id that brings MUTED back after a gain peek. */
	private readonly peekTimers = new Map<string, NodeJS.Timeout>()

	override onWillDisappear(ev: WillDisappearEvent<JsonObject>): void {
		clearTimeout(this.peekTimers.get(ev.action.id))
		this.peekTimers.delete(ev.action.id)
		super.onWillDisappear(ev)
	}

	protected render(s: JsonObject, ctx: RenderContext): string {
		const input = int(s.channel, 0)
		if (input === undefined) return GAIN_SETUP
		const c = this.connection
		const t = inputMix(input)
		const text = gainText(c, input)
		const press = pressOf(s)
		const isMuted = muted(c, t)
		// Mute shows as MUTED like the VU Dial; another press switch shows as a badge while on.
		const on =
			press !== 'mute' && press !== 'none' && hasCapability(c, press, input) &&
			channelParameter<boolean>(c, { bus: 'input', index: input }, press) === true
		const badge = on ? { text: PRESS[press], fill: 'rgb(40,140,255)' } : undefined
		return renderVuStrip({
			name: inputName(c, input),
			fader: gainNormalized(c, input),
			left: levelBar(c, t, 'left'),
			right: levelBar(c, t, 'right'),
			faderDb: text && `${text} dB`,
			levelDb: levelDb(c, t),
			muted: isMuted,
			peek: isMuted && faderAdjustedRecently(`gain:${input}`),
			badge,
			overlay: hasCapability(c, 'gain', input) ? ctx.overlay : 'unsupported',
		})
	}

	protected register(s: JsonObject): void {
		const input = int(s.channel, 0)
		if (input === undefined) return
		inputName(this.connection, input)
		gainText(this.connection, input)
		muted(this.connection, inputMix(input))
		levelDb(this.connection, inputMix(input))
	}

	override onDialRotate(ev: DialRotateEvent<JsonObject>): void {
		const input = int(ev.payload.settings.channel, 0)
		if (input === undefined || !ev.payload.ticks || !hasCapability(this.connection, 'gain', input)) return
		const amount = ev.payload.ticks * stepOf(ev.payload.settings.step, 1)
		void this.connection.run((c) => c.adjustInputGain(input, amount))
		// While muted, show the gain briefly, then redraw once more so MUTED returns.
		markFaderAdjusted(`gain:${input}`)
		const id = ev.action.id
		clearTimeout(this.peekTimers.get(id))
		const timer = setTimeout(() => this.refresh(id), FADER_PEEK_MS + 20)
		timer.unref()
		this.peekTimers.set(id, timer)
	}

	override async onDialDown(ev: DialDownEvent<JsonObject>): Promise<void> {
		const input = int(ev.payload.settings.channel, 0)
		const press = pressOf(ev.payload.settings)
		if (input === undefined || press === 'none') return
		const t = { bus: 'input' as const, index: input }
		if (press === 'mute') return this.connection.run((c) => c.setMute(t, 'toggle'))
		if (!hasCapability(this.connection, press, input)) return
		await this.connection.run((c) => c.setChannelOption(t, press, 'toggle'))
	}
}

const EFFECTS = { reverbEnable: 'REVERB', echoEnable: 'ECHO' }
@action({ UUID: ID + 'global-fx' })
export class GlobalFxAction extends ToggleAction {
	protected override readonly setupOverlay = 'config'
	protected spec(s: JsonObject): Spec | undefined {
		const effect = pick(s.effect, EFFECTS)
		if (!effect) return undefined
		return {
			title: () => EFFECTS[effect],
			label: 'FX',
			color: BLUE,
			read: () => globalParameter<boolean>(this.connection, effect) === true,
			press: (ctl, op) => ctl.setGlobalFxOption(effect, op),
			supported: () => hasCapability(this.connection, 'globalFx'),
		}
	}
}

@action({ UUID: ID + 'fx-param' })
export class FxParamAction extends TotalMixAction<JsonObject> {
	private valid(s: JsonObject) {
		const parameter = pick(s.parameter, FX_PARAMS)
		const mode = pick(s.mode, MODES)
		const value = num(s.value)
		return parameter && mode && Number.isFinite(value) ? { parameter, mode, value } : undefined
	}

	protected render(s: JsonObject, ctx: RenderContext): string {
		const v = this.valid(s)
		if (!v) return CONFIG_KEY
		const overlay = hasCapability(this.connection, 'globalFx') ? ctx.overlay : 'unsupported'
		return renderValueKey({ title: FX_PARAMS[v.parameter], value: globalParameterText(this.connection, v.parameter), overlay })
	}

	protected register(s: JsonObject): void {
		const v = this.valid(s)
		if (v) globalParameterText(this.connection, v.parameter)
	}

	override onKeyDown(ev: KeyDownEvent<JsonObject>): void {
		const v = this.valid(ev.payload.settings)
		if (!v || !hasCapability(this.connection, 'globalFx')) return
		const send = () => {
			let target = v.value
			if (v.mode === 'step') {
				const current = globalParameter<number>(this.connection, v.parameter)
				// Without a known current value there is nothing to add to.
				if (typeof current !== 'number') return
				target = current + v.value
			}
			void this.connection.run((c) => c.setGlobalFxParameter(v.parameter, clampFx(target)))
		}
		if (v.mode === 'set') send()
		else this.hold(ev.action, send)
	}
}

@action({ UUID: ID + 'fx-param-dial' })
export class FxParamDialAction extends TotalMixAction<JsonObject> {
	protected render(s: JsonObject, ctx: RenderContext): string {
		const parameter = pick(s.parameter, FX_PARAMS)
		if (!parameter) return CONFIG_STRIP
		const overlay = hasCapability(this.connection, 'globalFx') ? ctx.overlay : 'unsupported'
		return renderValueStrip({ title: FX_PARAMS[parameter], value: globalParameterText(this.connection, parameter), overlay })
	}

	protected register(s: JsonObject): void {
		const parameter = pick(s.parameter, FX_PARAMS)
		if (parameter) globalParameterText(this.connection, parameter)
	}

	override onDialRotate(ev: DialRotateEvent<JsonObject>): void {
		const s = ev.payload.settings
		const parameter = pick(s.parameter, FX_PARAMS)
		if (!parameter || !ev.payload.ticks || !hasCapability(this.connection, 'globalFx')) return
		const current = globalParameter<number>(this.connection, parameter)
		if (typeof current !== 'number') return
		const target = clampFx(current + ev.payload.ticks * stepOf(s.step, 1))
		void this.connection.run((c) => c.setGlobalFxParameter(parameter, target))
	}

	override async onDialDown(ev: DialDownEvent<JsonObject>): Promise<void> {
		const s = ev.payload.settings
		const parameter = pick(s.parameter, FX_PARAMS)
		const reset = num(s.reset)
		if (!parameter || !Number.isFinite(reset) || !hasCapability(this.connection, 'globalFx')) return
		await this.connection.run((c) => c.setGlobalFxParameter(parameter, clampFx(reset)))
	}
}

export const gainFxActions = (connection: TotalMixConnection) =>
	[GainAction, GainDialAction, GlobalFxAction, FxParamAction, FxParamDialAction].map((Action) => new Action(connection))
