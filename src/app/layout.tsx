import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import './globals.css'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from '@/components/app/ServiceWorkerRegister'
import { I18nProvider } from '@/components/app/I18nProvider'
import { WebMcpRegister } from '@/components/app/WebMcpRegister'

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'nanoverse',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'nanoverse',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/nanoverse-icon.png?v=nanoverse-icon-20260625', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      {
        url: '/nanoverse-icon.png?v=nanoverse-icon-20260625',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0d0e10',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja" className={cn("font-sans", geist.variable)}>
      <body>
        <TooltipProvider>
          <I18nProvider>
            <AppShell>{children}</AppShell>
          </I18nProvider>
        </TooltipProvider>
        <Toaster />
        <ServiceWorkerRegister />
        <Suspense fallback={null}>
          <WebMcpRegister />
        </Suspense>
      </body>
    </html>
  )
}
