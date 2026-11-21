export type ModelCapabilityState = 'verified' | 'unsupported' | 'unknown'

export interface ModelCapabilityEvidence {
  state: ModelCapabilityState
  probeId?: string
}

export interface ModelCapabilities {
  artifact: { model?: string; provider: string; baseUrl: string }
  contextTokens: number | null
  chatCompletions: ModelCapabilityEvidence
  streaming: ModelCapabilityEvidence
  usage: ModelCapabilityEvidence
  nativeToolCalls: ModelCapabilityEvidence
  structuredOutput: ModelCapabilityEvidence
  grammar: ModelCapabilityEvidence
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: ChatRole
  content: string | null
  name?: string
  toolCallId?: string
  toolCalls?: ToolCall[]
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type ToolChoice = 'auto' | 'none' | { type: 'function'; function: { name: string } }
export type ResponseFormat =
  | { type: 'text' }
  | { type: 'json_object' }
  | { type: 'json_schema'; json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean } }

export interface ModelRequest {
  model?: string
  messages: readonly ChatMessage[]
  maxTokens?: number
  temperature?: number
  seed?: number
  tools?: readonly ToolDefinition[]
  toolChoice?: ToolChoice
  responseFormat?: ResponseFormat
  grammar?: string
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens?: number
}

export interface ModelResult {
  id?: string
  model?: string
  text: string
  finishReason: string | null
  toolCalls: ToolCall[]
  usage: TokenUsage | null
  raw: unknown
}

export interface ModelEvent {
  type: 'delta' | 'tool-call-delta' | 'usage' | 'done' | 'error'
  text?: string
  toolCalls?: Array<Partial<ToolCall>>
  usage?: TokenUsage
  finishReason?: string | null
  error?: Error
  raw?: unknown
}

export interface ModelPort {
  describe(): Promise<ModelCapabilities>
  complete(request: ModelRequest, signal?: AbortSignal): Promise<ModelResult>
  stream(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelEvent>
}
