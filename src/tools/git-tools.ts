import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Workspace } from '../policy/workspace.ts'
import { createNativeTool } from './tool.ts'

const exec = promisify(execFile)

export function createGitTools(workspace: Workspace) {
  const diff = createNativeTool('git/diff', async (input: { staged: boolean }) => {
    const common = { cwd: workspace.root, env: { PATH: '/usr/bin:/bin', HOME: workspace.root, GIT_CONFIG_NOSYSTEM: '1' }, timeout: 5000, maxBuffer: 1_000_000, windowsHide: true }
    const [tracked, untracked] = await Promise.all([
      exec('/usr/bin/git', [...(input.staged ? ['diff', '--cached'] : ['diff']), '--no-ext-diff', '--binary', '--no-color'], common),
      exec('/usr/bin/git', ['ls-files', '--others', '--exclude-standard'], common)
    ])
    return { diff: tracked.stdout.slice(0, 1_000_000), untracked: untracked.stdout.trim().split(/\n/).filter(Boolean).sort() }
  }, { read: ['workspace'], process: true }, { inputSchema: { type: 'object', properties: { staged: { type: 'boolean' } }, required: ['staged'], additionalProperties: false }, outputSchema: { type: 'object', additionalProperties: true } })
  return { diff }
}
