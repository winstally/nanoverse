'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LazyMotion, domAnimation, m, useReducedMotion } from 'motion/react'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  PrimaryRail,
} from '@/components/layout/PrimaryRail'
import { APP_NAV_ITEMS } from '@/components/layout/nav-items'
import { useI18n } from '@/components/app/I18nProvider'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'

interface ToolLayoutProps {
  /** Control panel content. Rendered in the sidebar on desktop, in a Sheet on mobile. */
  panel: React.ReactNode
  /** Main work surface (canvas / plot). Always full width on mobile. */
  children: React.ReactNode
  /** Accessible title / trigger label for the mobile Sheet. */
  panelTitle?: string
  /** Sidebar width when expanded, in px. */
  panelWidth?: number
}

/** lg breakpoint — the desktop/mobile divide, matching Tailwind's `lg:` (1024px). */
const DESKTOP_QUERY = '(min-width: 1024px)'

// photoverse flush-sidebar model (sidebar-card-layout.tsx). The handle is a
// drag-to-toggle: dragging gives a live preview and snaps to expanded/collapsed
// on release; clicking toggles. The card is FLUSH against the sidebar (no gutter)
// — the handle overhangs `-left-3` into the card and is clipped by the card's
// overflow-hidden, so only the pill (left-[17px] ≈ +5px inside) shows.
const SIDEBAR_COLLAPSED = 3
const SIDEBAR_CONTENT_BLUR_WIDTH = 96
const DESKTOP_PRIMARY_RAIL_WIDTH = 64
const SIDEBAR_TOGGLE_DISTANCE = 36
const SIDEBAR_MAX = 280
const SPRING = { type: 'spring' as const, stiffness: 420, damping: 30, mass: 1 }

function useIsDesktop(): boolean {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      const mql = window.matchMedia(DESKTOP_QUERY)
      mql.addEventListener('change', onStoreChange)
      return () => mql.removeEventListener('change', onStoreChange)
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  )
}

function MobilePageNav() {
  const { t } = useI18n()
  const pathname = usePathname()
  const router = useRouter()

  return (
    <nav
      aria-label={t('tool.appNavigation')}
      className="order-last grid shrink-0 grid-cols-3 gap-1 bg-transparent px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      {APP_NAV_ITEMS.map((item) => {
        const active =
          pathname === item.route ||
          pathname.startsWith(`${item.route}/`)
        const Icon = item.icon
        const label = t(item.labelKey)
        return (
          <button
            key={item.route}
            type="button"
            aria-current={active ? 'page' : undefined}
            aria-label={label}
            onClick={() => {
              if (!active) router.push(item.route)
            }}
            className={cn(
              'flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[0.7rem] font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={active ? 2.35 : 2} />
            <span className="w-full truncate text-center leading-tight">
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

/**
 * Shared responsive shell for tool pages — a faithful port of photoverse's flush
 * `SidebarCardLayout`: a control-panel sidebar OUTSIDE the work-surface card (the
 * card sits flush against it, only the card is white), a drag-to-toggle handle on
 * the card's left edge with a spring, and a left Sheet on mobile.
 */
export function ToolLayout({
  panel,
  children,
  panelTitle,
  panelWidth = 320,
}: ToolLayoutProps) {
  const { t } = useI18n()
  const resolvedPanelTitle = panelTitle ?? t('tool.panel')
  const [open, setOpen] = React.useState(false) // mobile sheet
  const isDesktop = useIsDesktop()
  const reduceMotion = useReducedMotion()

  // Sidebar width (px). Drag previews live; releasing snaps to expanded/collapsed.
  const expandedWidth = panelWidth
  const maxWidth = Math.max(SIDEBAR_MAX, Math.round(panelWidth * 1.25))
  const [sidebarWidth, setSidebarWidth] = React.useState(expandedWidth)
  const [dragging, setDragging] = React.useState(false)
  const [contentBlurred, setContentBlurred] = React.useState(false)
  const dragStateRef = React.useRef<{
    startX: number
    startWidth: number
    currentWidth: number
  } | null>(null)
  const dragMovedRef = React.useRef(false)
  const contentBlurredRef = React.useRef(false)
  const prevBodyUserSelect = React.useRef('')
  const prevDocumentUserSelect = React.useRef('')
  const prevBodyCursor = React.useRef('')
  const prevDocumentCursor = React.useRef('')

  const collapsed = sidebarWidth <= SIDEBAR_COLLAPSED + 0.5
  const asideWidth = DESKTOP_PRIMARY_RAIL_WIDTH + sidebarWidth

  const setFlushWidth = React.useCallback(
    (next: number) => {
      setSidebarWidth(Math.min(maxWidth, Math.max(SIDEBAR_COLLAPSED, next)))
    },
    [maxWidth],
  )

  const setSidebarBlurred = React.useCallback((next: boolean) => {
    if (contentBlurredRef.current === next) return
    contentBlurredRef.current = next
    setContentBlurred(next)
  }, [])

  const updateSidebarBlurFromRenderedWidth = React.useCallback(
    (renderedAsideWidth: number) => {
      const renderedSidebarWidth = renderedAsideWidth - DESKTOP_PRIMARY_RAIL_WIDTH
      setSidebarBlurred(renderedSidebarWidth <= SIDEBAR_CONTENT_BLUR_WIDTH)
    },
    [setSidebarBlurred],
  )

  const restoreDragDocumentState = React.useCallback(() => {
    document.body.style.userSelect = prevBodyUserSelect.current
    document.documentElement.style.userSelect = prevDocumentUserSelect.current
    document.body.style.cursor = prevBodyCursor.current
    document.documentElement.style.cursor = prevDocumentCursor.current
  }, [])

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      window.getSelection()?.removeAllRanges()
      dragStateRef.current = {
        startX: e.clientX,
        startWidth: sidebarWidth,
        currentWidth: sidebarWidth,
      }
      dragMovedRef.current = false
      e.currentTarget.setPointerCapture(e.pointerId)
      prevBodyUserSelect.current = document.body.style.userSelect
      prevDocumentUserSelect.current = document.documentElement.style.userSelect
      prevBodyCursor.current = document.body.style.cursor
      prevDocumentCursor.current = document.documentElement.style.cursor
      document.body.style.userSelect = 'none'
      document.documentElement.style.userSelect = 'none'
      document.body.style.cursor = 'ew-resize'
      document.documentElement.style.cursor = 'ew-resize'
      setDragging(true)
    },
    [sidebarWidth],
  )

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragStateRef.current
      if (!drag) return
      e.preventDefault()
      window.getSelection()?.removeAllRanges()
      drag.currentWidth = drag.startWidth + e.clientX - drag.startX
      if (Math.abs(e.clientX - drag.startX) > 3) dragMovedRef.current = true
      setFlushWidth(drag.currentWidth)
    },
    [setFlushWidth],
  )

  const handlePointerEnd = React.useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragStateRef.current
      if (!drag) return
      e.preventDefault()
      dragStateRef.current = null
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      restoreDragDocumentState()
      setDragging(false)
      window.getSelection()?.removeAllRanges()
      const dragDistance = drag.currentWidth - drag.startWidth
      if (dragDistance <= -SIDEBAR_TOGGLE_DISTANCE) setFlushWidth(SIDEBAR_COLLAPSED)
      else if (dragDistance >= SIDEBAR_TOGGLE_DISTANCE) setFlushWidth(expandedWidth)
      else setFlushWidth(drag.startWidth)
    },
    [setFlushWidth, expandedWidth, restoreDragDocumentState],
  )

  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      window.getSelection()?.removeAllRanges()
      if (dragMovedRef.current) {
        dragMovedRef.current = false
        return
      }
      setFlushWidth(collapsed ? expandedWidth : SIDEBAR_COLLAPSED)
    },
    [setFlushWidth, collapsed, expandedWidth],
  )

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      setFlushWidth(collapsed ? expandedWidth : SIDEBAR_COLLAPSED)
    },
    [setFlushWidth, collapsed, expandedWidth],
  )

  const sidebarTransition = dragging
    ? { duration: 0 }
    : reduceMotion
      ? { duration: 0 }
      : SPRING

  return (
    <LazyMotion features={domAnimation}>
      <div className="relative flex h-full min-h-0 w-full min-w-0 flex-1 bg-white">
        <m.aside
          className="isolate relative z-[1] hidden min-h-0 shrink-0 flex-col overflow-hidden bg-white lg:flex lg:flex-row"
          initial={false}
          animate={{ width: asideWidth }}
          onUpdate={(latest) => {
            const renderedWidth =
              typeof latest.width === 'number' ? latest.width : Number.parseFloat(String(latest.width))
            if (Number.isFinite(renderedWidth)) {
              updateSidebarBlurFromRenderedWidth(renderedWidth)
            }
          }}
          transition={sidebarTransition}
          aria-hidden={collapsed}
        >
          <div className="h-full w-16 shrink-0">
            <PrimaryRail />
          </div>
          <div
            data-blurred={contentBlurred ? '' : undefined}
            className={cn(
              'flex min-h-0 min-w-[200px] w-full flex-col overflow-hidden transition-[filter,opacity] duration-200 ease-out',
              contentBlurred && 'blur-[5px]',
            )}
            style={{ width: expandedWidth }}
          >
            {isDesktop ? panel : null}
          </div>
        </m.aside>

        {/* Card container — flush: the white card sits directly against the sidebar. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="isolate relative z-[2] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#DDE3EA] bg-surface">
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              {/* Drag-to-toggle handle (lg only). Overhangs -left-3 into the card;
                  the card's overflow-hidden clips it so only the pill shows. */}
              <button
                type="button"
                aria-label={
                  collapsed
                    ? t('tool.openPanel', { title: resolvedPanelTitle })
                    : t('tool.closePanel', { title: resolvedPanelTitle })
                }
                aria-pressed={!collapsed}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                title={collapsed ? t('tool.clickOpen') : t('tool.clickClose')}
                className="group absolute top-1/2 -left-3 z-50 hidden h-24 w-8 -translate-y-1/2 cursor-ew-resize touch-none rounded-full border-0 bg-transparent p-0 outline-none select-none after:pointer-events-none after:absolute after:top-1/2 after:left-[17px] after:h-16 after:w-1 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-foreground/10 after:transition-colors hover:after:bg-foreground/20 active:after:bg-foreground/25 focus-visible:after:bg-foreground/25 lg:block"
              />

              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={resolvedPanelTitle}
                      className={cn(
                        'absolute top-3 left-3 z-30 shadow-sm lg:hidden',
                        'pl-[max(0.625rem,env(safe-area-inset-left))]',
                      )}
                    />
                  }
                >
                  <SlidersHorizontal />
                  {resolvedPanelTitle}
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-[88vw] max-w-sm gap-0 bg-card p-0"
                >
                  <SheetTitle className="sr-only">{resolvedPanelTitle}</SheetTitle>
                  <div className="flex min-h-0 flex-1 flex-col overflow-auto pt-2">
                    {!isDesktop ? panel : null}
                  </div>
                </SheetContent>
              </Sheet>

              {children}
            </div>
          </div>
          <MobilePageNav />
        </div>
      </div>
    </LazyMotion>
  )
}
