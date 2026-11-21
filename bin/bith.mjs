#!/usr/bin/env node
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { BitNetClient } from '../src/model/bitnet-client.ts'
import { AgentHarness } from '../src/runtime/harness.ts'
import { SkillLoader } from '../src/skills/loader.ts'

async function main() {
  const args = [...process.argv.slice(2)]
  const json = removeFlag(args, '--json')
  const workspace = path.resolve(takeOption(args, '--workspace') ?? process.cwd())
  const [command] = args.splice(0, 1)
  const subcommand = command === 'skills' ? args.shift() : undefined
  const rest = args
  let data
  if (command === 'skills' && subcommand === 'list') {
    const root = path.resolve(takeOption(rest, '--root') ?? path.join(workspace, 'examples/skills'))
    data = await new SkillLoader([await realpath(root)]).discover()
  } else if (command === 'chat') {
    const endpoint = takeOption(rest, '--endpoint') ?? 'http://127.0.0.1:15842'
    const prompt = rest.join(' ').trim()
    if (!prompt) throw new CliError('chat requires a prompt')
    const result = await new BitNetClient({ baseUrl: endpoint }).complete({ messages: [{ role: 'user', content: prompt }], temperature: 0, maxTokens: 192 })
    data = result
  } else if (command === 'run') {
    const skillRoot = path.resolve(takeOption(rest, '--skills') ?? path.join(workspace, 'examples/skills'))
    const endpoint = takeOption(rest, '--endpoint') ?? 'http://127.0.0.1:15842'
    const prompt = rest.join(' ').trim()
    if (!prompt) throw new CliError('run requires a development task')
    const result = await new AgentHarness({
      workspaceRoot: workspace,
      skillRoots: [skillRoot],
      model: new BitNetClient({ baseUrl: endpoint })
    }).run(prompt)
    data = result
  } else if (command === 'status') {
    const client = new BitNetClient({ baseUrl: takeOption(rest, '--endpoint') ?? 'http://127.0.0.1:15842', timeoutMs: 3000 })
    if (rest.length > 0) throw new CliError(`unexpected arguments: ${rest.join(' ')}`)
    try { data = { available: true, capabilities: await client.describe() } }
    catch (error) { data = { available: false, error: error instanceof Error ? error.message : String(error) } }
  } else {
    throw new CliError(`unsupported command: ${command ?? '<missing>'}`)
  }
  output(json, { ok: true, data })
}

class CliError extends Error {}
function removeFlag(args, flag) { const index = args.indexOf(flag); if (index < 0) return false; args.splice(index, 1); return true }
function takeOption(args, option) { const index = args.indexOf(option); if (index < 0) return undefined; const value = args[index + 1]; if (!value) throw new CliError(`${option} requires a value`); args.splice(index, 2); return value }
function output(json, value) { process.stdout.write(json ? `${JSON.stringify(value)}\n` : `${JSON.stringify(value, null, 2)}\n`) }

try { await main() }
catch (error) {
  output(process.argv.includes('--json'), { ok: false, error: { code: 'cli_error', message: error instanceof Error ? error.message : String(error) } })
  process.exitCode = 2
}
