// The designs drawn from the shared input; the plugin's own three designs (plugin, classic, modern) stay in ../meter.ts for now.
import { big } from './big.js'
import { obs, obsWide } from './obs.js'
import { topping } from './topping.js'
import type { MeterDesign } from './types.js'
import { vu, vu10, vu4 } from './vu.js'

export type SharedDesign = 'topping' | 'obs' | 'obs-wide' | 'big' | 'vu' | 'vu4' | 'vu10'
export const SHARED_DESIGNS: Record<SharedDesign, MeterDesign> = { topping, obs, 'obs-wide': obsWide, big, vu, vu4, vu10 }
export const isSharedDesign = (v: unknown): v is SharedDesign => typeof v === 'string' && Object.hasOwn(SHARED_DESIGNS, v)
export type { FaderRole, MeterDesign, MeterInput, MeterKeyInput } from './types.js'
