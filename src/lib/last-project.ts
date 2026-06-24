'use client'

/**
 * Remembers the last-opened project per tool (mask / analyze) so switching tabs
 * resumes where you left off instead of starting a blank project every time.
 * A tiny UI preference — kept in localStorage, not the IndexedDB data store.
 */

export type ToolKey = 'mask' | 'analyze'

const storageKey = (tool: ToolKey) => `nanoverse:lastProject:${tool}`

export function getLastProjectId(tool: ToolKey): string | null {
  try {
    return localStorage.getItem(storageKey(tool))
  } catch {
    return null
  }
}

export function setLastProjectId(tool: ToolKey, id: string | null): void {
  try {
    if (id) localStorage.setItem(storageKey(tool), id)
    else localStorage.removeItem(storageKey(tool))
  } catch {
    // Private mode / disabled storage — resume just won't persist.
  }
}
