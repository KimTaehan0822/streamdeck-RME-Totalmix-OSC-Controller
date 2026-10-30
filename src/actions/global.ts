import { action, type KeyDownEvent } from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import type { TotalMixConnection } from '../connection.js'
import type { RoomEqSide } from '../protocol/controller.js'
import { activeSnapshot, channelName, globalParameter, globalParameterText, hasCapability, roomEqParameter } from '../readers.js'
import { renderSnapshotKey, renderValueKey } from '../render/keys.js'
import { TotalMixAction, type RenderContext } from '../runtime/base-action.js'
import { BLUE, RED, ToggleAction, type Spec } from './channel-toggles.js'
import { ALL, channelOf, int, num, pick } from './common.js'

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

@action({ UUID: ID + 'save-snapshot' })
export class SaveSnapshotAction extends CommandAction {
	protected spec(s: JsonObject): Spec | undefined {
		const number = int(s.number, 1, 8)
		return number === undefined ? undefined : this.command('SAVE', `SNAPSHOT ${number}`, (c) => c.saveSnapshot(number))
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

type DuRecCommand = 'recordStop' | 'record' | 'playPause' | 'stop' | 'next' | 'previous'
const DUREC: Record<DuRecCommand, string> = {
	recordStop: 'REC/STOP',
	record: 'RECORD',
	playPause: 'PLAY/PAUSE',
	stop: 'STOP',
	next: 'NEXT',
	previous: 'PREVIOUS',
}
@action({ UUID: ID + 'durec' })
export class DuRecAction extends CommandAction {
	protected spec(s: JsonObject): Spec | undefined {
		const command = pick(s.command, DUREC)
		if (!command) return undefined
		const c = this.connection
		const state = globalParameterText(c, 'recordState')
		const time = globalParameterText(c, 'recordTime')
		const recording = state === 'Record'
		const playing = state === 'Play'
		const lit = command === 'playPause' ? playing : command === 'record' || command === 'recordStop' ? recording : false
		return {
			title: () => DUREC[command],
			label: recording || playing ? time : state,
			color: recording ? RED : BLUE,
			read: () => lit,
			press: (ctl) => ctl.duRecTransport(command),
			supported: () => hasCapability(c, 'duRec'),
		}
	}
}

@action({ UUID: ID + 'durec-channel' })
export class DuRecChannelAction extends ToggleAction {
	protected spec(s: JsonObject): Spec | undefined {
		const t = channelOf(s, ['input', 'output'])
		return t && this.option(t, 'recordEnable', 'REC', RED, () => hasCapability(this.connection, 'duRec'))
	}
}

const UNDO_REDO = { undo: 'UNDO', redo: 'REDO' }
@action({ UUID: ID + 'undo-redo' })
export class UndoRedoAction extends CommandAction {
	protected spec(s: JsonObject): Spec | undefined {
		const command = pick(s.command, UNDO_REDO)
		return command && this.command(UNDO_REDO[command], '', (c) => c.undoRedo(command))
	}
}

@action({ UUID: ID + 'layout' })
export class LayoutAction extends CommandAction {
	protected spec(s: JsonObject): Spec | undefined {
		const n = int(s.layout, 1, 6)
		return n === undefined ? undefined : this.command('LAYOUT', String(n), (c) => c.loadLayoutPreset(n))
	}
}

@action({ UUID: ID + 'quick-workspace' })
export class QuickWorkspaceAction extends CommandAction {
	protected spec(s: JsonObject): Spec | undefined {
		const n = int(s.number, 1, 30)
		return n === undefined ? undefined : this.command('WORKSPACE', String(n), (c) => c.loadQuickWorkspace(n))
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

const SIDES: Record<RoomEqSide, string> = { left: 'L', right: 'R', both: 'L+R' }
const roomEqSupported = (c: TotalMixConnection) => () => hasCapability(c, 'roomEq')
const outputTitle = (c: TotalMixConnection, index: number) => () => channelName(c, { bus: 'output', index }) || `Output ${index + 1}`

@action({ UUID: ID + 'room-eq' })
export class RoomEqAction extends ToggleAction {
	protected spec(s: JsonObject): Spec | undefined {
		const t = channelOf(s, ['output'])
		const side = pick(s.side, SIDES)
		if (!t || !side) return undefined
		const c = this.connection
		return {
			title: outputTitle(c, t.index),
			label: `ROOM EQ ${SIDES[side]}`,
			color: BLUE,
			read: () => roomEqParameter<boolean>(c, t.index, side, 'reqEnable') === true,
			press: (ctl, op) => ctl.setRoomEqOption(t.index, side, op),
			supported: roomEqSupported(c),
		}
	}
}

const ROOM_EQ_PARAMS: Record<string, string> = {
	reqDelay: 'Delay',
	reqVolumeCorr: 'Volume corr.',
	reqType1: 'Band 1 type',
	reqType8: 'Band 8 type',
	reqType9: 'Band 9 type',
}
for (let band = 1; band <= 9; band++) {
	ROOM_EQ_PARAMS[`reqGain${band}`] = `Band ${band} gain`
	ROOM_EQ_PARAMS[`reqFreq${band}`] = `Band ${band} freq`
	ROOM_EQ_PARAMS[`reqQ${band}`] = `Band ${band} Q`
}

@action({ UUID: ID + 'room-eq-param' })
export class RoomEqParamAction extends ToggleAction {
	protected spec(s: JsonObject): Spec | undefined {
		const t = channelOf(s, ['output'])
		const side = pick(s.side, SIDES)
		const parameter = pick(s.parameter, ROOM_EQ_PARAMS)
		const value = num(s.value)
		if (!t || !side || !parameter || !Number.isFinite(value)) return undefined
		const c = this.connection
		return {
			title: outputTitle(c, t.index),
			label: `${ROOM_EQ_PARAMS[parameter]} ${value}`,
			color: BLUE,
			read: () => roomEqParameter<number>(c, t.index, side, parameter) === value,
			press: (ctl) => ctl.setRoomEqParameter(t.index, side, parameter, value),
			supported: roomEqSupported(c),
		}
	}
}

@action({ UUID: ID + 'channel-name' })
export class ChannelNameAction extends ToggleAction {
	protected spec(s: JsonObject): Spec | undefined {
		const t = channelOf(s, ALL)
		const name = typeof s.name === 'string' ? s.name.trim() : ''
		if (!t || !name) return undefined
		return {
			title: () => channelName(this.connection, t) || `${t.bus} ${t.index + 1}`,
			label: `> ${name}`,
			color: NEUTRAL,
			read: () => false,
			press: (ctl) => ctl.setChannelName(t, name),
		}
	}
}

export const globalActions = (connection: TotalMixConnection) =>
	[
		SnapshotAction, SaveSnapshotAction, ControlRoomAction, DuRecAction, DuRecChannelAction, UndoRedoAction, LayoutAction,
		QuickWorkspaceAction, WindowAction, RoomEqAction, RoomEqParamAction, ChannelNameAction,
	].map((Action) => new Action(connection))
