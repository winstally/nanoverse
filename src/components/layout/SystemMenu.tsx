'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  APP_NAME,
  APP_DESCRIPTION,
  APP_VERSION,
  GITHUB_URL,
  LICENSE_NAME,
} from '@/lib/app-meta'
import {
  exportAllData,
  importAllData,
  clearAllData,
  storageEstimate,
} from '@/lib/storage'
import { downloadBlob } from '@/lib/download'
import { getLogs, logEvent, subscribe, clearLogs, type LogEntry } from '@/lib/log'
import { cn } from '@/lib/utils'
import { Download, Upload, Trash2, ExternalLink, Languages, Check, Settings } from 'lucide-react'
import { useI18n } from '@/components/app/I18nProvider'

// Stable empty array for the server snapshot of useSyncExternalStore.
const EMPTY_LOGS: LogEntry[] = []
const getServerLogs = (): LogEntry[] => EMPTY_LOGS

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  const value = bytes / Math.pow(1024, exp)
  return `${value.toFixed(value >= 10 || exp === 0 ? 0 : 1)} ${units[exp]}`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export interface SystemInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SystemInfoDialog({ open, onOpenChange }: SystemInfoDialogProps) {
  const { t } = useI18n()
  const [storage, setStorage] = React.useState<{ usage: number; quota: number } | null>(
    null
  )

  // Live log entries from the in-memory store (stable snapshots).
  const logs = React.useSyncExternalStore(
    subscribe,
    getLogs,
    getServerLogs
  )

  // Refresh storage estimate when the info dialog opens.
  React.useEffect(() => {
    if (!open) return
    let alive = true
    storageEstimate().then((s) => {
      if (alive) setStorage(s)
    })
    return () => {
      alive = false
    }
  }, [open])

  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {APP_NAME}{' '}
              <span className="tnum align-middle text-sm font-normal text-muted-foreground">
                v{APP_VERSION}
              </span>
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              {APP_DESCRIPTION}
            </DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t('system.info.license')}</dt>
            <dd>{LICENSE_NAME}</dd>
            <dt className="text-muted-foreground">{t('system.info.storage')}</dt>
            <dd className="tnum">
              {storage
                ? storage.quota > 0
                  ? `${formatBytes(storage.usage)} / ${formatBytes(storage.quota)}`
                  : formatBytes(storage.usage)
                : '—'}
            </dd>
          </dl>

          <div className="flex flex-col gap-1.5">
            <span className="eyebrow !text-muted-foreground">{t('system.info.logs')}</span>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-muted/40">
              {logs.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  {t('system.info.noLogs')}
                </p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {logs.map((entry, i) => (
                    <li
                      key={`${entry.ts}-${i}`}
                      className="flex gap-3 px-3 py-1.5"
                    >
                      <span className="tnum shrink-0 text-muted-foreground">
                        {formatTime(entry.ts)}
                      </span>
                      <span className="min-w-0 flex-1">{entry.msg}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter showCloseButton className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                window.open(GITHUB_URL, '_blank', 'noopener,noreferrer')
              }
            >
              <ExternalLink />
              GitHub
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  )
}

export interface SystemMenuProps {
  className?: string
}

export function SystemMenu({ className }: SystemMenuProps) {
  const { locale, setLocale, t } = useI18n()
  const [confirmClearOpen, setConfirmClearOpen] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  function handleExport() {
    exportAllData()
      .then((blob) => {
        downloadBlob(blob, `nanoverse-data-${crypto.randomUUID().slice(0, 8)}.json`)
        logEvent(t('system.toast.exported'))
        toast.success(t('system.toast.exported'))
      })
      .catch(() => {
        toast.error(t('system.toast.exportFailed'))
      })
  }

  function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    importAllData(file)
      .then((result) => {
        const msg = t('system.toast.imported', {
          masks: result.maskDocs,
          sessions: result.analyzeSessions,
        })
        logEvent(msg)
        toast.success(msg, {
          description:
            result.skipped > 0
              ? t('system.toast.importSkipped', { count: result.skipped })
              : undefined,
        })
      })
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : t('system.toast.importFailed')
        toast.error(t('system.toast.importFailed'), { description: reason })
      })
  }

  function handleClear() {
    clearAllData()
      .then(() => {
        clearLogs()
        logEvent(t('system.toast.cacheCleared'))
        toast.success(t('system.toast.cacheCleared'))
      })
      .catch(() => {
        toast.error(t('system.toast.deleteFailed'))
      })
      .finally(() => setConfirmClearOpen(false))
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${APP_NAME} ${t('system.menu.label')}`}
          title={t('system.menu.label')}
          className={cn(
            'flex size-9 items-center justify-center rounded-lg bg-white/10 text-white outline-none transition-colors hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-white/40 data-[popup-open]:bg-white/20',
            className
          )}
        >
          <Settings size={17} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t('system.menu.label')}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleExport}>
            <Download />
            {t('system.menu.export')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <Upload />
            {t('system.menu.import')}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmClearOpen(true)}
          >
            <Trash2 />
            {t('system.menu.clearCache')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t('system.menu.language')}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setLocale('ja')}>
              <Languages />
              {t('system.menu.japanese')}
              {locale === 'ja' && <Check className="ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocale('en')}>
              <Languages />
              {t('system.menu.english')}
              {locale === 'en' && <Check className="ml-auto" />}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileInputRef}
        type="file"
        aria-label={t('system.menu.import')}
        accept="application/json,.json"
        className="hidden"
        onChange={handleImport}
      />

      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('system.clear.title')}</DialogTitle>
            <DialogDescription>
              {t('system.clear.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmClearOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleClear}>
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
