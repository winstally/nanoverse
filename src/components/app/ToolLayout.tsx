'use client'

import * as React from 'react'
import { LazyMotion, domAnimation, m, useReducedMotion } from 'motion/react'
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
const SIDEBAR_TOGGLE_DISTANCE = 36
const SPRING = { type: 'spring' as const, stiffness: 420, damping: 30, mass: 1 }

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
 * Shared responsive shell for tool pages — a faithful port of photoverse's flush
 * `SidebarCardLayout`: a control-panel sidebar OUTSIDE the work-surface card (the
 * card sits flush against it, only the card is white), a drag-to-toggle handle on
 * the card's left edge with a spring, and a left Sheet on mobile.
 */
export function ToolLayout({
  panel,
  children,
  panelTitle = '操作パネル',
  panelWidth = 320,
}: ToolLayoutProps) {
  const [open, setOpen] = React.useState(false) // mobile sheet
  const isDesktop = useIsDesktop()
  const reduceMotion = useReducedMotion()

  // Sidebar width (px). Drag previews live; releasing snaps to expanded/collapsed.
  const expandedWidth = panelWidth
  const maxWidth = Math.round(panelWidth * 1.25)
  const [width, setWidth] = React.useState(expandedWidth)
  const [dragging, setDragging] = React.useState(false)
  const dragStateRef = React.useRef<{
    startX: number
    startWidth: number
    currentWidth: number
  } | null>(null)
  const dragMovedRef = React.useRef(false)
  const prevBodyUserSelect = React.useRef('')
  const prevBodyCursor = React.useRef('')

  const collapsed = width <= SIDEBAR_COLLAPSED + 0.5

  const setFlushWidth = React.useCallback(
    (next: number) => {
      setWidth(Math.min(maxWidth, Math.max(SIDEBAR_COLLAPSED, next)))
    },
    [maxWidth],
  )

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      dragStateRef.current = {
        startX: e.clientX,
        startWidth: width,
        currentWidth: width,
      }
      dragMovedRef.current = false
      e.currentTarget.setPointerCapture(e.pointerId)
      prevBodyUserSelect.current = document.body.style.userSelect
      prevBodyCursor.current = document.body.style.cursor
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'ew-resize'
      setDragging(true)
    },
    [width],
  )

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStateRef.current
      if (!drag) return
      e.preventDefault()
      drag.currentWidth = drag.startWidth + e.clientX - drag.startX
      if (Math.abs(e.clientX - drag.startX) > 3) dragMovedRef.current = true
      setFlushWidth(drag.currentWidth)
    },
    [setFlushWidth],
  )

  const handlePointerEnd = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStateRef.current
      if (!drag) return
      e.preventDefault()
      dragStateRef.current = null
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      document.body.style.userSelect = prevBodyUserSelect.current
      document.body.style.cursor = prevBodyCursor.current
      setDragging(false)
      const dragDistance = drag.currentWidth - drag.startWidth
      if (dragDistance <= -SIDEBAR_TOGGLE_DISTANCE) setFlushWidth(SIDEBAR_COLLAPSED)
      else if (dragDistance >= SIDEBAR_TOGGLE_DISTANCE) setFlushWidth(expandedWidth)
      else setFlushWidth(drag.startWidth)
    },
    [setFlushWidth, expandedWidth],
  )

  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (dragMovedRef.current) {
        dragMovedRef.current = false
        return
      }
      setFlushWidth(collapsed ? expandedWidth : SIDEBAR_COLLAPSED)
    },
    [setFlushWidth, collapsed, expandedWidth],
  )

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
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
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1">
        {/* Desktop sidebar — OUTSIDE the card, blending with the frame background. */}
        <m.aside
          className="hidden min-h-0 shrink-0 flex-col overflow-hidden lg:flex"
          initial={false}
          animate={{ width }}
          transition={sidebarTransition}
          aria-hidden={collapsed}
        >
          {/* Fixed inner width so the panel content doesn't reflow while the aside
              animates — it is simply clipped by the aside's overflow-hidden. */}
          <div
            className="flex min-h-0 flex-1 flex-col overflow-auto"
            style={{ width: expandedWidth }}
          >
            {isDesktop ? panel : null}
          </div>
        </m.aside>

        {/* Card container — flush: the white card sits directly against the sidebar. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative z-[2] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-rule-2 bg-surface shadow-[0_1px_2px_rgba(20,23,28,0.05),0_10px_28px_-12px_rgba(20,23,28,0.14)]">
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              {/* Drag-to-toggle handle (lg only). Overhangs -left-3 into the card;
                  the card's overflow-hidden clips it so only the pill shows. */}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={collapsed ? `${panelTitle}を開く` : `${panelTitle}を閉じる`}
                aria-valuemin={SIDEBAR_COLLAPSED}
                aria-valuemax={maxWidth}
                aria-valuenow={Math.round(width)}
                tabIndex={0}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                title={collapsed ? 'クリックして開く' : 'クリックして閉じる'}
                className="group absolute top-1/2 -left-3 z-50 hidden h-24 w-8 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full outline-none select-none lg:flex"
              >
                <span className="pointer-events-none absolute top-1/2 left-[17px] h-16 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/10 transition-colors group-hover:bg-foreground/20 group-active:bg-foreground/25 group-focus-visible:bg-foreground/25" />
              </div>

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
        </div>
      </div>
    </LazyMotion>
  )
}
