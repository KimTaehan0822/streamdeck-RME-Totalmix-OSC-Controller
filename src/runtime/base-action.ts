import {
	SingletonAction,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type KeyUpEvent,
	type TitleParametersDidChangeEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import type { TotalMixConnection } from '../connection.js'
import { svgDataUrl, type Overlay } from '../render/svg.js'
import { HoldRepeater } from './hold.js'
import { Redrawer } from './redraw.js'

export interface RenderContext {
	dial: boolean
	/** 'offline' while TotalMix is unreachable, otherwise 'none'; a render may still pick 'setup'/'unsupported' itself. */
	overlay: Overlay
	/** The user set a title for this key's current state in the Stream Deck app, so the drawn text would collide with it. */
	userTitle: boolean
}

interface Instance<S extends JsonObject> {
	action: WillAppearEvent<S>['action']
	settings: S
	redrawer: Redrawer
	/** Current native state; stays unset on single-state actions. */
	state?: 0 | 1
	/** Title the user set in the Stream Deck app, by native state. */
	titles: string[]
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
	/** Native state for a two-state action, so the user's per-state icon and title follow the mixer. */
	protected keyState(_settings: S): 0 | 1 | undefined {
		return undefined
	}

	override async onWillAppear(ev: WillAppearEvent<S>): Promise<void> {
		const action = ev.action
		const redrawer = new Redrawer(async (image) => {
			try {
				if (action.isDial()) await action.setFeedback({ canvas: image })
				else if (action.isKey()) await action.setImage(image)
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error))
				throw error // Redrawer forgets the image and retries
			}
		})
		this.instances.set(action.id, { action, settings: ev.payload.settings, redrawer, titles: [] })
		if (action.isDial()) {
			await action.setFeedbackLayout('layouts/strip.json').catch((error) => {
				console.error(error instanceof Error ? error.message : String(error))
			})
		}
		if (this.instances.get(action.id)?.action !== action) return // disappeared while awaiting
		this.start()
		this.refresh(action.id)
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<S>): void {
		const instance = this.instances.get(ev.action.id)
		if (!instance) return
		instance.settings = ev.payload.settings
		this.refresh(ev.action.id)
	}

	override onTitleParametersDidChange(ev: TitleParametersDidChangeEvent<S>): void {
		const instance = this.instances.get(ev.action.id)
		if (!instance) return
		instance.titles[ev.payload.state ?? 0] = ev.payload.titleParameters.showTitle ? ev.payload.title : ''
		this.refresh(ev.action.id)
	}

	override onWillDisappear(ev: WillDisappearEvent<S>): void {
		this.instances.get(ev.action.id)?.redrawer.dispose()
		this.instances.delete(ev.action.id)
		this.holds.get(ev.action.id)?.stop()
		this.holds.delete(ev.action.id)
		if (this.instances.size === 0) this.stop()
	}

	/** Steps once now and keeps repeating until key-up or the action disappears. A multi-action never gets willDisappear or a reliable key-up, so it steps once. */
	protected hold(action: KeyDownEvent<S>['action'], step: () => void): void {
		if (action.isInMultiAction()) return step()
		const id = action.id
		this.holds.get(id)?.stop()
		const repeater = new HoldRepeater(step)
		this.holds.set(id, repeater)
		repeater.start()
	}

	override onKeyUp(ev: KeyUpEvent<S>): void {
		this.holds.get(ev.action.id)?.stop()
	}

	/** Registrations expire after 10 s and start() clears them, so every visible instance re-registers on each tick. */
	protected refresh(id?: string): void {
		for (const [key, instance] of this.instances) {
			if (id !== undefined && key !== id) continue
			try {
				this.register(instance.settings)
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error))
			}
			const state = this.keyState(instance.settings)
			if (state !== undefined && state !== instance.state && instance.action.isKey()) {
				instance.state = state
				instance.action.setState(state).catch((error) => console.error(error instanceof Error ? error.message : String(error)))
			}
			const ctx: RenderContext = {
				dial: instance.action.isDial(),
				overlay: this.connection.online ? 'none' : 'offline',
				userTitle: !!instance.titles[instance.state ?? 0],
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
