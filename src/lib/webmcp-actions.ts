export interface WebMcpActionRequest<TPayload = unknown> {
  type: string
  payload: TPayload
  handled: boolean
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

export const WEBMCP_ACTION_EVENT = 'nanoverse:webmcp-action'

export function dispatchWebMcpAction(
  type: string,
  payload: unknown,
  timeoutMs = 5000,
): Promise<unknown> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: unknown) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      resolve(value)
    }
    const timeout = window.setTimeout(() => {
      finish({ handled: false, error: `Timed out waiting for ${type}` })
    }, timeoutMs)

    const detail: WebMcpActionRequest = {
      type,
      payload,
      handled: false,
      resolve: (value) => finish(value),
      reject: (reason) =>
        finish({
          handled: true,
          error: reason instanceof Error ? reason.message : String(reason),
        }),
    }

    window.dispatchEvent(
      new CustomEvent<WebMcpActionRequest>(WEBMCP_ACTION_EVENT, { detail }),
    )

    if (!detail.handled) {
      finish({ handled: false, error: `No active handler for ${type}` })
    }
  })
}

export function summarizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
