import type { Metadata, Viewport } from 'next'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { AppShell } from '@/components/layout/AppShell'
import './globals.css'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from '@/components/app/ServiceWorkerRegister'

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
    icon: '/icon-192.png',
    apple: '/icon-192.png',
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
          <NuqsAdapter>
            <AppShell>{children}</AppShell>
          </NuqsAdapter>
        </TooltipProvider>
        <Toaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
