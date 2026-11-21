import { createHash } from 'node:crypto'
import type { CapabilityDescriptor, CapabilityPermissions } from '../capabilities/registry.ts'
import type { TraceWriter } from '../capabilities/trace.ts'
import { requireValidJsonSchema } from '../capabilities/schema.ts'

export interface ToolResult {
  readonly callId: string
  readonly status: 'ok' | 'denied' | 'invalid_input' | 'invalid_output' | 'timeout' | 'cancelled' | 'execution_error' | 'stale_precondition'
  readonly output?: unknown
  readonly error?: Readonly<{ code: string; message: string }>
  readonly truncated: boolean
  readonly durationMs: number
  readonly artifactRefs: readonly string[]
}

export interface ExecutableTool<Input = Record<string, unknown>, Output = unknown> {
  readonly descriptor: CapabilityDescriptor
  execute(input: Input, context?: Readonly<{ signal?: AbortSignal; callId?: string }>): Promise<Output>
}

const DEFAULT_SCHEMA = { type: 'object', additionalProperties: true } as const
const DEFAULT_LIMITS = { timeoutMs: 5000, maxOutputBytes: 65536 } as const

export function createNativeTool<Input, Output>(
  id: string,
  implementation: (input: Input, context: Readonly<{ signal?: AbortSignal; callId?: string }>) => Promise<Output>,
  permissions: Partial<CapabilityPermissions> = {},
  options: Readonly<{ inputSchema?: Record<string, unknown>; outputSchema?: Record<string, unknown>; trace?: TraceWriter }> = {}
): ExecutableTool<Input, Output> {
  const [namespace] = id.split('/')
  const entry = `${namespace}.${id.split('/')[1].replaceAll('-', '_')}`
  const descriptor: CapabilityDescriptor = Object.freeze({
    protocolVersion: 1,
    id,
    version: '1.0.0',
    description: `Native ${id} capability`,
    inputSchema: options.inputSchema ?? { ...DEFAULT_SCHEMA },
    outputSchema: options.outputSchema ?? { ...DEFAULT_SCHEMA },
    permissions: { read: permissions.read ?? [], write: permissions.write ?? [], network: permissions.network ?? [], process: permissions.process ?? false },
    limits: { ...DEFAULT_LIMITS },
    implementation: { kind: 'native' as const, entry }
  })
  return {
    descriptor,
    async execute(input, context = {}) {
      requireValidJsonSchema(input, descriptor.inputSchema, 'tool input')
      const started = performance.now()
      await options.trace?.append('tool-start', { capability: id, inputHash: hash(input), callId: context.callId ?? null })
      try {
        const output = await implementation(input, context)
        requireValidJsonSchema(output, descriptor.outputSchema, 'tool output')
        await options.trace?.append('tool-result', { capability: id, durationMs: performance.now() - started, outputHash: hash(output) })
        return output
      } catch (error) {
        await options.trace?.append('tool-result', { capability: id, durationMs: performance.now() - started, error: error instanceof Error ? error.message : 'execution failed' })
        throw error
      }
    }
  }
}

function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
