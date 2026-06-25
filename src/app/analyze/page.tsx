import AnalyzeToolPage from '@/modules/analyze/AnalyzeToolPage'

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>
}) {
  const params = await searchParams
  return <AnalyzeToolPage initialProjectId={firstParam(params.project)} />
}
