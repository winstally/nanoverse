import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { MaskDocument } from '@/modules/mask/document'
import type { Trace, MeasurementType } from '@/modules/analyze/types'
import type { PlotStyle } from '@/modules/analyze/plot/preset'
import { parseMaskDoc, parseAnalyzeSession } from './schemas'

export interface AnalyzeSession {
  id: string
  name: string
  traces: Trace[]
  type: MeasurementType
  style: PlotStyle
  /** Epoch ms of the last save, written by the caller. */
  updatedAt?: number
}

/** A MaskDocument augmented with persistence metadata. */
export type StoredMaskDocument = MaskDocument & {
  /** Epoch ms of the last save, written by the caller. */
  updatedAt?: number
}

interface LabToolsDB extends DBSchema {
  maskDocs: {
    key: string
    value: StoredMaskDocument
    indexes: { updatedAt: number }
  }
  analyzeSessions: {
    key: string
    value: AnalyzeSession
    indexes: { updatedAt: number }
  }
}

const DB_NAME = 'lab-tools'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase<LabToolsDB>> | null = null

function getDb(): Promise<IDBPDatabase<LabToolsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<LabToolsDB>(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, tx) {
        // Create stores if missing (fresh DB).
        const maskStore = db.objectStoreNames.contains('maskDocs')
          ? tx.objectStore('maskDocs')
          : db.createObjectStore('maskDocs', { keyPath: 'id' })
        const analyzeStore = db.objectStoreNames.contains('analyzeSessions')
          ? tx.objectStore('analyzeSessions')
          : db.createObjectStore('analyzeSessions', { keyPath: 'id' })

        // Add the updatedAt index introduced in v2 (handle existing stores gracefully).
        if (!maskStore.indexNames.contains('updatedAt')) {
          maskStore.createIndex('updatedAt', 'updatedAt')
        }
        if (!analyzeStore.indexNames.contains('updatedAt')) {
          analyzeStore.createIndex('updatedAt', 'updatedAt')
        }
      },
    })
  }
  return dbPromise
}

/** Sort a list of records by updatedAt descending (records without updatedAt sink to the bottom). */
function byUpdatedAtDesc<T extends { updatedAt?: number }>(records: T[]): T[] {
  return records.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

// ── Mask documents ──────────────────────────────────────────────────────────

export async function saveMaskDoc(
  doc: MaskDocument,
  updatedAt: number = Date.now()
): Promise<void> {
  const db = await getDb()
  await db.put('maskDocs', { ...doc, updatedAt })
}

export async function listMaskDocs(): Promise<StoredMaskDocument[]> {
  const db = await getDb()
  const all = await db.getAll('maskDocs')
  // Validate each record; drop genuinely corrupt ones so the list can't crash.
  const valid = all
    .map((rec) => parseMaskDoc(rec))
    .filter((rec): rec is StoredMaskDocument => rec !== null)
  return byUpdatedAtDesc(valid)
}

export async function loadMaskDoc(
  id: string
): Promise<StoredMaskDocument | undefined> {
  const db = await getDb()
  const rec = await db.get('maskDocs', id)
  if (rec === undefined) return undefined
  return parseMaskDoc(rec) ?? undefined
}

export async function deleteMaskDoc(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('maskDocs', id)
}

// ── Analyze sessions ────────────────────────────────────────────────────────

export async function saveAnalyzeSession(
  s: AnalyzeSession,
  updatedAt: number = Date.now()
): Promise<void> {
  const db = await getDb()
  await db.put('analyzeSessions', { ...s, updatedAt })
}

export async function listAnalyzeSessions(): Promise<AnalyzeSession[]> {
  const db = await getDb()
  const all = await db.getAll('analyzeSessions')
  // Validate each record; drop genuinely corrupt ones so the list can't crash.
  const valid = all
    .map((rec) => parseAnalyzeSession(rec))
    .filter((rec): rec is AnalyzeSession => rec !== null)
  return byUpdatedAtDesc(valid)
}

export async function loadAnalyzeSession(
  id: string
): Promise<AnalyzeSession | undefined> {
  const db = await getDb()
  const rec = await db.get('analyzeSessions', id)
  if (rec === undefined) return undefined
  return parseAnalyzeSession(rec) ?? undefined
}

export async function deleteAnalyzeSession(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('analyzeSessions', id)
}

// ── Bulk data management ────────────────────────────────────────────────────

/** Serialize both object stores into a single JSON Blob (application/json). */
export async function exportAllData(): Promise<Blob> {
  const db = await getDb()
  const [maskDocs, analyzeSessions] = await Promise.all([
    db.getAll('maskDocs'),
    db.getAll('analyzeSessions'),
  ])
  const payload = {
    app: 'nanoverse',
    schema: DB_VERSION,
    maskDocs,
    analyzeSessions,
  }
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
}

export interface ImportResult {
  maskDocs: number
  analyzeSessions: number
  skipped: number
}

/**
 * Read a previously exported JSON blob/file and merge its records into the
 * object stores. Records are validated with the same lenient schemas used on the
 * read path; genuinely corrupt records are skipped (counted in `skipped`).
 * Existing records with the same id are overwritten (put semantics).
 */
export async function importAllData(file: Blob | string): Promise<ImportResult> {
  const text = typeof file === 'string' ? file : await file.text()

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error('JSON として解釈できませんでした')
  }

  if (payload === null || typeof payload !== 'object') {
    throw new Error('対応していないファイル形式です')
  }

  const record = payload as {
    maskDocs?: unknown
    analyzeSessions?: unknown
  }
  const rawMasks = Array.isArray(record.maskDocs) ? record.maskDocs : []
  const rawSessions = Array.isArray(record.analyzeSessions)
    ? record.analyzeSessions
    : []

  if (rawMasks.length === 0 && rawSessions.length === 0) {
    throw new Error('読み込めるデータが含まれていません')
  }

  let skipped = 0
  const masks: StoredMaskDocument[] = []
  for (const raw of rawMasks) {
    const parsed = parseMaskDoc(raw)
    if (parsed) masks.push(parsed)
    else skipped++
  }
  const sessions: AnalyzeSession[] = []
  for (const raw of rawSessions) {
    const parsed = parseAnalyzeSession(raw)
    if (parsed) sessions.push(parsed)
    else skipped++
  }

  const db = await getDb()
  const tx = db.transaction(['maskDocs', 'analyzeSessions'], 'readwrite')
  const maskStore = tx.objectStore('maskDocs')
  const analyzeStore = tx.objectStore('analyzeSessions')
  await Promise.all([
    ...masks.map((m) => maskStore.put(m)),
    ...sessions.map((s) => analyzeStore.put(s)),
    tx.done,
  ])

  return {
    maskDocs: masks.length,
    analyzeSessions: sessions.length,
    skipped,
  }
}

/** Clear both object stores. */
export async function clearAllData(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['maskDocs', 'analyzeSessions'], 'readwrite')
  await Promise.all([
    tx.objectStore('maskDocs').clear(),
    tx.objectStore('analyzeSessions').clear(),
    tx.done,
  ])
}

/** Best-effort storage usage estimate. Returns zeros when the API is unavailable (SSR / unsupported). */
export async function storageEstimate(): Promise<{
  usage: number
  quota: number
}> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.storage ||
    typeof navigator.storage.estimate !== 'function'
  ) {
    return { usage: 0, quota: 0 }
  }
  const est = await navigator.storage.estimate()
  return { usage: est.usage ?? 0, quota: est.quota ?? 0 }
}
