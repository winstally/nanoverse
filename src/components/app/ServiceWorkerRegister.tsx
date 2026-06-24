'use client'

import { useEffect } from 'react'

/**
 * Registers the offline service worker. Production only — in `pnpm dev` the
 * Turbopack chunks change constantly, so caching them would serve stale code.
 * Use `pnpm build && pnpm start` to get the installable, offline-capable app.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failures are non-fatal — the app still works online.
    })
  }, [])
  return null
}
