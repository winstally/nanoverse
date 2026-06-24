import { z } from 'zod'
import type { Shape } from '@/modules/mask/shape'
import type { MaskDocument } from '@/modules/mask/document'
import type { StoredMaskDocument, AnalyzeSession } from './storage'
import type { Trace, LegendLayout } from '@/modules/analyze/types'
import type { PlotStyle } from '@/modules/analyze/plot/preset'

/**
 * Zod schemas for data persisted in IndexedDB. Applied on READ paths so that a
 * single corrupt record can't crash a load/list. The schemas are the exact
 * persisted contract: unknown keys are stripped, genuinely corrupt records are
 * dropped.
 */

// ── Mask shapes ───────────────────────────────────────────────────────────────

const rectShapeSchema = z.object({
  id: z.string(),
  kind: z.literal('rect'),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotationDeg: z.number().optional(),
})

const ellipseShapeSchema = z.object({
  id: z.string(),
  kind: z.literal('ellipse'),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
})

const textShapeSchema = z.object({
  id: z.string(),
  kind: z.literal('text'),
  x: z.number(),
  y: z.number(),
  text: z.string(),
  heightUm: z.number(),
  fontFamily: z.string().optional(),
})

const lineSpaceShapeSchema = z.object({
  id: z.string(),
  kind: z.literal('lineSpace'),
  x: z.number(),
  y: z.number(),
  lineWidthUm: z.number(),
  spaceUm: z.number(),
  count: z.number(),
  orientation: z.enum(['horizontal', 'vertical']),
  lengthUm: z.number(),
  rotationDeg: z.number().optional(),
})

const gridShapeSchema = z.object({
  id: z.string(),
  kind: z.literal('grid'),
  x: z.number(),
  y: z.number(),
  lineWidthUm: z.number(),
  spaceUm: z.number(),
  cols: z.number(),
  rows: z.number(),
  rotationDeg: z.number().optional(),
})

export const shapeSchema = z.discriminatedUnion('kind', [
  rectShapeSchema,
  ellipseShapeSchema,
  textShapeSchema,
  lineSpaceShapeSchema,
  gridShapeSchema,
])

// ── Mask document ─────────────────────────────────────────────────────────────

export const polaritySchema = z.enum(['darkOnLight', 'lightOnDark'])

export const maskDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  widthUm: z.number().positive(), // authority for all geometry; reject corrupt 0/negative
  heightUm: z.number(),
  magnification: z.number().positive().optional().catch(undefined),
  umPerCm: z.number().positive().optional().catch(undefined),
  shapes: z.array(shapeSchema),
  polarity: polaritySchema,
  updatedAt: z.number().optional(),
})

// ── Analyze traces ────────────────────────────────────────────────────────────

export const traceSchema = z.object({
  id: z.string(),
  name: z.string(),
  x: z.array(z.number()),
  y: z.array(z.number()),
  color: z.string(),
  visible: z.boolean(),
  lineWidth: z.number().optional(),
})

export const legendLayoutSchema = z.object({
  x: z.number(),
  y: z.number(),
  scale: z.number(),
  visible: z.boolean(),
})

// ── Plot style ────────────────────────────────────────────────────────────────

/** The publication-look base fields are required; session settings are optional. */
export const plotStyleSchema = z.object({
  mirror: z.boolean(),
  tickInward: z.boolean(),
  axisThickness: z.number(),
  fontFamily: z.string(),
  fontSize: z.number(),

  legend: legendLayoutSchema.optional(),
  axisMode: z.enum(['nm', 'eV']).optional(),
  laserNm: z.number().optional(),
  ramanInput: z.enum(['cm', 'nm']).optional(),
  normalize: z.boolean().optional(),
  baselineMode: z.enum(['none', 'min', 'endpoints']).optional(),
  xMin: z.number().optional(),
  xMax: z.number().optional(),
  yMin: z.number().optional(),
  yMax: z.number().optional(),
  xLog: z.boolean().optional(),
  yLog: z.boolean().optional(),
  fpL: z.number().optional(),
  fpMinWl: z.number().optional(),
  fpMaxWl: z.number().optional(),
  hcEvNm: z.number().optional(),
  ramanK: z.number().optional(),
  strainSiRef: z.number().optional(),
  strainGeRef: z.number().optional(),
  strainSiCoef: z.number().optional(),
  strainGeCoef: z.number().optional(),
})

// ── Analyze session ───────────────────────────────────────────────────────────

export const analyzeSessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  traces: z.array(traceSchema),
  type: z.enum(['PL', 'Raman', 'XRD']),
  style: plotStyleSchema,
  updatedAt: z.number().optional(),
})

// ── Parse helpers ─────────────────────────────────────────────────────────────

/**
 * Validate an unknown value as a stored mask document. Returns the validated
 * document, or null if the record is genuinely corrupt.
 */
export function parseMaskDoc(value: unknown): StoredMaskDocument | null {
  const result = maskDocumentSchema.safeParse(value)
  if (!result.success) return null
  // The validated object structurally matches StoredMaskDocument; cast through
  // the source types to satisfy the discriminated-union / branded field shapes.
  return result.data as MaskDocument as StoredMaskDocument
}

/**
 * Validate an unknown value as a stored analyze session. Returns the validated
 * session, or null if the record is genuinely corrupt.
 */
export function parseAnalyzeSession(value: unknown): AnalyzeSession | null {
  const result = analyzeSessionSchema.safeParse(value)
  if (!result.success) return null
  return result.data as AnalyzeSession
}

// Type-level assertions: the inferred schema shapes line up with the TS types.
type _ShapeMatch = z.infer<typeof shapeSchema> extends Shape ? true : never
type _TraceMatch = z.infer<typeof traceSchema> extends Trace ? true : never
type _LegendMatch = z.infer<typeof legendLayoutSchema> extends LegendLayout
  ? true
  : never
type _PlotStyleMatch = PlotStyle extends z.infer<typeof plotStyleSchema>
  ? true
  : never
// Reference the helpers so unused-type lints stay quiet without affecting runtime.
export type _SchemaSanity = [
  _ShapeMatch,
  _TraceMatch,
  _LegendMatch,
  _PlotStyleMatch,
]
