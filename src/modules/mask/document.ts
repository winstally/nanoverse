import { Shape } from './shape'
import { newId } from './shape'

export type Polarity = 'darkOnLight' | 'lightOnDark' // darkOnLight = white substrate, black features (default)

export interface MaskDocument {
  id: string
  name: string
  widthUm: number
  heightUm: number
  /** Objective magnification captured with the design (optional for legacy docs). */
  magnification?: number
  /** Substrate µm per design-cm at that magnification (optional for legacy docs). */
  umPerCm?: number
  shapes: Shape[]
  polarity: Polarity
}

export function createDefaultDocument(
  cal: import('./calibration').Calibration
): MaskDocument {
  return {
    id: newId('mask-'),
    name: 'Untitled',
    widthUm: cal.substrateWUm,
    heightUm: cal.substrateHUm,
    magnification: cal.magnification,
    umPerCm: cal.umPerCm,
    shapes: [],
    polarity: 'darkOnLight',
  }
}
