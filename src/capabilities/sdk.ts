import { CapabilityRegistry } from './registry.ts'
import type { ExecutableTool } from '../tools/tool.ts'

export interface RegisteredTool { readonly descriptor: ReturnType<CapabilityRegistry['register']>; readonly tool: ExecutableTool<unknown, unknown> }

export function registerTools(tools: readonly ExecutableTool<unknown, unknown>[]): Readonly<{ registry: CapabilityRegistry; tools: readonly RegisteredTool[] }> {
  const registry = new CapabilityRegistry()
  const registered = Object.freeze(tools.map((tool) => Object.freeze({ descriptor: registry.register(tool.descriptor), tool: tool as ExecutableTool<unknown, unknown> })))
  return Object.freeze({ registry, tools: registered })
}
