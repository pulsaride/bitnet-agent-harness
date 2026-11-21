import { mkdir, readFile, open } from 'node:fs/promises'
import path from 'node:path'
import type { TraceEvent } from '../capabilities/trace.ts'

export class JsonlSessionStore {
  readonly #root: string

  constructor(root: string) { this.#root = path.resolve(root) }

  async append(event: TraceEvent): Promise<void> {
    await mkdir(this.#root, { recursive: true })
    const file = path.join(this.#root, `${safeId(event.runId)}.jsonl`)
    const handle = await open(file, 'a')
    try { await handle.writeFile(`${JSON.stringify(event)}\n`) } finally { await handle.close() }
  }

  async read(runId: string): Promise<readonly TraceEvent[]> { return (await this.readWithRecovery(runId)).events }

  async readWithRecovery(runId: string): Promise<{ events: readonly TraceEvent[]; truncatedFinalRecord: boolean }> {
    const file = path.join(this.#root, `${safeId(runId)}.jsonl`)
    let text: string
    try { text = await readFile(file, 'utf8') } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { events: [], truncatedFinalRecord: false }; throw error }
    const lines = text.split('\n')
    const trailing = lines.at(-1) === '' ? '' : lines.pop()!
    const events = lines.filter(Boolean).map((line) => JSON.parse(line) as TraceEvent)
    if (trailing === '') return { events, truncatedFinalRecord: false }
    try { events.push(JSON.parse(trailing) as TraceEvent) ; return { events, truncatedFinalRecord: false } } catch { return { events, truncatedFinalRecord: true } }
  }
}

function safeId(value: string): string { if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('invalid run id'); return value }
