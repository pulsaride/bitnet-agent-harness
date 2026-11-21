#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { SkillLoader } from '../../src/skills/loader.ts'

async function skill(root, dir, body = '# Skill body') {
  await mkdir(path.join(root, dir), { recursive: true })
  await writeFile(path.join(root, dir, 'SKILL.md'), `---\nname: ${dir}\ndescription: Test ${dir} skill\nmetadata:\n  version: 1.0.0\n---\n${body}\n`)
}

test('discovers summaries and progressively activates body and references', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'bitnet-skills-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await skill(root, 'code-explanation', '# Explain code\n\n[details](references/details.md)')
  await mkdir(path.join(root, 'code-explanation', 'references'))
  await writeFile(path.join(root, 'code-explanation', 'references', 'details.md'), 'deep details')
  const loader = new SkillLoader([root])
  const discovered = await loader.discover()
  assert.equal(discovered[0].name, 'code-explanation')
  assert.equal('body' in discovered[0], false)
  const activated = await loader.activate('code-explanation', 10_000)
  assert.match(activated.body, /Explain code/)
  assert.equal(await loader.loadReference('code-explanation', 'references/details.md', 1000), 'deep details')
})

test('skill allowed-tools cannot grant authority and escaping symlinks are skipped', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'bitnet-poison-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await skill(root, 'valid')
  await mkdir(path.join(root, 'bad'))
  const outside = path.join(root, '..', 'outside-skill')
  await writeFile(outside, 'outside')
  await symlink(outside, path.join(root, 'bad', 'SKILL.md'))
  const discovered = await new SkillLoader([root]).discover()
  assert.deepEqual(discovered.map((entry) => entry.name), ['valid'])
  assert.equal(discovered[0].allowedTools, undefined)
})
