import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'

export interface SkillSummary {
  readonly name: string
  readonly description: string
  readonly version: string
  readonly digest: string
  readonly origin: string
}
export interface ActivatedSkill extends SkillSummary { readonly body: string }

const MAX_BODY_BYTES = 64 * 1024
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export class SkillLoader {
  readonly #roots: readonly string[]
  readonly #pins = new Map<string, { root: string; directory: string; summary: SkillSummary }>()

  constructor(roots: readonly string[]) { this.#roots = roots.map((root) => path.resolve(root)) }

  async discover(): Promise<readonly SkillSummary[]> {
    this.#pins.clear()
    const discovered: SkillSummary[] = []
    for (const root of this.#roots) {
      const rootReal = await realpath(root)
      const entries = (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue
        try {
          const directory = path.join(root, entry.name)
          const file = path.join(directory, 'SKILL.md')
          const fileStat = await lstat(file)
          if (fileStat.isSymbolicLink() || !(await within(rootReal, file))) continue
          const bytes = await readFile(file)
          if (bytes.byteLength > MAX_BODY_BYTES) continue
          const parsed = parseSkill(bytes.toString('utf8'))
          if (!NAME.test(parsed.frontmatter.name) || parsed.frontmatter.name.length > 64 || parsed.frontmatter.description.length > 1024 || entry.name !== parsed.frontmatter.name) continue
          const summary = { name: parsed.frontmatter.name, description: parsed.frontmatter.description, version: parsed.frontmatter.version, digest: createHash('sha256').update(bytes).digest('hex'), origin: directory }
          if (this.#pins.has(summary.name)) throw new Error(`duplicate skill name requires an explicit pin: ${summary.name}`)
          this.#pins.set(summary.name, { root, directory, summary })
          discovered.push(Object.freeze(summary))
        } catch (error) { if (error instanceof Error && error.message.startsWith('duplicate skill')) throw error }
      }
    }
    return Object.freeze(discovered.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async activate(name: string, contextBudget: number): Promise<ActivatedSkill> {
    if (this.#pins.size === 0) await this.discover()
    const pin = this.#pins.get(name)
    if (!pin) throw new Error(`skill ${JSON.stringify(name)} is not discovered`)
    const bytes = await readFile(path.join(pin.directory, 'SKILL.md'))
    if (bytes.byteLength > contextBudget) throw new Error('skill body exceeds context budget')
    const parsed = parseSkill(bytes.toString('utf8'))
    if (parsed.frontmatter.name !== pin.summary.name || createHash('sha256').update(bytes).digest('hex') !== pin.summary.digest) throw new Error('skill changed after discovery')
    return { ...pin.summary, body: parsed.body }
  }

  async loadReference(name: string, reference: string, contextBudget: number): Promise<string> {
    if (this.#pins.size === 0) await this.discover()
    const pin = this.#pins.get(name)
    if (!pin) throw new Error(`skill ${JSON.stringify(name)} is not discovered`)
    const normalized = path.posix.normalize(reference.replaceAll('\\', '/'))
    if (!normalized.startsWith('references/') || normalized.includes('..') || normalized.startsWith('/')) throw new Error('skill references must stay under references/')
    const file = path.join(pin.directory, ...normalized.split('/'))
    const stat = await lstat(file)
    if (stat.isSymbolicLink() || !(await within(pin.directory, file))) throw new Error('skill reference escapes approved root')
    const bytes = await readFile(file)
    if (bytes.byteLength > contextBudget) throw new Error('skill reference exceeds context budget')
    return bytes.toString('utf8')
  }
}

async function within(root: string, candidate: string): Promise<boolean> {
  const resolved = await realpath(candidate)
  return resolved.startsWith(`${root}${path.sep}`)
}

function parseSkill(content: string): { frontmatter: { name: string; description: string; version: string }; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(content)
  if (!match) throw new Error('SKILL.md requires YAML frontmatter')
  const fields = new Map<string, string>()
  for (const line of match[1].split(/\r?\n/)) {
    const property = /^([a-z][a-z0-9-]*):\s*(.+)$/.exec(line.trim())
    if (property) fields.set(property[1], property[2])
  }
  const name = fields.get('name') ?? ''
  const description = fields.get('description') ?? ''
  const version = /^\s+version:\s*(.+)$/.exec(match[1])?.[1]?.trim() ?? '0.0.0'
  if (!name || !description || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('invalid skill frontmatter')
  return { frontmatter: { name, description, version }, body: match[2].trim() }
}
