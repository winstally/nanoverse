'use client'

import { useEffect, useRef, useState } from 'react'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface UseAutosaveResult {
  status: AutosaveStatus
  /** Epoch ms of the last successful save, or null if never saved. */
  savedAt: number | null
}

export interface UseAutosaveOptions {
  /** Debounce delay in ms before saving. Default 800. */
  delay?: number
}

/**
 * Debounced autosave. Watches `value`; when it changes (after the initial mount),
 * it waits `delay` ms of quiet, then calls `save(value)` and tracks the status.
 *
 * The initial mount is skipped so loading an existing project does not immediately
 * re-save it.
 */
export function useAutosave<T>(
  value: T,
  save: (v: T) => Promise<void>,
  opts?: UseAutosaveOptions
): UseAutosaveResult {
  const delay = opts?.delay ?? 800

  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Keep the latest save callback without retriggering the debounce effect when it changes.
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  }, [save])

  // Skip the very first run (initial mount / loaded value).
  const isFirstRun = useRef(true)

  // Track the most recent save invocation so stale ones don't clobber status.
  const runIdRef = useRef(0)

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }

    const handle = setTimeout(() => {
      const runId = ++runIdRef.current
      setStatus('saving')
      saveRef
        .current(value)
        .then(() => {
          if (runId !== runIdRef.current) return
          setStatus('saved')
          setSavedAt(Date.now())
        })
        .catch(() => {
          if (runId !== runIdRef.current) return
          setStatus('error')
        })
    }, delay)

    return () => clearTimeout(handle)
  }, [value, delay])

  return { status, savedAt }
}
