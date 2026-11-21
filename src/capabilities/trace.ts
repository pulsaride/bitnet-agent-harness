export interface TraceEvent {
  readonly protocolVersion: 1
  readonly runId: string
  readonly sequence: number
  readonly type: string
  readonly payload: Readonly<Record<string, unknown>>
}

export class TraceWriter {
  readonly #sink: (event: TraceEvent) => Promise<void> | void
  readonly #runId: string
  #sequence = 0

  constructor(options: Readonly<{ sink: (event: TraceEvent) => Promise<void> | void; runId: string }>) {
    this.#sink = options.sink
    this.#runId = options.runId
  }

  async append(type: string, payload: Readonly<Record<string, unknown>> = {}): Promise<TraceEvent> {
    const event = Object.freeze({ protocolVersion: 1 as const, runId: this.#runId, sequence: ++this.#sequence, type, payload: { ...payload } })
    await this.#sink(event)
    return event
  }
}
