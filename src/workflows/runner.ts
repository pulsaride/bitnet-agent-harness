import { randomUUID } from 'node:crypto'
import { TraceWriter } from '../capabilities/trace.ts'
import { JsonlSessionStore } from '../sessions/jsonl-store.ts'

export interface WorkflowDefinition {
  readonly id: string
  readonly version: string
  readonly inputs: Readonly<Record<string, unknown>>
  readonly steps: readonly { readonly id: string; readonly kind: 'tool'; readonly capability: string; readonly input: Record<string, unknown> }[]
  readonly acceptance: Readonly<{ all: readonly string[] }>
}
export interface WorkflowState { readonly runId: string; readonly status: 'created' | 'running' | 'waiting_approval' | 'checkpointed' | 'failed' | 'cancelled' | 'succeeded'; readonly outputs: readonly Record<string, unknown>[] }

export class WorkflowRunner {
  readonly #store: JsonlSessionStore

  constructor(options: Readonly<{ store: JsonlSessionStore }>) { this.#store = options.store }

  async run(workflow: WorkflowDefinition, _inputs: Readonly<Record<string, unknown>>, tools: Readonly<Record<string, (input: Record<string, unknown>) => Promise<Record<string, unknown>>>>): Promise<WorkflowState> {
    validateWorkflow(workflow)
    const runId = randomUUID()
    const trace = new TraceWriter({ runId, sink: (event) => this.#store.append(event) })
    await trace.append('run-started', { workflow: workflow.id, version: workflow.version })
    const outputs: Record<string, unknown>[] = []
    for (const step of workflow.steps) {
      const handler = tools[step.capability]
      if (!handler) { await trace.append('run-finished', { status: 'failed', reason: 'missing capability' }); return { runId, status: 'failed', outputs } }
      await trace.append('tool-proposed', { step: step.id, capability: step.capability })
      try { outputs.push(await handler({ ...step.input })) } catch { await trace.append('run-finished', { status: 'failed', reason: 'tool failed' }); return { runId, status: 'failed', outputs } }
      await trace.append('checkpoint', { step: step.id })
    }
    const status = workflow.acceptance.all.every((predicate) => evaluate(predicate, outputs)) ? 'succeeded' : 'failed'
    await trace.append('run-finished', { status })
    return { runId, status, outputs }
  }
}

function validateWorkflow(workflow: WorkflowDefinition): void {
  if (!/^\d+\.\d+\.\d+$/.test(workflow.version)) throw new Error('workflow version must be exact semver')
  const ids = workflow.steps.map((step) => step.id)
  if (new Set(ids).size !== ids.length) throw new Error('workflow contains duplicate step ids')
  if (workflow.steps.length > 100) throw new Error('workflow step budget exceeded')
  if (workflow.steps.some((step) => step.kind !== 'tool')) throw new Error('unsupported workflow step')
  if (workflow.acceptance.all.some((predicate) => !['testExitZero', 'allowedFilesOnly', 'evaluatorPass'].includes(predicate))) throw new Error('unsupported acceptance predicate')
}

function evaluate(predicate: string, outputs: readonly Record<string, unknown>[]): boolean {
  if (predicate === 'testExitZero') return outputs.some((output) => output.exitCode === 0)
  if (predicate === 'allowedFilesOnly') return outputs.every((output) => output.allowedFilesOnly !== false)
  return outputs.every((output) => output.evaluatorPass !== false && output.done !== false)
}
