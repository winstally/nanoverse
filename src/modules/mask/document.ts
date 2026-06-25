import { Shape } from './shape'
import { newId } from './shape'
import { Locale, t } from '@/lib/i18n'

export type Polarity = 'darkOnLight' | 'lightOnDark' // darkOnLight = white substrate, black features (default)
export type MaskTarget = 'bmp' | 'gds'

export interface MaskDocument {
  id: string
  name: string
  widthUm: number
  heightUm: number
  /** Objective magnification captured with the design. */
  magnification: number
  /** Substrate µm per design-cm at that magnification. */
  umPerCm: number
  /** Mutually exclusive output/layout model. */
  target: MaskTarget
  shapes: Shape[]
  polarity: Polarity
}

export function createDefaultDocument(
  cal: import('./calibration').Calibration,
  locale: Locale,
  target: MaskTarget,
): MaskDocument {
  return {
    id: newId('mask-'),
    name: t('project.mask.newName', {}, locale),
    widthUm: cal.substrateWUm,
    heightUm: cal.substrateHUm,
    magnification: cal.magnification,
    umPerCm: cal.umPerCm,
    target,
    shapes: [],
    polarity: 'darkOnLight',
  }
}
