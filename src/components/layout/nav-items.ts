import { CirclePile, LineChart, LucideIcon, VenetianMask } from 'lucide-react'
import { MessageKey } from '@/lib/i18n'

export interface NavItem {
  labelKey: MessageKey
  route: string
  icon: LucideIcon
}

export const APP_NAV_ITEMS: NavItem[] = [
  { labelKey: 'nav.maskless', route: '/maskless-aligner', icon: VenetianMask },
  { labelKey: 'nav.laserWriting', route: '/laser-writing', icon: CirclePile },
  { labelKey: 'nav.analyze', route: '/analyze', icon: LineChart },
]
