import type {
  ChatMessage,
  ModelCapabilities,
  ModelEvent,
  ModelPort,
  ModelRequest,
  ModelResult,
  TokenUsage,
  ToolCall
} from '../ports/model.ts'

export interface BitNetClientOptions {
  baseUrl?: string
  model?: string
  timeoutMs?: number
  fetch?: typeof globalThis.fetch
}

interface UpstreamErrorBody { error?: { message?: string } | string }

export class BitNetHttpError extends Error {
  public readonly status: number
  public readonly body: unknown

  constructor(
    message: string,
    status: number,
    body: unknown
  ) {
    super(message)
    this.status = status
    this.body = body
    this.name = 'BitNetHttpError'
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function parseUsage(value: unknown): TokenUsage | null {
  const usage = asRecord(value)
  if (!usage || typeof usage.prompt_tokens !== 'number' || typeof usage.completion_tokens !== 'number') return null
  const details = asRecord(usage.prompt_tokens_details)
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: typeof usage.total_tokens === 'number'
      ? usage.total_tokens
      : usage.prompt_tokens + usage.completion_tokens,
    ...(typeof details?.cached_tokens === 'number' ? { cachedTokens: details.cached_tokens } : {})
  }
}

function parseToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): ToolCall[] => {
    const call = asRecord(item)
    const fn = asRecord(call?.function)
    if (!call || !fn || typeof call.id !== 'string' || typeof fn.name !== 'string') return []
    return [{
      id: call.id,
      type: 'function',
      function: {
        name: fn.name,
        arguments: typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? {})
      }
    }]
  })
}

function toWireMessage(message: Readonly<ChatMessage>): Record<string, unknown> {
  return {
    role: message.role,
    content: message.content,
    ...(message.name ? { name: message.name } : {}),
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.toolCalls ? { tool_calls: message.toolCalls } : {})
  }
}

function errorMessage(body: unknown, status: number): string {
  const parsed = asRecord(body) as UpstreamErrorBody | null
  const detail = typeof parsed?.error === 'string' ? parsed.error : parsed?.error?.message
  return `BitNet HTTP ${status}${detail ? `: ${detail}` : ''}`
}

export class BitNetClient implements ModelPort {
  private readonly baseUrl: string
  private readonly configuredModel?: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof globalThis.fetch

  constructor(options: BitNetClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'http://127.0.0.1:15842').replace(/\/$/, '')
    this.configuredModel = options.model
    this.timeoutMs = options.timeoutMs ?? 120_000
    this.fetchImpl = options.fetch ?? globalThis.fetch
  }

  async describe(): Promise<ModelCapabilities> {
    const [modelsResponse, propertiesResponse] = await Promise.all([
      this.fetchImpl(`${this.baseUrl}/v1/models`, { signal: AbortSignal.timeout(this.timeoutMs) }),
      this.fetchImpl(`${this.baseUrl}/props`, { signal: AbortSignal.timeout(this.timeoutMs) })
    ])
    await this.requireOk(modelsResponse)
    await this.requireOk(propertiesResponse)
    const models = asRecord(await modelsResponse.json())
    const properties = asRecord(await propertiesResponse.json())
    const caps = asRecord(properties?.chat_template_caps)
    const settings = asRecord(properties?.default_generation_settings)
    const data = Array.isArray(models?.data) ? models.data : []
    const modelId = this.configuredModel ?? (asRecord(data[0])?.id as string | undefined)
    return {
      artifact: { model: modelId, provider: 'bitnet-llama-server', baseUrl: this.baseUrl },
      contextTokens: typeof settings?.n_ctx === 'number' ? settings.n_ctx : null,
      chatCompletions: { state: 'unknown' },
      streaming: { state: 'unknown' },
      usage: { state: 'unknown' },
      nativeToolCalls: { state: caps?.supports_tools === true ? 'unknown' : 'unsupported' },
      structuredOutput: { state: 'unknown' },
      grammar: { state: 'unknown' }
    }
  }

  async complete(request: ModelRequest, signal?: AbortSignal): Promise<ModelResult> {
    const response = await this.requestChat(request, false, signal)
    await this.requireOk(response)
    const raw: unknown = await response.json()
    const body = asRecord(raw)
    const choice = asRecord(Array.isArray(body?.choices) ? body.choices[0] : undefined)
    const message = asRecord(choice?.message)
    return {
      id: typeof body?.id === 'string' ? body.id : undefined,
      model: typeof body?.model === 'string' ? body.model : undefined,
      text: typeof message?.content === 'string' ? message.content : '',
      finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
      toolCalls: parseToolCalls(message?.tool_calls),
      usage: parseUsage(body?.usage),
      raw
    }
  }

  async *stream(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelEvent> {
    const response = await this.requestChat(request, true, signal)
    await this.requireOk(response)
    if (!response.body) throw new BitNetHttpError('BitNet stream has no response body', response.status, null)
    const decoder = new TextDecoder()
    const reader = response.body.getReader()
    let pending = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        pending += decoder.decode(value, { stream: true })
        const frames = pending.split(/\r?\n\r?\n/)
        pending = frames.pop() ?? ''
        for (const frame of frames) {
          const event = this.parseSseFrame(frame)
          if (event) yield event
        }
      }
      pending += decoder.decode()
      const event = this.parseSseFrame(pending)
      if (event) yield event
    } finally {
      reader.releaseLock()
    }
  }

  private async requestChat(request: ModelRequest, stream: boolean, externalSignal?: AbortSignal): Promise<Response> {
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs)
    const signal = externalSignal ? AbortSignal.any([externalSignal, timeoutSignal]) : timeoutSignal
    let resolvedModel = request.model ?? this.configuredModel
    if (!resolvedModel) resolvedModel = await this.resolveModel(signal)
    const payload = {
      model: resolvedModel,
      messages: request.messages.map(toWireMessage),
      temperature: request.temperature ?? 0,
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
      ...(request.seed !== undefined ? { seed: request.seed } : {}),
      ...(request.tools ? { tools: request.tools } : {}),
      ...(request.toolChoice !== undefined ? { tool_choice: request.toolChoice } : {}),
      ...(request.responseFormat ? { response_format: request.responseFormat } : {}),
      ...(request.grammar ? { grammar: request.grammar } : {}),
      stream
    }
    return this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    })
  }

  private async resolveModel(signal: AbortSignal): Promise<string> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/models`, { signal })
    await this.requireOk(response)
    const body = asRecord(await response.json())
    const data = Array.isArray(body?.data) ? body.data : []
    const id = asRecord(data[0])?.id
    if (typeof id !== 'string') throw new Error('BitNet did not advertise a model')
    return id
  }

  private async requireOk(response: Response): Promise<void> {
    if (response.ok) return
    const text = await response.text()
    let body: unknown = text
    try { body = JSON.parse(text) } catch { /* retain bounded raw text below */ }
    if (typeof body === 'string') body = body.slice(0, 4096)
    throw new BitNetHttpError(errorMessage(body, response.status), response.status, body)
  }

  private parseSseFrame(frame: string): ModelEvent | null {
    const data = frame.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (!data || data === '[DONE]') return data === '[DONE]' ? { type: 'done' } : null
    let raw: unknown
    try { raw = JSON.parse(data) } catch (error) {
      return { type: 'error', error: error instanceof Error ? error : new Error(String(error)), raw: data }
    }
    const chunk = asRecord(raw)
    const choice = asRecord(Array.isArray(chunk?.choices) ? chunk.choices[0] : undefined)
    const delta = asRecord(choice?.delta)
    const usage = parseUsage(chunk?.usage)
    if (usage) return { type: 'usage', usage, raw }
    const toolCalls = parseToolCalls(delta?.tool_calls)
    if (toolCalls.length > 0) return { type: 'tool-call-delta', toolCalls, raw }
    const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined
    const text = typeof delta?.content === 'string' ? delta.content : undefined
    return { type: text !== undefined || finishReason !== undefined ? 'delta' : 'delta', text, finishReason, raw }
  }
}
