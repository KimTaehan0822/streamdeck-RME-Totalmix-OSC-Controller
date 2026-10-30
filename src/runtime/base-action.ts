import {
	SingletonAction,
	type DidReceiveSettingsEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import type { TotalMixConnection } from '../connection.js'
import { svgDataUrl, type Overlay } from '../render/svg.js'
import type { HoldRepeater } from './hold.js'
import { Redrawer } from './redraw.js'

export interface RenderContext {
	dial: boolean
	/** 'offline' while TotalMix is unreachable, otherwise 'none'; a render may still pick 'setup'/'unsupported' itself. */
	overlay: Overlay
}

interface Instance<S extends JsonObject> {
	action: WillAppearEvent<S>['action']
	settings: S
	redrawer: Redrawer
}

const KEEPALIVE_MS = 2000

export abstract class TotalMixAction<S extends JsonObject> extends SingletonAction<S> {
	/** Key-hold repeaters by action id; stopped when the action disappears. */
	protected readonly holds = new Map<string, HoldRepeater>()
	private readonly instances = new Map<string, Instance<S>>()
	private unsubscribe?: () => void
	private keepalive?: NodeJS.Timeout

	constructor(protected readonly connection: TotalMixConnection) {
		super()
	}

	protected abstract render(settings: S, ctx: RenderContext): string
	protected abstract register(settings: S): void

	override async onWillAppear(ev: WillAppearEvent<S>): Promise<void> {
		const action = ev.action
		const redrawer = new Redrawer(async (image) => {
			try {
				if (action.isDial()) await action.setFeedback({ canvas: image })
				else if (action.isKey()) await action.setImage(image)
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error))
			}
		})
		this.instances.set(action.id, { action, settings: ev.payload.settings, redrawer })
		if (action.isDial()) await action.setFeedbackLayout('layouts/strip.json')
		this.start()
		this.refresh(action.id)
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<S>): void {
		const instance = this.instances.get(ev.action.id)
		if (!instance) return
		instance.settings = ev.payload.settings
		this.refresh(ev.action.id)
	}

	override onWillDisappear(ev: WillDisappearEvent<S>): void {
		this.instances.get(ev.action.id)?.redrawer.dispose()
		this.instances.delete(ev.action.id)
		this.holds.get(ev.action.id)?.stop()
		this.holds.delete(ev.action.id)
		if (this.instances.size === 0) this.stop()
	}

	/** Registrations expire after 10 s and start() clears them, so every visible instance re-registers on each tick. */
	private refresh(id?: string): void {
		for (const [key, instance] of this.instances) {
			if (id !== undefined && key !== id) continue
			try {
				this.register(instance.settings)
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error))
			}
			const ctx: RenderContext = {
				dial: instance.action.isDial(),
				overlay: this.connection.online ? 'none' : 'offline',
			}
			instance.redrawer.request(() => svgDataUrl(this.render(instance.settings, ctx)))
		}
	}

	private start(): void {
		this.unsubscribe ??= this.connection.onChange(() => this.refresh())
		this.keepalive ??= setInterval(() => this.refresh(), KEEPALIVE_MS)
	}

	private stop(): void {
		this.unsubscribe?.()
		this.unsubscribe = undefined
		clearInterval(this.keepalive)
		this.keepalive = undefined
	}
}
