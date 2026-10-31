import { action, type DialDownEvent, type DialRotateEvent, type KeyDownEvent, type TouchTapEvent, type WillDisappearEvent } from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import type { TotalMixConnection } from '../connection.js'
import type { FaderUnit, TotalMixController } from '../protocol/controller.js'
import { stringifyPresetTarget } from '../model/preset-target.js'
import { channelName, faderBar, faderDb, levelBar, levelDb, muted, panText, panValue, type MixTarget } from '../readers.js'
import { renderValueKey } from '../render/keys.js'
import { renderButtonFader, renderVuStrip, type FaderRole, type MeterView } from '../render/meter.js'
import { fitText, frame, plainText } from '../render/svg.js'
import { TotalMixAction, type RenderContext } from '../runtime/base-action.js'
import { FADER_PEEK_MS, faderAdjustedRecently, markFaderAdjusted } from '../state/fader-peek.js'
import { ALL, BUS_NAME, channelOf as settingsChannel, num, pick } from './common.js'

const ID = 'com.haeunga0822.rme-totalmix.'
const ROLES: Record<FaderRole, unknown> = { top: 1, bottom: 1, left: 1, right: 1 }
const MODES = { set: 1, step: 1 }
// The PI offers "linear"; the controller calls the same thing "normalized".
const UNITS: Record<string, FaderUnit> = { db: 'db', linear: 'normalized' }
const EMPTY: MeterView = { name: '', left: 0, right: 0, faderDb: '', levelDb: '', muted: false, peek: false, overlay: 'setup' }
/** SET CHANNEL only when the channel itself is missing; any other missing field is a SETUP hint. */
const emptyFor = (s: JsonObject): MeterView => (settingsChannel(s, ALL) ? { ...EMPTY, overlay: 'config' } : EMPTY)

/** Input/playback rows are a source plus the destination output; the output row is the output itself. Undefined = incomplete settings. */
function targetOf(s: JsonObject): MixTarget | undefined {
	const ch = settingsChannel(s, ALL)
	if (!ch) return undefined
	if (ch.bus === 'output') return { row: 'output', output: ch.index }
	const destination = num(s.destination)
	return Number.isInteger(destination) && destination >= 0 ? { row: ch.bus, source: ch.index, destination } : undefined
}

const route = (t: Exclude<MixTarget, { row: 'output' }>) => ({ bus: t.row, index: t.source, output: t.destination })
const setFader = (c: TotalMixController, t: MixTarget, v: number, u: FaderUnit) =>
	t.row === 'output' ? c.setOutputFader(t.output, v, u) : c.setSubmixFader(route(t), v, u)
const adjustFader = (c: TotalMixController, t: MixTarget, v: number, u: FaderUnit) =>
	t.row === 'output' ? c.adjustOutputFader(t.output, v, u) : c.adjustSubmixFader(route(t), v, u)
const setPan = (c: TotalMixController, t: MixTarget, v: number) =>
	t.row === 'output' ? c.setOutputPan(t.output, v) : c.setSubmixPan(route(t), v)
const adjustPan = (c: TotalMixController, t: MixTarget, v: number) =>
	t.row === 'output' ? c.adjustOutputPan(t.output, v) : c.adjustSubmixPan(route(t), v)

abstract class FaderFamilyAction extends TotalMixAction<JsonObject> {
	/** One pending peek redraw per action id; each fader step restarts it. */
	private readonly peekTimers = new Map<string, NodeJS.Timeout>()

	override onWillDisappear(ev: WillDisappearEvent<JsonObject>): void {
		clearTimeout(this.peekTimers.get(ev.action.id))
		this.peekTimers.delete(ev.action.id)
		super.onWillDisappear(ev)
	}

	protected displayName(t: MixTarget): string {
		const ch = t.row === 'output' ? { bus: 'output' as const, index: t.output } : { bus: t.row, index: t.source }
		return channelName(this.connection, ch) || `${BUS_NAME[ch.bus]} ${ch.index + 1}`
	}

	protected meter(t: MixTarget, overlay: RenderContext['overlay']): MeterView {
		const c = this.connection
		const isMuted = muted(c, t)
		return {
			name: this.displayName(t),
			fader: faderBar(c, t),
			left: levelBar(c, t, 'left'),
			right: levelBar(c, t, 'right'),
			faderDb: faderDb(c, t),
			levelDb: levelDb(c, t),
			muted: isMuted,
			peek: isMuted && faderAdjustedRecently(stringifyPresetTarget(t)),
			overlay,
		}
	}

	protected register(s: JsonObject): void {
		const t = targetOf(s)
		if (!t) return
		this.meter(t, 'none')
		panValue(this.connection, t)
	}

	/** Runs a fader/pan change; a fader change also starts the peek window and redraws once more when it ends, so MUTED returns. */
	protected apply(id: string, t: MixTarget, fader: boolean, op: (c: TotalMixController) => Promise<void>): void {
		void this.connection.run(op)
		if (!fader) return
		markFaderAdjusted(stringifyPresetTarget(t))
		clearTimeout(this.peekTimers.get(id))
		const timer = setTimeout(() => this.refresh(id), FADER_PEEK_MS + 20)
		timer.unref()
		this.peekTimers.set(id, timer)
	}

}

abstract class DialAction extends FaderFamilyAction {
	protected abstract rotate(id: string, t: MixTarget, ev: DialRotateEvent<JsonObject>): void
	protected abstract press(t: MixTarget): Promise<void>

	override onDialRotate(ev: DialRotateEvent<JsonObject>): void {
		const t = targetOf(ev.payload.settings)
		if (t && ev.payload.ticks) this.rotate(ev.action.id, t, ev)
	}

	override async onDialDown(ev: DialDownEvent<JsonObject>): Promise<void> {
		const t = targetOf(ev.payload.settings)
		if (t) await this.press(t)
	}
}

@action({ UUID: ID + 'vu-dial' })
export class VuDialAction extends DialAction {
	protected render(s: JsonObject, ctx: RenderContext): string {
		const t = targetOf(s)
		return renderVuStrip(t ? this.meter(t, ctx.overlay) : emptyFor(s))
	}

	protected rotate(id: string, t: MixTarget, ev: DialRotateEvent<JsonObject>): void {
		const step = num(ev.payload.settings.step)
		this.apply(id, t, true, (c) => adjustFader(c, t, ev.payload.ticks * (step > 0 ? step : 1), 'db'))
	}

	protected press(t: MixTarget): Promise<void> {
		return this.connection.run((c) =>
			t.row === 'output' ? c.setChannelOption({ bus: 'output', index: t.output }, 'mute', 'toggle') : c.setMute({ bus: t.row, index: t.source }, 'toggle'),
		)
	}

	override async onTouchTap(ev: TouchTapEvent<JsonObject>): Promise<void> {
		const s = ev.payload.settings
		const t = targetOf(s)
		if (t && s.touchMute !== false && s.touchMute !== 'false') await this.press(t)
	}
}

@action({ UUID: ID + 'button-fader' })
export class ButtonFaderAction extends FaderFamilyAction {
	protected render(s: JsonObject, ctx: RenderContext): string {
		const t = targetOf(s)
		const role = pick(s.role, ROLES)
		return t && role ? renderButtonFader(this.meter(t, ctx.overlay), role) : renderButtonFader(emptyFor(s), 'top')
	}

	override onKeyDown(ev: KeyDownEvent<JsonObject>): void {
		const s = ev.payload.settings
		const t = targetOf(s)
		const role = pick(s.role, ROLES)
		if (!t || !role) return
		const step = num(s.step)
		const amount = (role === 'top' || role === 'right' ? 1 : -1) * (step > 0 ? step : 1)
		this.hold(ev.action, () => this.apply(ev.action.id, t, true, (c) => adjustFader(c, t, amount, 'db')))
	}
}

const SETUP_KEY = renderValueKey({ title: '', value: '', overlay: 'setup' })

abstract class ValueKeyAction extends FaderFamilyAction {
	protected abstract show(t: MixTarget): { value: string; bar: number | undefined }
	protected abstract send(id: string, t: MixTarget, set: boolean, value: number, s: JsonObject): void
	protected valid(s: JsonObject): boolean {
		return !!pick(s.mode, MODES) && Number.isFinite(num(s.value))
	}

	protected render(s: JsonObject, ctx: RenderContext): string {
		const t = targetOf(s)
		if (!t || !this.valid(s)) return SETUP_KEY
		return renderValueKey({ title: this.displayName(t), ...this.show(t), overlay: ctx.overlay })
	}

	override onKeyDown(ev: KeyDownEvent<JsonObject>): void {
		const s = ev.payload.settings
		const t = targetOf(s)
		if (!t || !this.valid(s)) return
		const value = num(s.value)
		if (s.mode === 'set') this.send(ev.action.id, t, true, value, s)
		else this.hold(ev.action, () => this.send(ev.action.id, t, false, value, s))
	}
}

@action({ UUID: ID + 'fader' })
export class FaderAction extends ValueKeyAction {
	protected override valid(s: JsonObject): boolean {
		return super.valid(s) && !!pick(s.unit ?? 'db', UNITS)
	}

	protected show(t: MixTarget) {
		return { value: faderDb(this.connection, t), bar: faderBar(this.connection, t) }
	}

	protected send(id: string, t: MixTarget, set: boolean, value: number, s: JsonObject): void {
		const unit = UNITS[(s.unit as string) ?? 'db']
		this.apply(id, t, true, (c) => (set ? setFader(c, t, value, unit) : adjustFader(c, t, value, unit)))
	}
}

@action({ UUID: ID + 'pan' })
export class PanAction extends ValueKeyAction {
	protected show(t: MixTarget) {
		return { value: String(panText(this.connection, t)), bar: panValue(this.connection, t) }
	}

	protected send(id: string, t: MixTarget, set: boolean, value: number): void {
		this.apply(id, t, false, (c) => (set ? setPan(c, t, value) : adjustPan(c, t, value)))
	}
}

@action({ UUID: ID + 'pan-dial' })
export class PanDialAction extends DialAction {
	protected render(s: JsonObject, ctx: RenderContext): string {
		const t = targetOf(s)
		if (!t) return frame(200, 100, '', 'setup')
		const v = panValue(this.connection, t)
		// Bar grows from the centre (x=100) towards the pan side.
		const x = v === undefined ? 100 : Math.round(Math.min(1, Math.max(0, v)) * 180) + 10
		const bar =
			`<rect x="10" y="50" width="180" height="14" fill="#333"/>` +
			`<rect x="${Math.min(x, 100)}" y="50" width="${Math.abs(x - 100)}" height="14" fill="rgb(40,140,255)"/>` +
			`<rect x="99" y="44" width="2" height="26" fill="#fff"/>`
		const body =
			plainText(100, 28, fitText(this.displayName(t), 24, 192), { size: 24, fill: '#fff' }) +
			bar +
			plainText(100, 92, String(panText(this.connection, t)), { size: 19, fill: '#fff' })
		return frame(200, 100, body, ctx.overlay)
	}

	protected rotate(id: string, t: MixTarget, ev: DialRotateEvent<JsonObject>): void {
		const step = num(ev.payload.settings.step)
		this.apply(id, t, false, (c) => adjustPan(c, t, ev.payload.ticks * (step > 0 ? step : 5)))
	}

	protected press(t: MixTarget): Promise<void> {
		// the controller's pan scale is -100..100, so 0 is the centre
		return this.connection.run((c) => setPan(c, t, 0))
	}
}

export const faderActions = (connection: TotalMixConnection) =>
	[VuDialAction, ButtonFaderAction, FaderAction, PanDialAction, PanAction].map((Action) => new Action(connection))
