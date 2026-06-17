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
import { getLogs, logEvent, subscribe, clearLogs, type LogEntry } from '@/lib/log'
import { cn } from '@/lib/utils'
import {
  Info,
  ScrollText,
  Download,
  Upload,
  Trash2,
  ExternalLink,
  FlaskConical,
} from 'lucide-react'

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

export interface SystemMenuProps {
  /** Extra classes for the trigger button (the rail brand icon). */
  className?: string
}

export function SystemMenu({ className }: SystemMenuProps) {
  const [aboutOpen, setAboutOpen] = React.useState(false)
  const [logOpen, setLogOpen] = React.useState(false)
  const [confirmClearOpen, setConfirmClearOpen] = React.useState(false)

  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const [storage, setStorage] = React.useState<{ usage: number; quota: number } | null>(
    null
  )

  // Live log entries from the in-memory store (stable snapshots).
  const logs = React.useSyncExternalStore(
    subscribe,
    getLogs,
    getServerLogs
  )

  // Refresh storage estimate when the About dialog opens.
  React.useEffect(() => {
    if (!aboutOpen) return
    let alive = true
    storageEstimate().then((s) => {
      if (alive) setStorage(s)
    })
    return () => {
      alive = false
    }
  }, [aboutOpen])

  function handleExport() {
    exportAllData()
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `nanoverse-data-${crypto.randomUUID().slice(0, 8)}.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        logEvent('データを書き出しました')
        toast.success('データを書き出しました')
      })
      .catch(() => {
        toast.error('書き出しに失敗しました')
      })
  }

  function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset so selecting the same file again still fires onChange.
    event.target.value = ''
    if (!file) return
    importAllData(file)
      .then((result) => {
        const msg = `${result.maskDocs} 件のマスク・${result.analyzeSessions} 件の解析データを読み込みました`
        logEvent(msg)
        toast.success(msg, {
          description:
            result.skipped > 0
              ? `${result.skipped} 件は形式が不正なため除外しました`
              : undefined,
        })
      })
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : '読み込みに失敗しました'
        toast.error('読み込みに失敗しました', { description: reason })
      })
  }

  function handleClear() {
    clearAllData()
      .then(() => {
        clearLogs()
        logEvent('キャッシュを削除しました')
        toast.success('キャッシュを削除しました')
      })
      .catch(() => {
        toast.error('削除に失敗しました')
      })
      .finally(() => setConfirmClearOpen(false))
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${APP_NAME} メニュー`}
          title={APP_NAME}
          className={cn(
            'flex size-9 items-center justify-center rounded-lg bg-white/10 text-white outline-none transition-colors hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-white/40 data-[popup-open]:bg-white/20',
            className
          )}
        >
          <FlaskConical size={17} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="end"
          className="w-56"
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {APP_NAME} v{APP_VERSION}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAboutOpen(true)}>
            <Info />
            バージョン情報
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLogOpen(true)}>
            <ScrollText />
            ログ
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleExport}>
            <Download />
            データを書き出す
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <Upload />
            データを読み込む
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmClearOpen(true)}
          >
            <Trash2 />
            キャッシュを削除
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              window.open(GITHUB_URL, '_blank', 'noopener,noreferrer')
            }
          >
            <ExternalLink />
            GitHub
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Hidden file input backing the "データを読み込む" menu item. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImport}
      />

      {/* About dialog */}
      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{APP_NAME}</DialogTitle>
            <DialogDescription>研究用ツール集</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">バージョン</dt>
            <dd className="tnum">{APP_VERSION}</dd>
            <dt className="text-muted-foreground">ライセンス</dt>
            <dd>{LICENSE_NAME}</dd>
            <dt className="text-muted-foreground">ストレージ使用量</dt>
            <dd className="tnum">
              {storage
                ? storage.quota > 0
                  ? `${formatBytes(storage.usage)} / ${formatBytes(storage.quota)}`
                  : formatBytes(storage.usage)
                : '—'}
            </dd>
          </dl>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      {/* Log dialog */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ログ</DialogTitle>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-muted/40">
            {logs.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                ログはありません
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
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      {/* Confirm clear dialog */}
      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>キャッシュを削除しますか？</DialogTitle>
            <DialogDescription>
              保存済みのすべてのマスクと解析データが削除されます。この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmClearOpen(false)}
            >
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleClear}>
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
