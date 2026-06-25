'use client'

import * as React from 'react'
import { downloadBlob } from '@/lib/download'
import { APP_DESCRIPTION, APP_NAME, APP_VERSION } from '@/lib/app-meta'
import {
  clearAllData,
  exportAllData,
  importAllData,
  listAnalyzeSessions,
  listMaskDocs,
  loadAnalyzeSession,
  loadMaskDoc,
} from '@/lib/storage'
import { dispatchWebMcpAction } from '@/lib/webmcp-actions'

type PatternToolKind = 'maskless' | 'laserWriting'
type AppToolKind = PatternToolKind | 'analyze'
type ProjectListKind = AppToolKind | 'all'

const TOOL_DESCRIPTIONS = {
  maskless:
    'DMD maskless exposure pattern design. Saved projects contain BMP projection metadata and local shape geometry.',
  laserWriting:
    'Laser writing layout design. Saved projects contain GDS chip metadata and local shape geometry.',
  analyze:
    'Spectrum analysis for PL, Raman, and XRD traces. Saved projects contain local trace metadata and analysis settings.',
} as const

function getModelContext(): ModelContext | null {
  return document.modelContext ?? null
}

function parseToolKind(value: unknown): AppToolKind | null {
  return value === 'maskless' || value === 'laserWriting' || value === 'analyze'
    ? value
    : null
}

function parseListKind(value: unknown): ProjectListKind | null {
  if (value === undefined) return 'all'
  return value === 'maskless' ||
    value === 'laserWriting' ||
    value === 'analyze' ||
    value === 'all'
    ? value
    : null
}

function parseProjectId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 256) return null
  return trimmed
}

function navigateTo(path: string): void {
  window.location.assign(path)
}

function currentContext() {
  const url = new URL(window.location.href)
  const path = url.pathname
  const activeTool: AppToolKind | null = path.startsWith('/maskless-aligner')
    ? 'maskless'
    : path.startsWith('/laser-writing')
      ? 'laserWriting'
      : path.startsWith('/analyze')
        ? 'analyze'
        : null

  return {
    app: {
      name: APP_NAME,
      version: APP_VERSION,
      description: APP_DESCRIPTION,
    },
    route: {
      path,
      activeTool,
      projectId: url.searchParams.get('project'),
    },
    tools: [
      {
        kind: 'maskless',
        path: '/maskless-aligner',
        description: TOOL_DESCRIPTIONS.maskless,
      },
      {
        kind: 'laserWriting',
        path: '/laser-writing',
        description: TOOL_DESCRIPTIONS.laserWriting,
      },
      {
        kind: 'analyze',
        path: '/analyze',
        description: TOOL_DESCRIPTIONS.analyze,
      },
    ],
    webmcp: {
      secureContext: window.isSecureContext,
      crossOriginIsolated: window.crossOriginIsolated,
    },
  }
}

async function blobText(blob: Blob): Promise<string> {
  return blob.text()
}

async function listProjects(kind: ProjectListKind) {
  const includeMaskless = kind === 'all' || kind === 'maskless'
  const includeLaserWriting = kind === 'all' || kind === 'laserWriting'
  const includeAnalyze = kind === 'all' || kind === 'analyze'
  const includeMasks = includeMaskless || includeLaserWriting
  const [maskDocs, analyzeSessions] = await Promise.all([
    includeMasks ? listMaskDocs() : Promise.resolve([]),
    includeAnalyze ? listAnalyzeSessions() : Promise.resolve([]),
  ])
  const masklessDocs = includeMaskless
    ? maskDocs.filter((doc) => doc.target === 'bmp')
    : []
  const laserWritingDocs = includeLaserWriting
    ? maskDocs.filter((doc) => doc.target === 'gds')
    : []
  const summarizePatternDoc = (doc: (typeof maskDocs)[number]) => ({
    id: doc.id,
    name: doc.name,
    updatedAt: doc.updatedAt ?? null,
    shapeCount: doc.shapes.length,
    widthUm: doc.widthUm,
    heightUm: doc.heightUm,
    polarity: doc.polarity,
  })

  return {
    maskless: masklessDocs.map(summarizePatternDoc),
    laserWriting: laserWritingDocs.map(summarizePatternDoc),
    analyze: analyzeSessions.map((session) => ({
      id: session.id,
      name: session.name,
      updatedAt: session.updatedAt ?? null,
      traceCount: session.traces.length,
      measurementType: session.type,
    })),
  }
}

async function getProjectSummary(kind: AppToolKind, projectId: string) {
  if (kind === 'maskless' || kind === 'laserWriting') {
    const doc = await loadMaskDoc(projectId)
    const expectedTarget = kind === 'laserWriting' ? 'gds' : 'bmp'
    if (!doc || doc.target !== expectedTarget) {
      return { found: false, kind, projectId }
    }
    return {
      found: true,
      kind,
      id: doc.id,
      name: doc.name,
      updatedAt: doc.updatedAt ?? null,
      shapeCount: doc.shapes.length,
      widthUm: doc.widthUm,
      heightUm: doc.heightUm,
      magnification: doc.magnification,
      umPerCm: doc.umPerCm,
      polarity: doc.polarity,
      shapeTypes: doc.shapes.reduce<Record<string, number>>((counts, shape) => {
        counts[shape.kind] = (counts[shape.kind] ?? 0) + 1
        return counts
      }, {}),
    }
  }

  const session = await loadAnalyzeSession(projectId)
  if (!session) return { found: false, kind, projectId }
  return {
    found: true,
    kind,
    id: session.id,
    name: session.name,
    updatedAt: session.updatedAt ?? null,
    measurementType: session.type,
    traceCount: session.traces.length,
    visibleTraceCount: session.traces.filter((trace) => trace.visible).length,
    axisMode: session.style?.axisMode ?? null,
    normalize: session.style?.normalize ?? null,
    baselineMode: session.style?.baselineMode ?? null,
  }
}

export function WebMcpRegister() {
  React.useEffect(() => {
    const modelContext = getModelContext()
    if (!modelContext) return

    const controller = new AbortController()
    const options = { signal: controller.signal }
    const register = (tool: ModelContextTool) => {
      try {
        const registered = modelContext.registerTool(tool, options)
        if (registered && typeof registered.catch === 'function') {
          void registered.catch(() => {
            // WebMCP is experimental; duplicate registration during dev/HMR or
            // unavailable origin-trial capabilities should not affect the app UI.
          })
        }
      } catch {
        // WebMCP registration failure should not affect the app UI.
      }
    }

    register({
      name: 'nanoverse.get_context',
      title: 'Get nanoverse context',
      description:
        'Return the current nanoverse app context, active route, available research tools, and WebMCP readiness flags.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
      },
      execute: async () => currentContext(),
    })

    register({
      name: 'nanoverse.list_projects',
      title: 'List local projects',
      description:
        'List local nanoverse projects saved in this browser IndexedDB. Returns metadata only, not full trace arrays or full mask geometry.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
              enum: ['all', 'maskless', 'laserWriting', 'analyze'],
            description:
              'Which project type to list. Use all when the user has not specified a tool.',
          },
        },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: true,
      },
      execute: async (input) => {
        const kind = parseListKind((input as { kind?: unknown }).kind)
        if (!kind) {
          return {
            error:
              'Invalid kind. Expected all, maskless, laserWriting, or analyze.',
          }
        }
        return listProjects(kind)
      },
    })

    register({
      name: 'nanoverse.get_project_summary',
      title: 'Get project summary',
      description:
        'Return a safe metadata summary for one local nanoverse project by tool kind and project id.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
              enum: ['maskless', 'laserWriting', 'analyze'],
            description: 'The nanoverse tool that owns the project.',
          },
          projectId: {
            type: 'string',
            minLength: 1,
            maxLength: 256,
            description: 'The project id from nanoverse.list_projects.',
          },
        },
        required: ['kind', 'projectId'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: true,
      },
      execute: async (input) => {
        const record = input as { kind?: unknown; projectId?: unknown }
        const kind = parseToolKind(record.kind)
        const projectId = parseProjectId(record.projectId)
        if (!kind || !projectId) {
          return {
            error:
              'Invalid input. Expected kind to be maskless, laserWriting, or analyze and projectId to be a non-empty string.',
          }
        }
        return getProjectSummary(kind, projectId)
      },
    })

    register({
      name: 'nanoverse.open_tool',
      title: 'Open nanoverse tool',
      description:
        'Navigate the visible nanoverse UI to maskless exposure, laser writing, or spectrum analysis.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['maskless', 'laserWriting', 'analyze'],
            description: 'The tool to open in the current browser tab.',
          },
        },
        required: ['kind'],
        additionalProperties: false,
      },
      execute: async (input) => {
        const kind = parseToolKind((input as { kind?: unknown }).kind)
        if (!kind) {
          return { error: 'Invalid kind. Expected maskless, laserWriting, or analyze.' }
        }
        const path =
          kind === 'maskless'
            ? '/maskless-aligner'
            : kind === 'laserWriting'
              ? '/laser-writing'
              : '/analyze'
        navigateTo(path)
        return { opened: true, kind, path }
      },
    })

    register({
      name: 'nanoverse.open_project',
      title: 'Open local project',
      description:
        'Navigate the visible nanoverse UI to a saved local project. The project id must come from nanoverse.list_projects.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
              enum: ['maskless', 'laserWriting', 'analyze'],
            description: 'The nanoverse tool that owns the project.',
          },
          projectId: {
            type: 'string',
            minLength: 1,
            maxLength: 256,
            description: 'The project id from nanoverse.list_projects.',
          },
        },
        required: ['kind', 'projectId'],
        additionalProperties: false,
      },
      annotations: {
        untrustedContentHint: true,
      },
      execute: async (input) => {
        const record = input as { kind?: unknown; projectId?: unknown }
        const kind = parseToolKind(record.kind)
        const projectId = parseProjectId(record.projectId)
        if (!kind || !projectId) {
          return {
            error:
              'Invalid input. Expected kind to be maskless, laserWriting, or analyze and projectId to be a non-empty string.',
          }
        }

        const basePath =
          kind === 'maskless'
            ? '/maskless-aligner'
            : kind === 'laserWriting'
              ? '/laser-writing'
              : '/analyze'
        if (kind === 'maskless' || kind === 'laserWriting') {
          const project = await loadMaskDoc(projectId)
          if (!project || project.target !== (kind === 'laserWriting' ? 'gds' : 'bmp')) {
            return { opened: false, kind, projectId, error: 'Not found' }
          }
        } else {
          const project = await loadAnalyzeSession(projectId)
          if (!project) return { opened: false, kind, projectId, error: 'Not found' }
        }
        const path = `${basePath}?project=${encodeURIComponent(projectId)}`
        navigateTo(path)
        return { opened: true, kind, projectId, path }
      },
    })

    register({
      name: 'nanoverse.pattern_action',
      title: 'Use pattern design features',
      description:
        'Run a pattern-design action in the visible nanoverse maskless exposure or laser writing tool. Supports project creation/rename/delete, calibration, polarity, shape add/update/delete/duplicate, and BMP/GDS export.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'get_state',
              'create_project',
              'rename_project',
              'delete_project',
              'import_file_base64',
              'set_calibration',
              'set_polarity',
              'add_shape',
              'update_shape',
              'delete_shape',
              'duplicate_shape',
              'export_bmp',
              'export_gds',
            ],
          },
          params: {
            type: 'object',
            description: 'Action-specific parameters.',
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      annotations: {
        untrustedContentHint: true,
      },
      execute: async (input) => {
        const { action, params } = input as {
          action?: unknown
          params?: unknown
        }
        if (typeof action !== 'string') {
          return { error: 'action must be a string' }
        }
        return dispatchWebMcpAction(`mask.${action}`, params ?? {})
      },
    })

    register({
      name: 'nanoverse.analyze_action',
      title: 'Use spectrum analysis features',
      description:
        'Run a spectrum-analysis action in the visible nanoverse analysis tool. Supports project creation/rename/delete, trace import/update/delete/reorder, plot/axis/fit settings, peak/FP fitting, and PNG/Igor PXP export. If the active route is not /analyze, call nanoverse.open_tool with kind=analyze first.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'get_state',
              'create_project',
              'rename_project',
              'delete_project',
              'import_trace_text',
              'update_settings',
              'update_trace',
              'delete_trace',
              'reorder_traces',
              'run_peak_fit',
              'run_fp_fit',
              'export_png',
              'export_pxp',
            ],
          },
          params: {
            type: 'object',
            description: 'Action-specific parameters.',
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      annotations: {
        untrustedContentHint: true,
      },
      execute: async (input) => {
        const { action, params } = input as {
          action?: unknown
          params?: unknown
        }
        if (typeof action !== 'string') {
          return { error: 'action must be a string' }
        }
        return dispatchWebMcpAction(`analyze.${action}`, params ?? {})
      },
    })

    register({
      name: 'nanoverse.export_all_data',
      title: 'Export all local data',
      description:
        'Export all local nanoverse IndexedDB data as JSON text. Optionally also downloads the JSON file in the visible browser.',
      inputSchema: {
        type: 'object',
        properties: {
          download: {
            type: 'boolean',
            description: 'Whether to trigger a browser download.',
          },
        },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: true,
      },
      execute: async (input) => {
        const blob = await exportAllData()
        const text = await blobText(blob)
        if ((input as { download?: unknown }).download === true) {
          downloadBlob(blob, 'nanoverse-data.json')
        }
        return { exported: true, bytes: blob.size, jsonText: text }
      },
    })

    register({
      name: 'nanoverse.import_all_data',
      title: 'Import all local data',
      description:
        'Import a nanoverse JSON data backup into local IndexedDB. Existing records with matching ids are overwritten.',
      inputSchema: {
        type: 'object',
        properties: {
          jsonText: {
            type: 'string',
            minLength: 1,
            description: 'The JSON text previously returned by export_all_data.',
          },
        },
        required: ['jsonText'],
        additionalProperties: false,
      },
      annotations: {
        untrustedContentHint: true,
      },
      execute: async (input) => {
        const text = (input as { jsonText?: unknown }).jsonText
        if (typeof text !== 'string' || text.trim().length === 0) {
          return { imported: false, error: 'jsonText must be a non-empty string' }
        }
        const result = await importAllData(text)
        return { imported: true, ...result }
      },
    })

    register({
      name: 'nanoverse.clear_all_data',
      title: 'Clear all local data',
      description:
        'Delete all saved local nanoverse masks and analysis sessions from IndexedDB. Requires confirm="CLEAR".',
      inputSchema: {
        type: 'object',
        properties: {
          confirm: {
            type: 'string',
            enum: ['CLEAR'],
            description: 'Must be exactly CLEAR.',
          },
        },
        required: ['confirm'],
        additionalProperties: false,
      },
      execute: async (input) => {
        if ((input as { confirm?: unknown }).confirm !== 'CLEAR') {
          return { cleared: false, error: 'confirm must be CLEAR' }
        }
        await clearAllData()
        return { cleared: true }
      },
    })

    return () => {
      controller.abort()
    }
  }, [])

  return null
}
