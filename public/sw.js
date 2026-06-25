/*
 * nanoverse offline service worker.
 *
 * Runtime caching so the app keeps working with no network — and even with the
 * local server stopped — once it has been opened online at least once:
 *   - navigations  → network-first, fall back to cache (then to cached "/")
 *   - everything else (same-origin GET: _next chunks, fonts, icons, …)
 *                  → stale-while-revalidate
 * Data lives in IndexedDB (untouched here) and persists independently.
 */

const CACHE = 'nanoverse-v8'
const PRECACHE = ['/', '/mask', '/analyze']

self.addEventListener('install', (event) => {
  // Warm the cache with the app's routes so each tool opens offline even if it
  // wasn't the page first visited. Best-effort: install still succeeds offline.
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE)
        await cache.addAll(PRECACHE)
      } catch {
        // ignore — runtime caching will fill in what was reachable
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const [keys] = await Promise.all([caches.keys()])
      const deletes = []
      for (const key of keys) {
        if (key !== CACHE) deletes.push(caches.delete(key))
      }
      await Promise.all([...deletes, self.clients.claim()])
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // HTML navigations: prefer fresh, fall back to the cached page (or "/").
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          const cache = await caches.open(CACHE)
          cache.put(req, res.clone())
          return res
        } catch {
          const cache = await caches.open(CACHE)
          return (
            (await cache.match(req)) ||
            (await cache.match('/')) ||
            Response.error()
          )
        }
      })(),
    )
    return
  }

  // Assets (immutable _next chunks, fonts, icons): serve cache, refresh in bg.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const cached = await cache.match(req)
      const fromNetwork = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            cache.put(req, res.clone())
          }
          return res
        })
        .catch(() => cached)
      return cached || fromNetwork
    })(),
  )
})
