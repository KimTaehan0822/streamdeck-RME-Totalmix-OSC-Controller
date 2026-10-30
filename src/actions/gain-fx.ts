import { action, type DialDownEvent, type DialRotateEvent, type KeyDownEvent, type KeyUpEvent } from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import type { TotalMixConnection } from '../connection.js'
import { channelName, channelParameter, gainNormalized, gainText, globalParameter, globalParameterText, hasCapability } from '../readers.js'
import { renderValueKey, renderValueStrip } from '../render/keys.js'
import { TotalMixAction, type RenderContext } from '../runtime/base-action.js'
import { HoldRepeater } from '../runtime/hold.js'
import { BLUE, ToggleAction, type Spec } from './channel-toggles.js'
import { ALL, BUS_NAME, channelOf, int, num, pick } from './common.js'

const ID = 'com.haeunga0822.rme-totalmix.'
const MODES = { set: 1, step: 1 }
const SETUP_KEY = renderValueKey({ title: '', value: '', overlay: 'setup' })
const SETUP_STRIP = renderValueStrip({ title: '', value: '', overlay: 'setup' })

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

const PROCESSING_PARAMS = {
	reverbSend: 'Reverb Send',
	reverbReturn: 'Reverb Return',
	lowcutGrade: 'Low Cut grade',
	lowcutFreq: 'Low Cut frequency',
	eqType1: 'EQ band 1 type',
	eqGain1: 'EQ band 1 gain',
	eqFreq1: 'EQ band 1 frequency',
	eqQ1: 'EQ band 1 Q',
	eqGain2: 'EQ band 2 gain',
	eqFreq2: 'EQ band 2 frequency',
	eqQ2: 'EQ band 2 Q',
	eqType3: 'EQ band 3 type',
	eqGain3: 'EQ band 3 gain',
	eqFreq3: 'EQ band 3 frequency',
	eqQ3: 'EQ band 3 Q',
	compexpGain: 'Dynamics make-up gain',
	compexpAttack: 'Compressor attack',
	compexpRelease: 'Compressor release',
	compTrsh: 'Compressor threshold',
	compRatio: 'Compressor ratio',
	expTrsh: 'Expander threshold',
	expRatio: 'Expander ratio',
	alevMaxgain: 'Auto Level maximum gain',
	alevHeadroom: 'Auto Level headroom',
	alevRisetime: 'Auto Level rise time',
}

/** Step settings are strings from the PI; empty or invalid falls back to the default. */
const stepOf = (v: unknown, fallback: number): number => {
	const n = num(v)
	return Number.isFinite(n) ? n : fallback
}

abstract class KeyAction extends TotalMixAction<JsonObject> {
	/** Steps once now and keeps repeating until key-up or the action disappears. */
	protected hold(id: string, step: () => void): void {
		this.holds.get(id)?.stop()
		const repeater = new HoldRepeater(step)
		this.holds.set(id, repeater)
		repeater.start()
	}

	override onKeyUp(ev: KeyUpEvent<JsonObject>): void {
		this.holds.get(ev.action.id)?.stop()
	}
}

const inputName = (c: TotalMixConnection, input: number) => channelName(c, { bus: 'input', index: input }) || `${BUS_NAME.input} ${input + 1}`

@action({ UUID: ID + 'gain' })
export class GainAction extends KeyAction {
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
		this.hold(ev.action.id, () => void this.connection.run((c) => c.adjustInputGain(input, step)))
	}
}

@action({ UUID: ID + 'gain-dial' })
export class GainDialAction extends TotalMixAction<JsonObject> {
	protected render(s: JsonObject, ctx: RenderContext): string {
		const input = int(s.channel, 0)
		if (input === undefined) return SETUP_STRIP
		const c = this.connection
		const text = gainText(c, input)
		return renderValueStrip({
			title: inputName(c, input),
			value: text && `${text} dB`,
			bar: gainNormalized(c, input),
			note: hasCapability(c, 'autoset', input) ? undefined : 'AUTOSET N/A',
			overlay: hasCapability(c, 'gain', input) ? ctx.overlay : 'unsupported',
		})
	}

	protected register(s: JsonObject): void {
		const input = int(s.channel, 0)
		if (input === undefined) return
		inputName(this.connection, input)
		gainText(this.connection, input)
	}

	override onDialRotate(ev: DialRotateEvent<JsonObject>): void {
		const input = int(ev.payload.settings.channel, 0)
		if (input === undefined || !ev.payload.ticks || !hasCapability(this.connection, 'gain', input)) return
		const amount = ev.payload.ticks * stepOf(ev.payload.settings.step, 1)
		void this.connection.run((c) => c.adjustInputGain(input, amount))
	}

	override async onDialDown(ev: DialDownEvent<JsonObject>): Promise<void> {
		const input = int(ev.payload.settings.channel, 0)
		if (input === undefined || !hasCapability(this.connection, 'autoset', input)) return
		await this.connection.run((c) => c.setChannelOption({ bus: 'input', index: input }, 'autoset', 'toggle'))
	}
}

const EFFECTS = { reverbEnable: 'REVERB', echoEnable: 'ECHO' }
@action({ UUID: ID + 'global-fx' })
export class GlobalFxAction extends ToggleAction {
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
export class FxParamAction extends KeyAction {
	private valid(s: JsonObject) {
		const parameter = pick(s.parameter, FX_PARAMS)
		const mode = pick(s.mode, MODES)
		const value = num(s.value)
		return parameter && mode && Number.isFinite(value) ? { parameter, mode, value } : undefined
	}

	protected render(s: JsonObject, ctx: RenderContext): string {
		const v = this.valid(s)
		if (!v) return SETUP_KEY
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
		else this.hold(ev.action.id, send)
	}
}

@action({ UUID: ID + 'fx-param-dial' })
export class FxParamDialAction extends TotalMixAction<JsonObject> {
	protected render(s: JsonObject, ctx: RenderContext): string {
		const parameter = pick(s.parameter, FX_PARAMS)
		if (!parameter) return SETUP_STRIP
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

@action({ UUID: ID + 'processing-param' })
export class ProcessingParamAction extends TotalMixAction<JsonObject> {
	private valid(s: JsonObject) {
		const target = channelOf(s, ALL)
		const parameter = pick(s.parameter, PROCESSING_PARAMS)
		const value = num(s.value)
		return target && parameter && Number.isFinite(value) ? { target, parameter, value } : undefined
	}

	protected render(s: JsonObject, ctx: RenderContext): string {
		const v = this.valid(s)
		if (!v) return SETUP_KEY
		const current = channelParameter<number | boolean | string>(this.connection, v.target, v.parameter)
		const overlay = hasCapability(this.connection, 'channelFx') ? ctx.overlay : 'unsupported'
		return renderValueKey({ title: PROCESSING_PARAMS[v.parameter], value: current === undefined ? '' : String(current), overlay })
	}

	protected register(s: JsonObject): void {
		const v = this.valid(s)
		if (v) channelParameter(this.connection, v.target, v.parameter)
	}

	override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
		const v = this.valid(ev.payload.settings)
		if (!v || !hasCapability(this.connection, 'channelFx')) return
		await this.connection.run((c) => c.setChannelParameterValue(v.target, v.parameter, v.value))
	}
}

export const gainFxActions = (connection: TotalMixConnection) =>
	[GainAction, GainDialAction, GlobalFxAction, FxParamAction, FxParamDialAction, ProcessingParamAction].map((Action) => new Action(connection))
