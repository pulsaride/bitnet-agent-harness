#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
export const SOURCE_COMMIT = 'dbd817afb9292ded44eedcad59abc8a33f115e27'
export const TASK_IDS = Object.freeze(Array.from({ length: 10 }, (_, index) => `B${String(index + 1).padStart(2, '0')}`))
export const FAILURE_CATEGORIES = Object.freeze(['environment', 'transport', 'context_overflow', 'format', 'selection', 'retrieval', 'edit', 'reasoning', 'verification', 'policy_denial', 'security_violation', 'budget', 'harness_defect'])

const prompts = {
  B01: 'Fix identity collisions between different kind/coordinate boundaries while preserving the documented identity scheme.',
  B02: 'Fix truncated signatures: encode all 32 bytes as 64 lowercase hexadecimal characters.',
  B03: 'Restore LF, CRLF and CR event-stream framing without changing event content.',
  B04: 'Preserve the last valid event ID between events; reset only data and event type.',
  B05: 'Apply the documented event-stream compatibility exception only to legacy output.',
  B06: 'Preserve literal Expires 0 and -1; normalize dates without changing ordinary headers.',
  B07: 'Strip servlet session identifiers while preserving context and resource boundaries.',
  B08: 'Two mixed header profiles must never count as equivalent; retain the other verdict categories.',
  B09: 'Count only SQL within scenario marks and reject truncated logs.',
  B10: 'Mark a side unsupported only if every counted scenario is silent. Preserve valid zero counts and input immutability.'
}

const recipes = {
  B01: ['        hasher.update(&[0u8]);\n', ''],
  B02: ['        for byte in self.0 {\n', '        for byte in &self.0[..31] {\n'],
  B03: ['_LINE_END = re.compile(r"\\r\\n|\\n|\\r")\n', '_LINE_END = re.compile(r"\\n")\n'],
  B04: ['            data, etype = [], ""\n', '            data, etype, last_id = [], "", ""\n'],
  B05: ['    allowed = side == "legacy"\n', '    allowed = True\n'],
  B06: ['        return joined if joined in EXPIRES_TOKENS else EXPIRES_DATE\n', '        return EXPIRES_DATE\n'],
  B07: ['    path = SESSION_PATH_PARAMETER.sub("", urllib.parse.urlsplit(url).path) or "/"\n', '    path = urllib.parse.urlsplit(url).path or "/"\n'],
  B08: ['    if MIXED in (legacy, generated):\n        return MIXED\n    if legacy == generated:\n        return "equal"\n', '    if legacy == generated:\n        return "equal"\n    if MIXED in (legacy, generated):\n        return MIXED\n'],
  B09: ['            text = handle.read(end - start).decode("utf-8", "replace")\n', '            text = handle.read().decode("utf-8", "replace")\n'],
  B10: ['    silent = [side for side in SIDES if counted and all(m[side] == 0 for m in counted)]\n', '    silent = [side for side in SIDES if counted and any(m[side] == 0 for m in counted)]\n']
}

const targetFiles = {
  B01: 'platform/crates/core-ids/src/node_sig.rs', B02: 'platform/crates/core-ids/src/node_sig.rs',
  B03: 'tools/probes/_smoke/sse.py', B04: 'tools/probes/_smoke/sse.py', B05: 'tools/probes/_smoke/sse.py',
  B06: 'tools/behaviour-harness/engine/response_headers.py', B07: 'tools/behaviour-harness/engine/response_headers.py', B08: 'tools/behaviour-harness/engine/response_headers.py',
  B09: 'tools/behaviour-harness/engine/sql_count.py', B10: 'tools/behaviour-harness/engine/sql_count.py'
}

const visibleClasses = {
  B03: 'SseRule', B04: 'SseRule', B05: 'SseRule', B06: 'ClosedListTests', B07: 'LogTests',
  B08: 'VerdictTests', B09: 'MarkTests', B10: 'RelationTests'
}

const commands = {
  B01: { cwd: 'platform', argv: ['cargo', 'test', '-p', 'core-ids', 'node_sig::tests'] },
  B02: { cwd: 'platform', argv: ['cargo', 'test', '-p', 'core-ids', 'node_sig::tests'] },
  B03: { cwd: '.', argv: ['python3', '-I', 'tools/probes/_smoke/tests/test_sse.py', 'SseRule'] },
  B04: { cwd: '.', argv: ['python3', '-I', 'tools/probes/_smoke/tests/test_sse.py', 'SseRule'] },
  B05: { cwd: '.', argv: ['python3', '-I', 'tools/probes/_smoke/tests/test_sse.py', 'SseRule'] },
  B06: { cwd: '.', argv: ['python3', '-I', 'tools/behaviour-harness/tests/test_response_headers.py', 'ClosedListTests'] },
  B07: { cwd: '.', argv: ['python3', '-I', 'tools/behaviour-harness/tests/test_response_headers.py', 'LogTests'] },
  B08: { cwd: '.', argv: ['python3', '-I', 'tools/behaviour-harness/tests/test_response_headers.py', 'VerdictTests'] },
  B09: { cwd: '.', argv: ['python3', '-I', 'tools/behaviour-harness/tests/test_sql_count.py', 'MarkTests'] },
  B10: { cwd: '.', argv: ['python3', '-I', 'tools/behaviour-harness/tests/test_sql_count.py', 'RelationTests'] }
}

export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

export async function gitRead(gitDir, relativePath) {
  const result = await exec('git', [`--git-dir=${gitDir}`, 'show', `${SOURCE_COMMIT}:${relativePath}`], { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 })
  return result.stdout
}

function mutateOnce(source, from, to, id) {
  const first = source.indexOf(from)
  if (first < 0 || source.indexOf(from, first + 1) >= 0) throw new Error(`${id}: mutation preimage must occur exactly once`)
  return `${source.slice(0, first)}${to}${source.slice(first + from.length)}`
}

function extractClass(source, className) {
  const marker = `class ${className}(`
  const start = source.indexOf(marker)
  if (start < 0) throw new Error(`missing ${className}`)
  const rest = source.slice(start)
  const next = rest.search(/\nclass \w|\nif __name__ ==/)
  return next < 0 ? rest : rest.slice(0, next)
}

function extractMethod(source, className, methodName) {
  const classText = extractClass(source, className)
  const marker = `    def ${methodName}(`
  const start = classText.indexOf(marker)
  if (start < 0) throw new Error(`missing ${className}.${methodName}`)
  const rest = classText.slice(start)
  const next = rest.slice(marker.length).search(/\n    def \w+|\nclass \w|\nif __name__ ==/)
  const body = next < 0 ? rest : rest.slice(0, marker.length + next)
  return `class ${className}(unittest.TestCase):\n${body}`
}

async function write(root, relativePath, contents) {
  const destination = path.join(root, relativePath)
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, contents)
}

function pythonTestPrefix(file) {
  const engineImport = file.includes('response_headers') ? 'from engine import response_headers' : 'from engine import sql_count'
  return file.includes('test_sse.py')
    ? `#!/usr/bin/env python3\nimport os\nimport sys\nimport unittest\nsys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))\nimport oracle\n\nRULES = oracle.load_rules()\nREQ = {"method": "GET", "path": "/p/events"}\nSSE = {"content-type": "text/event-stream"}\nLEGACY = "event: tick\\nid: i1\\ndata: n1\\n\\r\\nevent: tick\\nid: i2\\ndata: n2\\n\\r\\n"\nMODERN = "event: tick\\nid: i1\\ndata: n1\\n\\nevent: tick\\nid: i2\\ndata: n2\\n\\n"\ndef line(body, status=200, headers=SSE):\n    d = {"request": REQ, "status": status, "body": body}\n    if headers is not None: d["headers"] = dict(headers)\n    return d\ndef verdict(l, g):\n    return oracle.compare_request(l, g, {"headers": ["content-type"]}, RULES)\n\n`
    : `#!/usr/bin/env python3\nimport http.client\nimport io\nimport os\nimport sys\nimport tempfile\nimport unittest\nHERE = os.path.dirname(os.path.abspath(__file__))\nsys.path.insert(0, os.path.dirname(HERE))\n${engineImport}\nLEGACY = "http://127.0.0.1:9082/daytrader"\nGENERATED = "http://127.0.0.1:40123/daytrader"\ndef message(*pairs):\n    raw = "".join(f"{name}: {value}\\r\\n" for name, value in pairs) + "\\r\\n"\n    return http.client.parse_headers(io.BytesIO(raw.encode("latin-1")))\ndef row(side, path, headers, method="GET", status=200):\n    return {"side": side, "method": method, "path": path, "status": status, "headers": headers}\nDERBY_PREFIX = "prefix "\ndef derby_line(statement, extra=""):\n    return f"{DERBY_PREFIX}Executing prepared statement: {statement} :End prepared statement{extra}\\n"\n\n`
}

async function materializeRust(root, gitDir, id) {
  const cargo = (await gitRead(gitDir, 'platform/crates/core-ids/Cargo.toml')).toString('utf8')
  const nodeSig = mutateOnce((await gitRead(gitDir, targetFiles[id])).toString('utf8'), ...recipes[id], id)
  await write(root, 'platform/Cargo.toml', '[workspace]\nresolver = "2"\nmembers = ["crates/core-ids"]\n[workspace.package]\nversion = "0.1.0"\nedition = "2021"\npublish = false\n[workspace.dependencies]\nthiserror = "2"\n')
  await write(root, 'platform/crates/core-ids/Cargo.toml', cargo)
  await write(root, 'platform/crates/core-ids/src/lib.rs', '#![forbid(unsafe_code)]\nmod node_sig;\npub use node_sig::{NodeSig, ENGINE_FILE_KIND, NODESIG_SCHEME_VERSION};\n')
  await write(root, targetFiles[id], nodeSig)
}

async function materializePython(root, gitDir, id) {
  if (id <= 'B05') {
    const sourceTest = (await gitRead(gitDir, 'tools/probes/_smoke/tests/test_sse.py')).toString('utf8')
    const source = mutateOnce((await gitRead(gitDir, targetFiles[id])).toString('utf8'), ...recipes[id], id)
    await write(root, targetFiles[id], source)
    await write(root, 'tools/probes/_smoke/oracle.py', await gitRead(gitDir, 'tools/probes/_smoke/oracle.py'))
    await write(root, 'tools/probes/_smoke/oracle-rules.json', await gitRead(gitDir, 'tools/probes/_smoke/oracle-rules.json'))
    await write(root, 'tools/probes/_smoke/tests/test_sse.py', `${pythonTestPrefix('test_sse.py')}${extractClass(sourceTest, 'SseRule')}\n\nif __name__ == "__main__": unittest.main()\n`)
    return
  }
  const response = id <= 'B08'
  const sourcePath = targetFiles[id]
  const source = mutateOnce((await gitRead(gitDir, sourcePath)).toString('utf8'), ...recipes[id], id)
  await write(root, sourcePath, source)
  await write(root, 'tools/behaviour-harness/engine/__init__.py', '')
  if (response) {
    await write(root, 'tools/behaviour-harness/engine/response_headers.json', await gitRead(gitDir, 'tools/behaviour-harness/engine/response_headers.json'))
    if (id === 'B07') {
      await write(root, 'tools/behaviour-harness/engine/kit.py', await gitRead(gitDir, 'tools/behaviour-harness/engine/kit.py'))
      await write(root, 'tools/behaviour-harness/engine/rendered_dom.py', await gitRead(gitDir, 'tools/behaviour-harness/engine/rendered_dom.py'))
      await write(root, 'tools/behaviour-harness/ui_server.py', await gitRead(gitDir, 'tools/behaviour-harness/ui_server.py'))
    }
    if (id === 'B08') {
      await write(root, 'tools/behaviour-harness/engine/report.py', await gitRead(gitDir, 'tools/behaviour-harness/engine/report.py'))
      await write(root, 'tools/behaviour-harness/engine/schema.py', await gitRead(gitDir, 'tools/behaviour-harness/engine/schema.py'))
      await write(root, 'tools/behaviour-harness/engine/scenario.py', await gitRead(gitDir, 'tools/behaviour-harness/engine/scenario.py'))
      await write(root, 'tools/behaviour-harness/engine/sql_count.py', await gitRead(gitDir, 'tools/behaviour-harness/engine/sql_count.py'))
    }
    const sourceTest = (await gitRead(gitDir, 'tools/behaviour-harness/tests/test_response_headers.py')).toString('utf8')
    const dependencies = id === 'B07' ? 'kit' : ''
    const prefix = pythonTestPrefix('test_response_headers.py').replace('from engine import response_headers', `from engine import ${dependencies ? `${dependencies}, ` : ''}response_headers`)
    const selectedTest = id === 'B08'
      ? extractMethod(sourceTest, visibleClasses[id], 'test_policy_results')
      : extractClass(sourceTest, visibleClasses[id])
    await write(root, 'tools/behaviour-harness/tests/test_response_headers.py', `${prefix}${selectedTest}\n\nif __name__ == "__main__": unittest.main()\n`)
  } else {
    const sourceTest = (await gitRead(gitDir, 'tools/behaviour-harness/tests/test_sql_count.py')).toString('utf8')
    await write(root, 'tools/behaviour-harness/tests/test_sql_count.py', `${pythonTestPrefix('test_sql_count.py')}${extractClass(sourceTest, visibleClasses[id])}\n\nif __name__ == "__main__": unittest.main()\n`)
  }
}

async function snapshotManifest(root, id) {
  const files = []
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(absolute)
      else if (entry.name !== 'manifest.json') files.push({ path: path.relative(root, absolute).split(path.sep).join('/'), sha256: sha256(await readFile(absolute)) })
    }
  }
  await walk(root)
  files.sort((a, b) => a.path.localeCompare(b.path))
  const recipe = recipes[id]
  return {
    schemaVersion: 1, id, sourceCommit: SOURCE_COMMIT, prompt: prompts[id], targetPath: targetFiles[id],
    allowedPaths: [targetFiles[id]], commands: [commands[id]], budgets: { modelCalls: 12, toolCalls: 40, seconds: 900, contextTokens: 4096, outputTokens: 256, schemaRetries: 1 },
    mutationSha256: sha256(`${recipe[0]}\0${recipe[1]}`),
    files
  }
}

export async function materializeBenchmarks(options) {
  const { repoRoot, gitDir, outputRoot } = options
  await mkdir(path.join(repoRoot, outputRoot, 'evaluator', 'recipes'), { recursive: true })
  for (const id of TASK_IDS) {
    const root = path.join(repoRoot, outputRoot, 'tasks', id, 'snapshot')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    if (id <= 'B02') await materializeRust(root, gitDir, id)
    else await materializePython(root, gitDir, id)
    await write(root, 'manifest.json', `${JSON.stringify(await snapshotManifest(root, id), null, 2)}\n`)
    const [from, to] = recipes[id]
    const recipe = { schemaVersion: 1, id, targetPath: targetFiles[id], mutation: { fromSha256: sha256(from), toSha256: sha256(to), fromBase64: Buffer.from(from).toString('base64'), toBase64: Buffer.from(to).toString('base64') }, referenceRepair: 'reverse mutation exactly once', hiddenEvaluator: `${id}-hidden-v1` }
    await write(path.join(repoRoot, outputRoot, 'evaluator', 'recipes'), `${id}.json`, `${JSON.stringify(recipe, null, 2)}\n`)
  }
  const suite = { schemaVersion: 1, sourceCommit: SOURCE_COMMIT, tasks: TASK_IDS.map((id) => ({ id, prompt: prompts[id], snapshot: `tasks/${id}/snapshot`, targetPath: targetFiles[id], manifest: `tasks/${id}/snapshot/manifest.json` })), resourceEnvelope: { memory: '8G', jobs: 4 }, generatedAt: new Date().toISOString() }
  await write(path.join(repoRoot, outputRoot), 'manifest.json', `${JSON.stringify(suite, null, 2)}\n`)
}

export function recipeFor(id) {
  const [from, to] = recipes[id]
  return { id, targetPath: targetFiles[id], from, to, prompt: prompts[id], command: commands[id] }
}

export async function listFiles(root) {
  const out = []
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(absolute)
      else out.push(path.relative(root, absolute).split(path.sep).join('/'))
    }
  }
  await walk(root)
  return out.sort()
}

export async function hashTree(root, exclude = []) {
  const skipped = new Set(exclude)
  const files = (await listFiles(root)).filter((file) => !skipped.has(file))
  return { files: files.map((file) => ({ path: file, sha256: sha256FromFileSync(root, file) })), sha256: sha256(files.map((file) => `${file}\0${sha256FromFileSync(root, file)}\n`).join('')) }
}

import { readFileSync } from 'node:fs'
function sha256FromFileSync(root, file) { return sha256(readFileSync(path.join(root, file))) }
