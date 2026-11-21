import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { registerTools } from '../capabilities/sdk.ts'
import { TraceWriter } from '../capabilities/trace.ts'
import type { ModelPort } from '../ports/model.ts'
import { PolicyBroker } from '../policy/broker.ts'
import { Workspace } from '../policy/workspace.ts'
import { JsonlSessionStore } from '../sessions/jsonl-store.ts'
import { SkillLoader } from '../skills/loader.ts'
import { createFileTools } from '../tools/file-tools.ts'
import { createGitTools } from '../tools/git-tools.ts'
import type { ExecutableTool } from '../tools/tool.ts'
import { MinimalActionLoop, type MinimalLoopResult } from './minimal-loop.ts'

export interface AgentHarnessOptions {
  workspaceRoot: string
  skillRoots: readonly string[]
  model: ModelPort
  sessionRoot?: string
}

export interface HarnessRunResult extends MinimalLoopResult { runId: string }

export class AgentHarness {
  readonly #workspace: Workspace
  readonly #skillLoader: SkillLoader
  readonly #model: ModelPort
  readonly #sessionRoot: string
  readonly #store: JsonlSessionStore

  constructor(options: AgentHarnessOptions) {
    this.#workspace = new Workspace(path.resolve(options.workspaceRoot))
    this.#skillLoader = new SkillLoader(options.skillRoots)
    this.#model = options.model
    this.#sessionRoot = options.sessionRoot ?? path.join(options.workspaceRoot, '.bitnet-agent-harness', 'sessions')
    this.#store = new JsonlSessionStore(this.#sessionRoot)
  }

  async run(prompt: string): Promise<HarnessRunResult> {
    const runId = randomUUID()
    const trace = new TraceWriter({ runId, sink: (event) => this.#store.append(event) })
    const fileTools = createFileTools(this.#workspace, { trace })
    const gitTools = createGitTools(this.#workspace)
    const { registry, tools } = registerTools([
      fileTools.read, fileTools.list, fileTools.search, fileTools.edit, gitTools.diff
    ] as ExecutableTool<unknown, unknown>[])
    const toolByAction = new Map<string, { registered: (typeof tools)[number]; action: string }>([
      ['workspace_read', { registered: tools.find(({ descriptor }) => descriptor.id === 'workspace/read')!, action: 'workspace_read' }],
      ['file_list', { registered: tools.find(({ descriptor }) => descriptor.id === 'workspace/list')!, action: 'file_list' }],
      ['file_search', { registered: tools.find(({ descriptor }) => descriptor.id === 'workspace/search')!, action: 'file_search' }],
      ['file_edit', { registered: tools.find(({ descriptor }) => descriptor.id === 'workspace/edit')!, action: 'file_edit' }],
      ['git_diff', { registered: tools.find(({ descriptor }) => descriptor.id === 'git/diff')!, action: 'git_diff' }]
    ])
    const broker = new PolicyBroker({
      workspace: this.#workspace,
      registry,
      grants: ['workspace/read', 'workspace/list', 'workspace/search', 'workspace/edit', 'git/diff']
        .map((capability) => ({ capability }))
    })
    await trace.append('run-started', { prompt })
    const loop = new MinimalActionLoop({
      model: this.#model,
      allowedActions: new Set(toolByAction.keys()),
      broker: async (proposal, signal) => {
        const entry = toolByAction.get(proposal.action.name)
        if (!entry) return { approved: false, output: null, error: 'unknown_action' }
        const result = await broker.execute({
          callId: randomUUID(),
          capability: entry.registered.descriptor,
          arguments: proposal.action.arguments,
          source: 'model'
        }, entry.registered.tool, { runId, signal })
        await trace.append('tool-executed', { action: entry.action, status: result.status, error: result.error ?? null })
        return { approved: result.status === 'ok', output: result.output, error: result.error?.code, observation: result.output }
      }
    })
    const result = await loop.run(prompt)
    await trace.append('run-finished', { status: result.status, turns: result.turns })
    return { ...result, runId }
  }

  async discoverSkills() { return this.#skillLoader.discover() }

  async readSession(runId: string) { return this.#store.read(runId) }
}

export { AgentHarness as DeveloperHarness }
