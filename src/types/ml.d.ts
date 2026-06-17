// Loose ambient module declarations for ml-* packages that ship no bundled TS types.
// Typed as `any` so tsc passes; the real shapes are exercised in src/modules/analyze/fit.ts.

declare module 'ml-gsd' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const gsd: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _default: any
  export default _default
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function optimizePeaks(...args: any[]): any
}

declare module 'ml-spectra-fitting' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function optimize(...args: any[]): any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _default: any
  export default _default
}

declare module 'ml-levenberg-marquardt' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const levenbergMarquardt: any
  export default levenbergMarquardt
}
