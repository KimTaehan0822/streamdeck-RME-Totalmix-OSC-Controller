import { action, type DialDownEvent, type DialRotateEvent, type DialUpEvent, type KeyDownEvent, type TouchTapEvent, type WillDisappearEvent } from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import type { TotalMixConnection } from '../connection.js'
import type { BinaryOperation, FaderUnit, TotalMixController } from '../protocol/controller.js'
import { stringifyPresetTarget } from '../model/preset-target.js'
import { normalizedToDb } from '../protocol/fader-curve.js'
import { channelName, faderBar, faderDb, levelBar, levelDb, muted, panText, panValue, type MixTarget } from '../readers.js'
import { renderValueKey, type ValueKeyView } from '../render/keys.js'
import { renderButtonFader, renderVuStrip, type FaderRole, type MeterView } from '../render/meter.js'
import { fitText, frame, plainText } from '../render/svg.js'
import { TotalMixAction, type RenderContext } from '../runtime/base-action.js'
import { FADER_PEEK_MS, faderAdjustedRecently, markFaderAdjusted } from '../state/fader-peek.js'
import { ALL, BUS_NAME, alternateNext, channelOf as settingsChannel, num, pick } from './common.js'

const ID = 'com.haeunga0822.rme-totalmix.'
const ROLES: Record<FaderRole, unknown> = { top: 1, bottom: 1, left: 1, right: 1 }
const MODES = { set: 1, step: 1, alternate: 1 }
const PRESS_ACTIONS = { mute: 1, recall: 1 }
const TURN_ACTIONS = { step: 1, muteToggle: 1, muteOn: 1, muteOff: 1, recall: 1 }
const MUTE_OPS: Record<string, BinaryOperation> = { mute: 'toggle', muteToggle: 'toggle', muteOn: 'on', muteOff: 'off' }
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

	protected displayName(t: MixTarget, s: JsonObject): string {
		const custom = typeof s.displayName === 'string' ? s.displayName.trim() : ''
		if (custom) return custom
		const ch = t.row === 'output' ? { bus: 'output' as const, index: t.output } : { bus: t.row, index: t.source }
		return channelName(this.connection, ch) || `${BUS_NAME[ch.bus]} ${ch.index + 1}`
	}

	protected meter(t: MixTarget, s: JsonObject, overlay: RenderContext['overlay']): MeterView {
		const c = this.connection
		const isMuted = muted(c, t)
		return {
			name: this.displayName(t, s),
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
		this.meter(t, s, 'none')
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
	/** Per held dial: whether it turned, and which directions already ran a once-per-hold action. */
	private readonly presses = new Map<string, { turned: boolean; fired: Set<string> }>()

	protected render(s: JsonObject, ctx: RenderContext): string {
		const t = targetOf(s)
		return renderVuStrip(t ? this.meter(t, s, ctx.overlay) : emptyFor(s))
	}

	override onWillDisappear(ev: WillDisappearEvent<JsonObject>): void {
		this.presses.delete(ev.action.id)
		super.onWillDisappear(ev)
	}

	// The press acts on release so a press-and-turn can skip it.
	override async onDialDown(ev: DialDownEvent<JsonObject>): Promise<void> {
		this.presses.set(ev.action.id, { turned: false, fired: new Set() })
	}

	async onDialUp(ev: DialUpEvent<JsonObject>): Promise<void> {
		const hold = this.presses.get(ev.action.id)
		this.presses.delete(ev.action.id)
		const s = ev.payload.settings
		const t = targetOf(s)
		if (hold && !hold.turned && t) await this.run(ev.action.id, t, pick(s.pressAction, PRESS_ACTIONS) ?? 'mute', s.pressDb)
	}

	protected rotate(id: string, t: MixTarget, ev: DialRotateEvent<JsonObject>): void {
		const s = ev.payload.settings
		const step = num(s.step)
		// A held turn with no recorded press (e.g. the plugin restarted mid-hold) starts its own hold.
		if (ev.payload.pressed && !this.presses.has(id)) this.presses.set(id, { turned: false, fired: new Set() })
		const hold = ev.payload.pressed ? this.presses.get(id) : undefined
		const dir = ev.payload.ticks < 0 ? 'left' : 'right'
		const chosen = ev.payload.pressed ? (pick(s[dir + 'Action'], TURN_ACTIONS) ?? 'step') : 'step'
		if (hold) hold.turned = true
		if (chosen === 'step') return this.apply(id, t, true, (c) => adjustFader(c, t, ev.payload.ticks * (step > 0 ? step : 1), 'db'))
		if (hold?.fired.has(dir)) return
		hold?.fired.add(dir)
		void this.run(id, t, chosen, s[dir + 'Db'])
	}

	/** A mute operation or a recall to `db` (nothing when it is not a number). */
	private async run(id: string, t: MixTarget, chosen: string, db: unknown): Promise<void> {
		if (chosen !== 'recall') return this.mute(t, MUTE_OPS[chosen])
		const value = num(db)
		if (Number.isFinite(value)) this.apply(id, t, true, (c) => setFader(c, t, value, 'db'))
	}

	private mute(t: MixTarget, op: BinaryOperation): Promise<void> {
		return this.connection.run((c) =>
			t.row === 'output' ? c.setChannelOption({ bus: 'output', index: t.output }, 'mute', op) : c.setMute({ bus: t.row, index: t.source }, op),
		)
	}

	protected press(t: MixTarget): Promise<void> {
		return this.mute(t, 'toggle')
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
		return t && role ? renderButtonFader(this.meter(t, s, ctx.overlay), role) : renderButtonFader(emptyFor(s), 'top')
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
	protected abstract show(t: MixTarget): Pick<ValueKeyView, 'value' | 'bar' | 'meter'>
	protected abstract send(id: string, t: MixTarget, set: boolean, value: number, s: JsonObject): void
	/** Current value on the same scale as the settings' values, for the alternate mode. */
	protected abstract current(t: MixTarget, s: JsonObject): number | undefined
	protected abstract tolerance(s: JsonObject): number
	protected valid(s: JsonObject): boolean {
		return !!pick(s.mode, MODES) && Number.isFinite(num(s.value)) && (s.mode !== 'alternate' || Number.isFinite(num(s.value2)))
	}

	private alternate(t: MixTarget, s: JsonObject) {
		return alternateNext(this.current(t, s), num(s.value), num(s.value2), this.tolerance(s))
	}

	/** Alternate keys show their second state while at value 2; other modes leave the state alone. */
	protected override keyState(s: JsonObject): 0 | 1 | undefined {
		const t = targetOf(s)
		if (s.mode !== 'alternate' || !t || !this.valid(s)) return undefined
		return this.alternate(t, s).atValue2 ? 1 : 0
	}

	protected render(s: JsonObject, ctx: RenderContext): string {
		const t = targetOf(s)
		if (!t || !this.valid(s)) return SETUP_KEY
		return renderValueKey({ title: this.displayName(t, s), ...this.show(t), overlay: ctx.overlay })
	}

	override onKeyDown(ev: KeyDownEvent<JsonObject>): void {
		const s = ev.payload.settings
		const t = targetOf(s)
		if (!t || !this.valid(s)) return
		const value = num(s.value)
		if (s.mode === 'alternate') this.send(ev.action.id, t, true, this.alternate(t, s).target, s)
		else if (s.mode === 'set') this.send(ev.action.id, t, true, value, s)
		else this.hold(ev.action, () => this.send(ev.action.id, t, false, value, s))
	}
}

@action({ UUID: ID + 'fader' })
export class FaderAction extends ValueKeyAction {
	protected override valid(s: JsonObject): boolean {
		return super.valid(s) && !!pick(s.unit ?? 'db', UNITS)
	}

	protected show(t: MixTarget) {
		const c = this.connection
		return { value: faderDb(c, t), meter: { fader: faderBar(c, t), left: levelBar(c, t, 'left'), right: levelBar(c, t, 'right'), muted: muted(c, t) } }
	}

	protected current(t: MixTarget, s: JsonObject): number | undefined {
		const c = this.connection.controller.state
		const value = t.row === 'output' ? c.getOutput(t.output).value : c.getRoute(route(t)).value
		return value === undefined ? undefined : UNITS[(s.unit as string) ?? 'db'] === 'db' ? normalizedToDb(value) : value
	}

	protected tolerance(s: JsonObject): number {
		return UNITS[(s.unit as string) ?? 'db'] === 'db' ? 0.2 : 0.005
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

	protected current(t: MixTarget): number | undefined {
		const v = panValue(this.connection, t)
		return v === undefined ? undefined : v * 200 - 100
	}

	protected tolerance(): number {
		return 1
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
			plainText(100, 28, fitText(this.displayName(t, s), 24, 192), { size: 24, fill: '#fff' }) +
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
