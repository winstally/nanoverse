'use client'

import * as React from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'

interface ToolLayoutProps {
  /** Control panel content. Rendered in an aside on desktop, in a Sheet on mobile. */
  panel: React.ReactNode
  /** Main work surface (canvas / plot). Always full width on mobile. */
  children: React.ReactNode
  /** Accessible title / trigger label for the mobile Sheet. */
  panelTitle?: string
  /** Desktop panel column width, in px. */
  panelWidth?: number
}

/** lg breakpoint — the desktop/mobile divide, matching Tailwind's `lg:` (1024px). */
const DESKTOP_QUERY = '(min-width: 1024px)'

/**
 * Tracks whether the viewport is at the `lg` desktop breakpoint. Returns `false`
 * during SSR / first paint so the mobile layout renders first (mobile-first), then
 * upgrades to the desktop layout once the media query resolves on the client.
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = React.useState(false)
  React.useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY)
    const update = () => setIsDesktop(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])
  return isDesktop
}

/**
 * Shared responsive shell for tool pages.
 *
 * - lg+ : two-column CSS grid `[panelWidth(px) minmax(0,1fr)]`. The panel lives in a
 *   scrollable <aside>; the work surface fills the rest.
 * - <lg : the aside collapses and the work surface takes the full width. A floating
 *   "コントロール" button (lg:hidden) opens the same panel inside a left Sheet, so the
 *   controls remain fully usable on a phone.
 *
 * The `panel` node is mounted in exactly one place at a time (aside on desktop, Sheet
 * body on mobile) so stateful controls aren't duplicated across both surfaces.
 */
export function ToolLayout({
  panel,
  children,
  panelTitle = 'コントロール',
  panelWidth = 320,
}: ToolLayoutProps) {
  const [open, setOpen] = React.useState(false)
  const isDesktop = useIsDesktop()

  return (
    <div
      className="grid h-full min-h-0 w-full grid-cols-1 lg:grid-cols-[var(--panel-w)_minmax(0,1fr)]"
      style={{ '--panel-w': `${panelWidth}px` } as React.CSSProperties}
    >
      {/* Desktop control panel — inline aside, hidden on mobile. */}
      <aside className="hidden min-h-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          {isDesktop ? panel : null}
        </div>
      </aside>

      {/* Work surface — always present; full width on mobile. */}
      <div className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
        {/* Mobile-only trigger that opens the panel in a Sheet. */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                aria-label={panelTitle}
                className={cn(
                  'absolute top-3 left-3 z-30 shadow-sm lg:hidden',
                  'pl-[max(0.625rem,env(safe-area-inset-left))]',
                )}
              />
            }
          >
            <SlidersHorizontal />
            {panelTitle}
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[88vw] max-w-sm gap-0 bg-card p-0"
          >
            <SheetTitle className="sr-only">{panelTitle}</SheetTitle>
            <div className="flex min-h-0 flex-1 flex-col overflow-auto pt-2">
              {!isDesktop ? panel : null}
            </div>
          </SheetContent>
        </Sheet>

        {children}
      </div>
    </div>
  )
}
