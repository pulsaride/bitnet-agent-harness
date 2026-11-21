import { spawn } from 'node:child_process'
import path from 'node:path'
import { Workspace } from '../policy/workspace.ts'
import { createNativeTool } from './tool.ts'

export interface TestProfile {
  readonly id: string
  readonly executable: string
  readonly argv: readonly string[]
  readonly timeoutMs: number
  readonly sandbox: Readonly<{ network: boolean }>
}

export function defineTestProfile(id: string, options: Omit<TestProfile, 'id'>): TestProfile {
  if (!/^[a-z0-9-]+$/.test(id) || !path.isAbsolute(options.executable) || options.argv.some((arg) => arg.includes('\0')) || options.sandbox.network) throw new Error('test profiles require an id, absolute executable, pinned argv, and disabled network')
  return Object.freeze({ id, executable: options.executable, argv: Object.freeze([...options.argv]), timeoutMs: options.timeoutMs, sandbox: Object.freeze({ network: false }) })
}

export function createTestTool(workspace: Workspace, profiles: readonly TestProfile[], options: Readonly<{ bubblewrap?: string }> = {}) {
  const pins = new Map(profiles.map((profile) => [profile.id, profile]))
  return createNativeTool('process/test', async (input: { profile: string }) => {
    const profile = pins.get(input.profile)
    if (!profile) throw new Error(`test profile ${JSON.stringify(input.profile)} not found`)
    const bubblewrap = options.bubblewrap ?? '/usr/bin/bwrap'
    const argv = ['--die-with-parent', '--unshare-all', '--new-session', '--ro-bind', '/', '/', '--tmpfs', '/tmp', '--dir', '/tmp/workspace', '--bind', workspace.root, '/tmp/workspace', '--chdir', '/tmp/workspace', '--proc', '/proc', '--dev', '/dev', profile.executable, ...profile.argv]
    return runBounded(bubblewrap, argv, profile.timeoutMs, workspace.root)
  }, { read: ['workspace'], process: true }, { inputSchema: { type: 'object', properties: { profile: { type: 'string', minLength: 1 } }, required: ['profile'], additionalProperties: false }, outputSchema: { type: 'object', additionalProperties: true } })
}

async function runBounded(executable: string, argv: readonly string[], timeoutMs: number, cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, argv, { cwd, env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent', LANG: 'C.UTF-8' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stdout = ''; let stderr = ''; let timedOut = false
    const cap = (current: string, chunk: Buffer) => (current + chunk.toString('utf8')).slice(-262_144)
    child.stdout.on('data', (chunk: Buffer) => { stdout = cap(stdout, chunk) })
    child.stderr.on('data', (chunk: Buffer) => { stderr = cap(stderr, chunk) })
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid!, 'SIGKILL') } catch { child.kill('SIGKILL') } }, timeoutMs)
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
    child.once('close', (code) => { clearTimeout(timer); resolve({ exitCode: code ?? -1, stdout, stderr, timedOut }) })
  })
}
