/**
 * Tiny in-memory ring buffer for app log entries.
 * Not persisted — cleared on reload. Used by the system menu's ログ dialog.
 */

export interface LogEntry {
  /** Epoch ms. Captured by logEvent at call time (browser only). */
  ts: number
  msg: string
}

const MAX_ENTRIES = 200

const buffer: LogEntry[] = []
const listeners = new Set<() => void>()

// Cached, referentially-stable snapshot (newest first). Rebuilt only on change so
// it is safe to use directly with useSyncExternalStore.
let snapshot: LogEntry[] = []

function notify(): void {
  snapshot = [...buffer].reverse()
  for (const fn of listeners) fn()
}

/** Append a log entry. Newest entries are kept; oldest are dropped past the cap. */
export function logEvent(msg: string): void {
  buffer.push({ ts: Date.now(), msg })
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES)
  }
  notify()
}

/** Stable snapshot of current log entries, newest first. */
export function getLogs(): LogEntry[] {
  return snapshot
}

/** Subscribe to log changes. Returns an unsubscribe function. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Clear all log entries (used when wiping app data). */
export function clearLogs(): void {
  buffer.length = 0
  notify()
}
