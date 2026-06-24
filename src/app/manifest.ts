import type { MetadataRoute } from 'next'

/** PWA manifest — makes nanoverse installable and launchable as a standalone app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'nanoverse — マスク設計 & スペクトル解析',
    short_name: 'nanoverse',
    description:
      'DMD マスクレス露光のマスク設計と PL / Raman / XRD スペクトル解析をブラウザだけで。データは端末内（IndexedDB）に保存され、外部に送信されません。',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0d0e10',
    theme_color: '#0d0e10',
    orientation: 'any',
    lang: 'ja',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
