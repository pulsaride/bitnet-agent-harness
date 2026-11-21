import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import path from 'node:path'

const CREDENTIAL_NAMES = new Set(['.env', '.env.local', '.npmrc', '.pypirc', 'id_rsa', 'id_ed25519', 'credentials.json'])

export class WorkspaceError extends Error {
  constructor(message: string) { super(message); this.name = 'WorkspaceError' }
}

export class Workspace {
  readonly root: string

  constructor(root: string) {
    this.root = path.resolve(root)
  }

  async resolve(relativePath: string, forWrite = false): Promise<string> {
    if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.includes('\0')) throw new WorkspaceError('invalid workspace path')
    const normalized = path.posix.normalize(relativePath.replaceAll('\\', '/'))
    if (path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) throw new WorkspaceError('path is outside workspace root')
    const segments = normalized.split('/')
    if (segments.some((segment) => CREDENTIAL_NAMES.has(segment.toLowerCase()) || segment === '.git')) throw new WorkspaceError('credential or protected path denied')
    const candidate = path.join(this.root, ...segments)
    let current = this.root
    for (const segment of segments) {
      current = path.join(current, segment)
      try {
        const stat = await lstat(current)
        if (stat.isSymbolicLink()) throw new WorkspaceError('symlink paths are denied')
        if (!stat.isDirectory() && !stat.isFile()) throw new WorkspaceError('special files are denied')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          if (!forWrite) throw error
          break
        }
        throw error
      }
    }
    if (!path.resolve(candidate).startsWith(`${this.root}${path.sep}`) && path.resolve(candidate) !== this.root) throw new WorkspaceError('path is outside workspace root')
    return candidate
  }

  async openRead(relativePath: string) {
    const resolved = await this.resolve(relativePath, false)
    const handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW)
    const target = await realpath(resolved)
    if (!target.startsWith(`${this.root}${path.sep}`)) { await handle.close(); throw new WorkspaceError('resolved file is outside workspace root') }
    return handle
  }

  relative(absolutePath: string): string {
    const relative = path.relative(this.root, absolutePath)
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new WorkspaceError('path is outside workspace root')
    return relative.split(path.sep).join('/')
  }
}
