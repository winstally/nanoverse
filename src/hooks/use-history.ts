'use client'

import * as React from 'react'

export interface History<T> {
  /** Current value. */
  state: T
  /**
   * Update the value. By default the previous value is pushed onto the undo
   * stack; pass { history: false } for transient updates (e.g. live dragging)
   * that should be coalesced into a single undo step via `snapshot()`.
   */
  set: (updater: T | ((prev: T) => T), opts?: { history?: boolean }) => void
  /** Push the current value onto the undo stack (call before a drag begins). */
  snapshot: () => void
  /** Replace the value and clear all history (e.g. loading / new project). */
  reset: (value: T) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

interface HistState<T> {
  past: T[]
  present: T
  future: T[]
}

/**
 * Undo/redo history. State lives in a single useState object updated only via
 * pure functional updaters, so it's read normally during render (no refs) and
 * is StrictMode-safe.
 */
export function useHistory<T>(initial: T, limit = 200): History<T> {
  const [h, setH] = React.useState<HistState<T>>({
    past: [],
    present: initial,
    future: [],
  })

  const set = React.useCallback(
    (updater: T | ((prev: T) => T), opts?: { history?: boolean }) => {
      setH((s) => {
        const next =
          typeof updater === 'function'
            ? (updater as (p: T) => T)(s.present)
            : updater
        if (Object.is(next, s.present)) return s
        if (opts?.history === false) return { ...s, present: next }
        return {
          past: [...s.past.slice(-(limit - 1)), s.present],
          present: next,
          future: [],
        }
      })
    },
    [limit],
  )

  const snapshot = React.useCallback(() => {
    setH((s) => ({
      past: [...s.past.slice(-(limit - 1)), s.present],
      present: s.present,
      future: [],
    }))
  }, [limit])

  const reset = React.useCallback((value: T) => {
    setH({ past: [], present: value, future: [] })
  }, [])

  const undo = React.useCallback(() => {
    setH((s) => {
      if (s.past.length === 0) return s
      const prev = s.past[s.past.length - 1]
      return {
        past: s.past.slice(0, -1),
        present: prev,
        future: [s.present, ...s.future],
      }
    })
  }, [])

  const redo = React.useCallback(() => {
    setH((s) => {
      if (s.future.length === 0) return s
      const next = s.future[0]
      return {
        past: [...s.past, s.present],
        present: next,
        future: s.future.slice(1),
      }
    })
  }, [])

  return {
    state: h.present,
    set,
    snapshot,
    reset,
    undo,
    redo,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
  }
}
