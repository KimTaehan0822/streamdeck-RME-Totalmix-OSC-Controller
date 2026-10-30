import { action, type KeyDownEvent } from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import type { TotalMixConnection } from '../connection.js'
import { activeSnapshot, globalParameter } from '../readers.js'
import { renderSnapshotKey, renderValueKey } from '../render/keys.js'
import { TotalMixAction, type RenderContext } from '../runtime/base-action.js'
import { BLUE, ToggleAction, type Spec } from './channel-toggles.js'
import { int, pick } from './common.js'

const ID = 'com.haeunga0822.rme-totalmix.'
const NEUTRAL = 'rgb(70,70,70)'
const CONFIG_KEY = renderValueKey({ title: '', value: '', overlay: 'config' })

/** A key that only sends something on press and is never lit. */
abstract class CommandAction extends ToggleAction {
	protected override readonly setupOverlay = 'config'
	protected command(title: string, label: string, press: Spec['press'], supported?: () => boolean): Spec {
		return { title: () => title, label, color: NEUTRAL, read: () => false, press, supported }
	}
}

@action({ UUID: ID + 'snapshot' })
export class SnapshotAction extends TotalMixAction<JsonObject> {
	private valid(s: JsonObject) {
		if (s.mode === 'show') return { show: true as const, number: undefined }
		const number = int(s.number, 1, 8)
		return number === undefined ? undefined : { show: false as const, number }
	}

	protected render(s: JsonObject, ctx: RenderContext): string {
		const v = this.valid(s)
		if (!v) return CONFIG_KEY
		const active = activeSnapshot(this.connection)
		if (v.show) return renderSnapshotKey({ number: active, active: active !== undefined, mode: 'show', overlay: ctx.overlay })
		return renderSnapshotKey({ number: v.number, active: active === v.number, mode: 'recall', overlay: ctx.overlay })
	}

	protected register(): void {
		activeSnapshot(this.connection)
	}

	override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
		const v = this.valid(ev.payload.settings)
		if (!v || v.show) return
		const number = v.number
		await this.connection.run((c) => c.recallSnapshot(number))
	}
}

const CONTROL_ROOM = {
	mainDim: 'DIM',
	mainSpeakerB: 'SPEAKER B',
	speakerBLinked: 'LINK B',
	mainMuteFx: 'MUTE FX',
	mainMono: 'MONO',
	mainExtIn: 'EXT IN',
	mainTalkback: 'TALKBACK',
	globalMute: 'GLOBAL MUTE',
	globalSolo: 'GLOBAL PFL',
	recallMainVolume: 'RECALL VOLUME',
}
@action({ UUID: ID + 'control-room' })
export class ControlRoomAction extends CommandAction {
	protected spec(s: JsonObject): Spec | undefined {
		const fn = pick(s.function, CONTROL_ROOM)
		if (!fn) return undefined
		if (fn === 'recallMainVolume') return this.command('MAIN', CONTROL_ROOM[fn], (c) => c.recallMainOutputVolume())
		return {
			title: () => 'CONTROL ROOM',
			label: CONTROL_ROOM[fn],
			color: BLUE,
			read: () => globalParameter<boolean>(this.connection, fn) === true,
			press: (ctl, op) => ctl.setControlRoom(fn, op),
		}
	}
}

@action({ UUID: ID + 'layout' })
export class LayoutAction extends CommandAction {
	protected spec(s: JsonObject): Spec | undefined {
		const n = int(s.layout, 1, 6)
		return n === undefined ? undefined : this.command('LAYOUT', String(n), (c) => c.loadLayoutPreset(n))
	}
}

const WINDOW = { show: 'SHOW', hide: 'HIDE' }
@action({ UUID: ID + 'window' })
export class WindowAction extends CommandAction {
	protected spec(s: JsonObject): Spec | undefined {
		const mode = pick(s.window, WINDOW)
		return mode && this.command('WINDOW', WINDOW[mode], (c) => c.showWindow(mode === 'show'))
	}
}

export const globalActions = (connection: TotalMixConnection) =>
	[SnapshotAction, ControlRoomAction, LayoutAction, WindowAction].map((Action) => new Action(connection))
