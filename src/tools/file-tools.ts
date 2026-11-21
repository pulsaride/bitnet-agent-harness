import { createHash } from 'node:crypto'
import { readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { TraceWriter } from '../capabilities/trace.ts'
import { Workspace } from '../policy/workspace.ts'
import { createNativeTool, type ExecutableTool } from './tool.ts'

interface ReadInput { path: string; offset: number; limit: number }
interface ReadOutput { text: string; sha256: string; truncated: boolean }
interface EditInput { path: string; baseSha256: string; oldText: string; newText: string }

export function createFileTools(workspace: Workspace, options: Readonly<{ maxReadBytes?: number; trace?: TraceWriter }> = {}) {
  const maxReadBytes = options.maxReadBytes ?? 65_536
  const read: ExecutableTool<ReadInput, ReadOutput> = createNativeTool('workspace/read', async (input) => readText(workspace, input, maxReadBytes), { read: ['workspace'] }, { inputSchema: objectSchema({ path: stringSchema(), offset: integerSchema(0), limit: integerSchema(1, 65_536) }), outputSchema: objectSchema({ text: stringSchema(), sha256: stringSchema(64, 64, '^[a-f0-9]{64}$'), truncated: { type: 'boolean' } }), trace: options.trace })
  const list = createNativeTool('workspace/list', async (input: { path: string }) => ({ entries: await listEntries(workspace, input.path) }), { read: ['workspace'] }, { inputSchema: objectSchema({ path: stringSchema() }), outputSchema: { type: 'object', additionalProperties: true }, trace: options.trace })
  const search = createNativeTool('workspace/search', async (input: { path: string; query: string; maxResults: number }) => ({ matches: await searchFiles(workspace, input.path, input.query, input.maxResults, maxReadBytes) }), { read: ['workspace'] }, { inputSchema: objectSchema({ path: stringSchema(), query: stringSchema(), maxResults: integerSchema(1, 1000) }), outputSchema: { type: 'object', additionalProperties: true }, trace: options.trace })
  const edit = createNativeTool('workspace/edit', async (input: EditInput) => editFile(workspace, input, maxReadBytes), { write: ['workspace'] }, { inputSchema: objectSchema({ path: stringSchema(), baseSha256: stringSchema(64, 64, '^[a-f0-9]{64}$'), oldText: stringSchema(), newText: stringSchema() }), outputSchema: objectSchema({ sha256: stringSchema(64, 64, '^[a-f0-9]{64}$') }), trace: options.trace })
  return { read, list, search, edit }
}

async function readText(workspace: Workspace, input: ReadInput, maxReadBytes: number): Promise<ReadOutput> {
  const handle = await workspace.openRead(input.path)
  try {
    const content = await handle.readFile({ encoding: 'utf8' })
    const requested = content.slice(input.offset, input.offset + input.limit)
    const text = requested.slice(0, maxReadBytes)
    return { text, sha256: sha256(Buffer.from(content)), truncated: text.length < requested.length || input.offset + input.limit < content.length }
  } finally { await handle.close() }
}

async function listEntries(workspace: Workspace, relative: string): Promise<readonly { path: string; kind: 'file' | 'directory' }[]> {
  const root = await workspace.resolve(relative)
  const entries = await readdir(root, { withFileTypes: true })
  return entries.filter((entry) => !entry.isSymbolicLink()).sort((a, b) => a.name.localeCompare(b.name)).map((entry) => ({ path: workspace.relative(path.join(root, entry.name)), kind: entry.isDirectory() ? 'directory' as const : 'file' as const }))
}

async function searchFiles(workspace: Workspace, relative: string, query: string, maxResults: number, maxBytes: number): Promise<readonly { path: string; line: number; text: string }[]> {
  const root = await workspace.resolve(relative)
  const pending = [root]
  const matches: { path: string; line: number; text: string }[] = []
  while (pending.length > 0 && matches.length < maxResults) {
    const current = pending.shift()!
    const entries = (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const absolute = path.join(current, entry.name)
      await workspace.resolve(workspace.relative(absolute))
      if (entry.isDirectory()) pending.push(absolute)
      else if (entry.isFile()) {
        const bytes = await readFile(absolute)
        const text = bytes.subarray(0, maxBytes).toString('utf8')
        for (const [index, line] of text.split(/\r?\n/).entries()) if (line.includes(query)) { matches.push({ path: workspace.relative(absolute), line: index + 1, text: line.slice(0, maxBytes) }); if (matches.length >= maxResults) break }
      }
      if (matches.length >= maxResults) break
    }
  }
  return matches
}

async function editFile(workspace: Workspace, input: EditInput, maxPatchBytes: number): Promise<{ sha256: string }> {
  const bytes = Buffer.from(input.newText)
  if (bytes.byteLength > maxPatchBytes || Buffer.byteLength(input.oldText) > maxPatchBytes) throw new Error('patch exceeds size limit')
  const target = await workspace.resolve(input.path, true)
  const original = await readFile(target)
  if (sha256(original) !== input.baseSha256) throw new Error('stale precondition: file changed')
  const source = original.toString('utf8')
  const first = source.indexOf(input.oldText)
  if (first < 0) throw new Error('old text not found')
  if (source.indexOf(input.oldText, first + 1) >= 0) throw new Error('ambiguous patch: old text appears more than once')
  const updated = Buffer.from(source.slice(0, first) + input.newText + source.slice(first + input.oldText.length))
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.tool-${process.pid}-${crypto.randomUUID()}`)
  await writeFile(temporary, updated, { flag: 'wx' })
  try { await rename(temporary, target) } catch (error) { await import('node:fs/promises').then(({ rm }) => rm(temporary, { force: true })); throw error }
  return { sha256: sha256(updated) }
}

function sha256(value: Buffer): string { return createHash('sha256').update(value).digest('hex') }
function stringSchema(minLength = 0, maxLength = 1_000_000, pattern?: string) { return { type: 'string', minLength, maxLength, ...(pattern ? { pattern } : {}) } }
function integerSchema(minimum: number, maximum = 1_000_000) { return { type: 'integer', minimum, maximum } }
function objectSchema(properties: Record<string, unknown>) { return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } }
