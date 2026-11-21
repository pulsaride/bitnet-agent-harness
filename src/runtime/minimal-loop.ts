import { parseActionEnvelopeForAllowedAction, type ActionEnvelope } from '../model/action-envelope.ts'
import type { ChatMessage, ModelPort } from '../ports/model.ts'

export interface BrokerProposal {
  source: 'model'
  action: ActionEnvelope['action']
}

export interface BrokerDecision {
  approved: boolean
  output: unknown
  error?: string
  observation?: unknown
}

export interface MinimalLoopOptions {
  model: ModelPort
  allowedActions: ReadonlySet<string>
  broker: (proposal: BrokerProposal, signal?: AbortSignal) => Promise<BrokerDecision>
  maxTurns?: number
  maxTokens?: number
  systemInstruction?: string
}

export interface MinimalLoopResult {
  condition: 'independent-bounded-action-loop'
  status: 'completed' | 'blocked' | 'rejected' | 'exhausted' | 'failed'
  turns: number
  messages: ChatMessage[]
  finalText?: string
  reason?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function boundedObservation(value: unknown): string {
  const serialized = JSON.stringify(value)
  return serialized.length <= 8_192 ? serialized : `${serialized.slice(0, 8_192)}…[truncated]`
}

export class MinimalActionLoop {
  private readonly model: ModelPort
  private readonly allowedActions: ReadonlySet<string>
  private readonly broker: MinimalLoopOptions['broker']
  private readonly maxTurns: number
  private readonly maxTokens: number
  private readonly systemInstruction: string

  constructor(options: MinimalLoopOptions) {
    this.model = options.model
    this.allowedActions = options.allowedActions
    this.broker = options.broker
    this.maxTurns = options.maxTurns ?? 6
    this.maxTokens = options.maxTokens ?? 192
    this.systemInstruction = options.systemInstruction ?? 'Propose exactly one allowed JSON action envelope, or answer without claiming tool execution. Never assume a proposal was authorized.'
    if (!Number.isInteger(this.maxTurns) || this.maxTurns < 1 || this.maxTurns > 20) {
      throw new Error('maxTurns must be an integer from 1 to 20')
    }
  }

  async run(userPrompt: string, signal?: AbortSignal): Promise<MinimalLoopResult> {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemInstruction },
      { role: 'user', content: userPrompt }
    ]
    let turns = 0
    while (turns < this.maxTurns) {
      turns += 1
      try {
        const completion = await this.model.complete({
          messages,
          temperature: 0,
          maxTokens: this.maxTokens,
          responseFormat: { type: 'text' }
        }, signal)
        const text = completion.text.trim()
        messages.push({ role: 'assistant', content: text })
        if (!text.startsWith('{')) {
          return { condition: 'independent-bounded-action-loop', status: 'completed', turns, messages, finalText: text }
        }
        let envelope: ActionEnvelope
        try {
          envelope = parseActionEnvelopeForAllowedAction(text, this.allowedActions)
        } catch (error) {
          return { condition: 'independent-bounded-action-loop', status: 'rejected', turns, messages, reason: errorMessage(error) }
        }
        const decision = await this.broker({ source: 'model', action: envelope.action }, signal)
        if (!decision.approved) {
          return { condition: 'independent-bounded-action-loop', status: 'blocked', turns, messages, reason: decision.error ?? 'approval_required' }
        }
        messages.push({
          role: 'tool',
          name: envelope.action.name,
          content: boundedObservation(decision.observation ?? decision.output)
        })
      } catch (error) {
        return { condition: 'independent-bounded-action-loop', status: 'failed', turns, messages, reason: errorMessage(error) }
      }
    }
    return { condition: 'independent-bounded-action-loop', status: 'exhausted', turns, messages, reason: 'maximum turns reached' }
  }
}
