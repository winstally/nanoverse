'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { SystemInfoDialog, SystemMenu } from './SystemMenu'
import { useI18n } from '@/components/app/I18nProvider'
import { APP_NAV_ITEMS } from './nav-items'

export function PrimaryRail() {
  const { t } = useI18n()
  const pathname = usePathname()
  const router = useRouter()
  const [infoOpen, setInfoOpen] = React.useState(false)

  return (
    <nav className="isolate relative z-[2] flex h-full w-16 shrink-0 flex-col rounded-xl bg-[#090909] p-3 text-white">
      <button
        type="button"
        aria-label={t('app.info')}
        title="nanoverse"
        onClick={() => setInfoOpen(true)}
        className="mb-[90px] flex size-10 items-center justify-center rounded-lg text-white outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <Image
          src="/nanoverse-icon.png"
          alt="nanoverse"
          width={40}
          height={40}
          className="size-10 rounded-lg object-contain"
          draggable={false}
          unoptimized
        />
      </button>
      <div className="flex flex-col items-center gap-1.5">
        {APP_NAV_ITEMS.map((item) => {
          const active =
            pathname === item.route ||
            pathname.startsWith(`${item.route}/`)
          const Icon = item.icon
          const label = t(item.labelKey)
          return (
            <Tooltip key={item.route}>
              <TooltipTrigger
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                onClick={() => router.push(item.route)}
                className={cn(
                  'group relative flex size-10 items-center justify-center rounded-lg outline-none transition-colors duration-150 ease-out focus-visible:ring-3 focus-visible:ring-white/40',
                  active
                    ? 'bg-[#333333] text-white ring-1 ring-inset ring-white/[0.03]'
                    : 'text-white hover:bg-white/10'
                )}
              >
                <span
                  className={cn(
                    'absolute left-0 h-4 w-[2.5px] rounded-r-full bg-accent transition-opacity duration-150',
                    active ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <Icon className="size-[18px]" strokeWidth={active ? 2.25 : 2} />
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1.5">
        <SystemMenu />
      </div>

      <SystemInfoDialog open={infoOpen} onOpenChange={setInfoOpen} />
    </nav>
  )
}
