import MaskToolPage from '@/modules/mask/MaskToolPage'

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default async function LaserWritingPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>
}) {
  const params = await searchParams
  return <MaskToolPage mode="gds" initialProjectId={firstParam(params.project)} />
}
