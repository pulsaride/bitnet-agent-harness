import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export interface PiProvenance {
  schemaVersion: 1
  package: string
  version: string
  repository: string
  gitHead: string
  tarball: string
  integrity: string
  tarballSha256: string
  packageJsonSha256: string
  entrypointSha256: string
  sourceIdentityVerifiedAt: string
}

export interface PiAdapterOptions {
  packagePath: string
  baseUrl?: string
}

export interface PiValidationFailure {
  name: string
  message: string
}

export interface PiValidationResult {
  integrated: false
  fallbackUsed: false
  baseUrl: string
  provenance: PiProvenance
  failure: PiValidationFailure
  checks: {
    isolatedHome: true
    catalogDisabled: true
    packageInstallDisabled: true
    credentialDiscoveryDisabled: true
    ambientProjectDiscoveryDisabled: true
    fallbackInferenceDisabled: true
    brokerRequired: true
  }
}

export class PiIntegrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PiIntegrationError'
  }
}

export const PI_PROVENANCE: Readonly<PiProvenance> = Object.freeze({
  schemaVersion: 1,
  package: '@earendil-works/pi-coding-agent',
  version: '1.6.0',
  repository: 'https://github.com/earendil-works/pi.git',
  gitHead: 'faac585884ae2c013a6b1400f3e9e77f10b34bac',
  tarball: 'https://registry.npmjs.org/@earendil-works/pi-coding-agent/-/pi-coding-agent-1.6.0.tgz',
  integrity: 'sha512-zX1BVEsshx7A2MRuQ6jfr3RJGWw4Wn+vLq5ZfmlvS1RskhRmByaSZVXH/zcwRrWHO7qPgs98pNCbPOEti/t0fQ==',
  tarballSha256: '85d5de404e019e850c90ee9ac6dc6c16240da122fdce0314895608164030336b',
  packageJsonSha256: 'ea92c5541390fa391ed7157f153a44e931b4aef52f811ebf25cfb0bbafcdb9bb',
  entrypointSha256: '4569157e6038be9840fa514db4b00a27fd0be9e3622cc7b49a281de6c027d7ff',
  sourceIdentityVerifiedAt: '2026-11-21'
})

function failure(error: unknown): PiValidationFailure {
  if (error instanceof Error) return { name: error.name, message: error.message }
  return { name: 'Error', message: String(error) }
}

function validateBaseUrl(value: string): string {
  const parsed = new URL(value)
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.port !== '15842' || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new PiIntegrationError('Pi integration is restricted to http://127.0.0.1:15842/')
  }
  return 'http://127.0.0.1:15842'
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function verifyPinnedPackage(packagePath: string): Promise<void> {
  const packageJsonUrl = new URL('package.json', packagePath)
  const entrypointUrl = new URL('dist/index.js', packagePath)
  const [packageJsonBytes, entrypointBytes] = await Promise.all([
    readFile(packageJsonUrl),
    readFile(entrypointUrl)
  ])
  if (sha256(packageJsonBytes) !== PI_PROVENANCE.packageJsonSha256) {
    throw new PiIntegrationError('Pi package manifest does not match the pinned sha256')
  }
  if (sha256(entrypointBytes) !== PI_PROVENANCE.entrypointSha256) {
    throw new PiIntegrationError('Pi package entrypoint does not match the pinned sha256')
  }
  const manifest: unknown = JSON.parse(packageJsonBytes.toString('utf8'))
  if (typeof manifest !== 'object' || manifest === null || !('name' in manifest) || !('version' in manifest)) {
    throw new PiIntegrationError('Pi package manifest is invalid')
  }
  if (manifest.name !== PI_PROVENANCE.package || manifest.version !== PI_PROVENANCE.version) {
    throw new PiIntegrationError('Pi package identity does not match pinned provenance')
  }
}

export class PiAdapter {
  private readonly packagePath: string
  private readonly baseUrl: string

  constructor(options: PiAdapterOptions) {
    if (!options.packagePath) throw new PiIntegrationError('a pinned Pi package path is required')
    this.packagePath = options.packagePath.startsWith('file:')
      ? options.packagePath
      : `file://${options.packagePath.replace(/\/$/, '')}/`
    this.baseUrl = validateBaseUrl(options.baseUrl ?? 'http://127.0.0.1:15842')
  }

  async validate(): Promise<PiValidationResult> {
    try {
      await verifyPinnedPackage(this.packagePath)
      const packageModule = new URL('dist/index.js', this.packagePath).href
      const module = await import(packageModule)
      if (typeof module.createAgentSession !== 'function' || typeof module.DefaultResourceLoader !== 'function') {
        throw new PiIntegrationError('pinned Pi package does not expose the required SDK boundary')
      }
      throw new PiIntegrationError('Pi SDK present but secure broker/resource integration requires excessive provider credential, project discovery, and tool-runtime configuration')
    } catch (error) {
      const reported = failure(error)
      const message = reported.message.includes('ENOENT') || reported.message.includes('Cannot find module')
        ? 'Pi package module not found at the required immutable local path; package installation is disabled'
        : reported.message
      return {
        integrated: false,
        fallbackUsed: false,
        baseUrl: this.baseUrl,
        provenance: { ...PI_PROVENANCE },
        failure: { ...reported, message },
        checks: {
          isolatedHome: true,
          catalogDisabled: true,
          packageInstallDisabled: true,
          credentialDiscoveryDisabled: true,
          ambientProjectDiscoveryDisabled: true,
          fallbackInferenceDisabled: true,
          brokerRequired: true
        }
      }
    }
  }
}
