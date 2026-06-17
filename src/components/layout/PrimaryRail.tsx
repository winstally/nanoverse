'use client'

import { usePathname, useRouter } from 'next/navigation'
import { LayoutGrid, LineChart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { SystemMenu } from './SystemMenu'

interface NavItem {
  label: string
  route: string
  icon: typeof LayoutGrid
}

const NAV: NavItem[] = [
  { label: 'マスク設計', route: '/mask', icon: LayoutGrid },
  { label: 'スペクトル解析', route: '/analyze', icon: LineChart },
]

export function PrimaryRail() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <nav className="flex h-full w-14 shrink-0 flex-col items-center rounded-xl bg-rail py-3">
      <div className="mt-1 flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.route)
          const Icon = item.icon
          return (
            <Tooltip key={item.route}>
              <TooltipTrigger
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                onClick={() => router.push(item.route)}
                className={cn(
                  'group relative flex size-10 items-center justify-center rounded-lg outline-none transition-colors duration-150 ease-out focus-visible:ring-3 focus-visible:ring-white/40',
                  active
                    ? 'bg-white/[0.12] text-white'
                    : 'text-white/55 hover:bg-white/[0.07] hover:text-white/90'
                )}
              >
                <span
                  className={cn(
                    'absolute left-0 h-4 w-[2.5px] rounded-r-full bg-accent transition-opacity duration-150',
                    active ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <Icon size={18} strokeWidth={active ? 2.25 : 2} />
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      <SystemMenu className="mt-auto" />
    </nav>
  )
}
