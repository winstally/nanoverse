type JsonSchemaValue =
  | null
  | boolean
  | number
  | string
  | JsonSchemaValue[]
  | { [key: string]: JsonSchemaValue }

interface ToolAnnotations {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
}

interface ModelContextTool {
  name: string
  title?: string
  description: string
  inputSchema?: JsonSchemaValue
  execute: (input: object) => Promise<unknown>
  annotations?: ToolAnnotations
}

interface ModelContextRegisterToolOptions {
  signal?: AbortSignal
  exposedTo?: string[]
}

interface ModelContext extends EventTarget {
  registerTool(
    tool: ModelContextTool,
    options?: ModelContextRegisterToolOptions,
  ): Promise<void>
  ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null
}

interface Document {
  readonly modelContext?: ModelContext
}
