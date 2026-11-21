import { CapabilityRegistry, type CapabilityDescriptor } from '../capabilities/registry.ts'
import type { ExecutableTool, ToolResult } from '../tools/tool.ts'
import { Workspace } from './workspace.ts'
import { requireValidJsonSchema } from '../capabilities/schema.ts'

export interface PolicyGrant { readonly capability: string; readonly permission?: 'allow' | 'deny' }
export interface ToolProposal { readonly callId: string; readonly capability: CapabilityDescriptor; readonly arguments: Record<string, unknown>; readonly source: 'user' | 'model' | 'workflow' }

export class PolicyBroker {
  readonly #workspace: Workspace
  readonly #grants: readonly PolicyGrant[]
  readonly #registry?: CapabilityRegistry

  constructor(options: Readonly<{ workspace: Workspace; grants?: readonly PolicyGrant[]; registry?: CapabilityRegistry }>) {
    this.#workspace = options.workspace
    this.#grants = Object.freeze([...(options.grants ?? [])])
    this.#registry = options.registry
  }

  async execute(proposal: ToolProposal, tool: ExecutableTool<unknown, unknown>, context: Readonly<{ runId: string; signal?: AbortSignal }>): Promise<ToolResult> {
    const started = performance.now()
    const base = { callId: proposal.callId, durationMs: 0, truncated: false, artifactRefs: [] as readonly string[] }
    try {
      if (!sameCapability(proposal.capability, tool.descriptor)) return deny(base, 'capability_mismatch', started)
      if (this.#registry) {
        const digest = proposal.capability.digest
        if (!digest) return deny(base, 'capability_mismatch', started)
        try {
          const registered = this.#registry.resolve(proposal.capability.id, proposal.capability.version, digest)
          if (!sameCapability(registered, tool.descriptor)) return deny(base, 'capability_mismatch', started)
        } catch { return deny(base, 'capability_mismatch', started) }
      }
      requireValidJsonSchema(proposal.arguments, tool.descriptor.inputSchema, 'tool input')
      const grant = this.#grants.find((entry) => entry.capability === proposal.capability.id)
      if (!grant || grant.permission === 'deny') return { ...base, status: 'denied', error: { code: 'approval_required', message: 'no matching explicit grant' }, durationMs: performance.now() - started }
      for (const scope of proposal.capability.permissions.read) if (scope !== 'workspace') return deny(base, 'unsupported_read_scope', started)
      for (const scope of proposal.capability.permissions.write) if (scope !== 'workspace') return deny(base, 'unsupported_write_scope', started)
      if (proposal.capability.permissions.network.length > 0) return deny(base, 'network_denied', started)
      const pathValue = proposal.arguments.path
      if (typeof pathValue === 'string') await this.#workspace.resolve(pathValue, proposal.capability.permissions.write.includes('workspace'))
      const output = await tool.execute(proposal.arguments, { signal: context.signal, callId: proposal.callId })
      return { ...base, status: 'ok', output, durationMs: performance.now() - started }
    } catch (error) {
      const stale = error instanceof Error && /stale/i.test(error.message)
      return { ...base, status: stale ? 'stale_precondition' : 'execution_error', error: { code: stale ? 'stale_precondition' : 'execution_failed', message: safeMessage(error) }, durationMs: performance.now() - started }
    }
  }
}

function sameCapability(left: CapabilityDescriptor, right: CapabilityDescriptor): boolean {
  return left.id === right.id && left.version === right.version &&
    stable(left.inputSchema) === stable(right.inputSchema) &&
    stable(left.outputSchema) === stable(right.outputSchema) &&
    stable(left.permissions) === stable(right.permissions) &&
    stable(left.limits) === stable(right.limits) &&
    stable(left.implementation) === stable(right.implementation)
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (typeof value === 'object' && value !== null) return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`
  return JSON.stringify(value)
}

function deny<T extends { readonly callId: string; readonly durationMs: number }>(base: T, code: string, started: number): ToolResult { return { ...base, callId: base.callId, status: 'denied', error: { code, message: 'policy denied capability' }, truncated: false, artifactRefs: [], durationMs: performance.now() - started } }
function safeMessage(error: unknown): string { return error instanceof Error ? error.message : 'execution failed' }
