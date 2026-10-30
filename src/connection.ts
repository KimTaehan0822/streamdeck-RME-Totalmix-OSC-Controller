import { OscTransport, type OscTransportCallbacks, type OscTransportOptions } from './osc/transport.js'
import { TotalMixController, type RoomEqSide } from './protocol/controller.js'
import type { MixerChannelTarget, SubmixTarget } from './model/device-profile.js'
import { TargetSynchronizer } from './state/target-synchronizer.js'

export interface ConnectionSettings {
	host: string
	targetPort: number
	feedbackPort: number
	syncTimeoutMs: number
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
export type GlobalFeedbackTarget = 'snapshots' | 'groups' | 'controlRoom' | 'globalFx' | 'duRec'

export interface ConnectionDeps {
	createTransport?: (
		options: OscTransportOptions,
		callbacks: OscTransportCallbacks,
	) => Pick<OscTransport, 'start' | 'send' | 'close'>
	now?: () => number
	/** Optional, for tests: capture the monitor (1 s) and background sync (250 ms) callbacks and drive them by hand. */
	setInterval?: (callback: () => void, ms: number) => unknown
}

const OFFLINE_AFTER_MS = 10_000
const TARGET_TTL_MS = 10_000

export class TotalMixConnection {
	private _controller: TotalMixController
	private _status: ConnectionStatus = 'disconnected'
	private transport?: Pick<OscTransport, 'start' | 'send' | 'close'>
	private timers: unknown[] = []
	private unsubscribeState?: () => void
	private readonly listeners = new Set<() => void>()
	private changePending?: NodeJS.Immediate
	private lastMessageAt = 0
	private lastStatusRequestAt = 0
	private syncTimeoutMs = 1000
	private readonly now: () => number
	private readonly createTransport: NonNullable<ConnectionDeps['createTransport']>
	private readonly setIntervalFn: NonNullable<ConnectionDeps['setInterval']>
	private readonly synchronizer: TargetSynchronizer
	private readonly globalTargets = new Map<GlobalFeedbackTarget, { lastSeenAt: number; nextSyncAt: number }>()
	private readonly channelParameterTargets = new Map<
		string,
		{ target: MixerChannelTarget; parameter: string; lastSeenAt: number; nextSyncAt: number }
	>()
	private readonly roomEqTargets = new Map<
		string,
		{ output: number; side: RoomEqSide; parameter: string; lastSeenAt: number; nextSyncAt: number }
	>()

	constructor(deps: ConnectionDeps = {}) {
		this.now = deps.now ?? Date.now
		this.createTransport = deps.createTransport ?? ((options, callbacks) => new OscTransport(options, callbacks))
		this.setIntervalFn = deps.setInterval ?? ((callback, ms) => setInterval(callback, ms))
		this._controller = this.createController()
		// The synchronizer outlives start() so actions may register before the first start.
		this.synchronizer = new TargetSynchronizer(
			async (target) => this._controller.syncSubmixFader(target),
			async (target) => this._controller.syncChannel(target),
			async (output) => this._controller.syncOutputFader(output),
			{ now: this.now },
		)
	}

	get controller(): TotalMixController {
		return this._controller
	}

	get status(): ConnectionStatus {
		return this._status
	}

	get online(): boolean {
		return this._status === 'connected'
	}

	start(settings: ConnectionSettings): void {
		this.stop()
		this.syncTimeoutMs = settings.syncTimeoutMs
		this._status = 'connecting'
		const controller = (this._controller = this.createController())
		this.unsubscribeState = controller.state.subscribe(() => this.emitChange())
		const transport = this.createTransport(
			{ host: settings.host, targetPort: settings.targetPort, feedbackPort: settings.feedbackPort },
			{
				onListening: () => {
					void controller.requestInitialState().catch((error) => this.logError(error))
					void this.syncNextBackgroundTarget()
				},
				onMessage: (message) => {
					controller.handleMessage(message)
					this.lastMessageAt = this.now()
					this._status = 'connected'
					this.emitChange()
				},
				onError: (error) => {
					this._status = 'error'
					this.logError(error)
					this.emitChange()
				},
			},
		)
		this.transport = transport
		transport.start()
		this.timers.push(
			this.setIntervalFn(() => this.monitorConnection(), 1000),
			this.setIntervalFn(() => void this.syncNextBackgroundTarget(), 250),
		)
		this.emitChange()
	}

	stop(): void {
		for (const timer of this.timers) clearInterval(timer as NodeJS.Timeout)
		this.timers = []
		if (this.changePending) clearImmediate(this.changePending)
		this.changePending = undefined
		this.synchronizer.clear()
		this.globalTargets.clear()
		this.channelParameterTargets.clear()
		this.roomEqTargets.clear()
		this.unsubscribeState?.()
		this.unsubscribeState = undefined
		this.transport?.close()
		this.transport = undefined
		this.lastMessageAt = 0
		this._status = 'disconnected'
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener)
		return () => this.listeners.delete(listener)
	}

	registerRoute(target: SubmixTarget): void {
		this.synchronizer.registerRoute(target)
	}

	registerChannel(target: MixerChannelTarget): void {
		if (target.bus === 'output') this.synchronizer.registerOutput(target.index)
		else this.synchronizer.registerChannel({ bus: target.bus, index: target.index })
	}

	registerOutput(output: number): void {
		this.synchronizer.registerOutput(output)
	}

	registerGlobal(target: GlobalFeedbackTarget): void {
		const now = this.now()
		const current = this.globalTargets.get(target)
		if (current) current.lastSeenAt = now
		else this.globalTargets.set(target, { lastSeenAt: now, nextSyncAt: 0 })
	}

	registerChannelParameter(target: MixerChannelTarget, parameter: string): void {
		const key = `${target.bus}:${target.index}:${parameter}`
		const now = this.now()
		const current = this.channelParameterTargets.get(key)
		if (current) current.lastSeenAt = now
		else this.channelParameterTargets.set(key, { target: { ...target }, parameter, lastSeenAt: now, nextSyncAt: 0 })
	}

	registerRoomEq(output: number, side: RoomEqSide, parameter: string): void {
		const key = `${output}:${side}:${parameter}`
		const now = this.now()
		const current = this.roomEqTargets.get(key)
		if (current) current.lastSeenAt = now
		else this.roomEqTargets.set(key, { output, side, parameter, lastSeenAt: now, nextSyncAt: 0 })
	}

	async run(operation: (c: TotalMixController) => Promise<void>): Promise<void> {
		try {
			await operation(this._controller)
		} catch (error) {
			this.logError(error)
		}
	}

	private createController(): TotalMixController {
		return new TotalMixController(
			async (address, ...args) => {
				if (!this.transport) throw new Error('OSC transport is not available')
				return this.transport.send(address, ...args)
			},
			{ bankSize: 48, syncTimeoutMs: this.syncTimeoutMs, protocolMode: 'global' },
		)
	}

	private logError(error: unknown): void {
		console.error(error instanceof Error ? error.message : String(error))
	}

	private emitChange(): void {
		if (this.changePending) return
		this.changePending = setImmediate(() => {
			this.changePending = undefined
			for (const listener of this.listeners) listener()
		})
	}

	private monitorConnection(): void {
		const now = this.now()
		const age = this.lastMessageAt ? now - this.lastMessageAt : Number.POSITIVE_INFINITY
		if (age > 2000 && now - this.lastStatusRequestAt > 2000) {
			this.lastStatusRequestAt = now
			void this._controller.requestStatus().catch((error) => this.logError(error))
		}
		if (this.online && age > OFFLINE_AFTER_MS) {
			this._status = 'disconnected'
			this._controller.state.markStale()
		}
		this.emitChange()
	}

	private async syncNextBackgroundTarget(): Promise<void> {
		if (this._status === 'error') return
		const controller = this._controller
		try {
			const now = this.now()
			const duRecTarget = this.globalTargets.get('duRec')
			if (duRecTarget && duRecTarget.nextSyncAt <= now) {
				const state = String(controller.state.getGlobalParameter('recordState').value ?? '').toLowerCase()
				duRecTarget.nextSyncAt = now + (state === 'record' || state === 'play' ? 500 : 2000)
				await controller.syncDuRec()
				return
			}
			if (await this.synchronizer.syncNext()) return
			for (const [key, target] of this.channelParameterTargets) {
				if (now - target.lastSeenAt > TARGET_TTL_MS) {
					this.channelParameterTargets.delete(key)
					continue
				}
				if (target.nextSyncAt > now) continue
				target.nextSyncAt = now + 2000
				await controller.syncChannelParameter(target.target, target.parameter)
				return
			}
			for (const [key, target] of this.roomEqTargets) {
				if (now - target.lastSeenAt > TARGET_TTL_MS) {
					this.roomEqTargets.delete(key)
					continue
				}
				if (target.nextSyncAt > now) continue
				target.nextSyncAt = now + 2000
				await controller.syncRoomEqParameter(target.output, target.side, target.parameter)
				return
			}
			for (const [key, target] of this.globalTargets) {
				if (key === 'duRec') continue
				if (now - target.lastSeenAt > TARGET_TTL_MS) {
					this.globalTargets.delete(key)
					continue
				}
				if (target.nextSyncAt > now) continue
				target.nextSyncAt = now + 2000
				if (key === 'snapshots') await controller.syncSnapshots()
				else if (key === 'groups') await controller.syncGroups()
				else if (key === 'controlRoom') await controller.syncControlRoom()
				else if (key === 'globalFx') await controller.syncGlobalFx()
				return
			}
		} catch (error) {
			this.logError(error)
		}
	}
}
