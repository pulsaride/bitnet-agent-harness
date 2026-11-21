import { createHash } from 'node:crypto'

export interface CapabilityPermissions {
  readonly read: readonly string[]
  readonly write: readonly string[]
  readonly network: readonly string[]
  readonly process: boolean
}

export interface CapabilityDescriptor {
  readonly protocolVersion: 1
  readonly id: string
  readonly version: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
  readonly outputSchema: Record<string, unknown>
  readonly permissions: CapabilityPermissions
  readonly limits: Readonly<Record<string, number>>
  readonly implementation: Readonly<{ kind: 'native' | 'subprocess'; entry: string }>
  readonly digest?: string
}

export class CapabilityRegistry {
  readonly #entries = new Map<string, CapabilityDescriptor & { readonly digest: string }>()

  register(descriptor: CapabilityDescriptor): CapabilityDescriptor & { readonly digest: string } {
    if (descriptor.protocolVersion !== 1) throw new Error('unsupported protocolVersion')
    if (!/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(descriptor.id)) throw new Error('invalid capability id')
    if (!/^\d+\.\d+\.\d+$/.test(descriptor.version)) throw new Error('version must be exact semver')
    const { digest: _digest, ...content } = descriptor
    const digest = createHash('sha256').update(stableJson(content)).digest('hex')
    const key = `${descriptor.id}@${descriptor.version}@${digest}`
    if (this.#entries.has(key)) throw new Error(`duplicate capability ${key}`)
    for (const entry of this.#entries.values()) if (entry.id === descriptor.id && entry.version === descriptor.version) throw new Error(`duplicate capability ${descriptor.id}@${descriptor.version}`)
    const registered = Object.freeze({ ...content, digest }) as CapabilityDescriptor & { readonly digest: string }
    this.#entries.set(key, registered)
    return registered
  }

  list(): readonly (CapabilityDescriptor & { readonly digest: string })[] {
    return Object.freeze([...this.#entries.values()].sort((left, right) => `${left.id}@${left.version}@${left.digest}`.localeCompare(`${right.id}@${right.version}@${right.digest}`)))
  }

  resolve(id: string, version: string, digest: string): CapabilityDescriptor & { readonly digest: string } {
    const found = this.#entries.get(`${id}@${version}@${digest}`)
    if (!found) throw new Error(`capability pin not found: ${id}@${version}@${digest}`)
    return found
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (typeof value === 'object' && value !== null) return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`
  return JSON.stringify(value)
}
