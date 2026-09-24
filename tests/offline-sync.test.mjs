import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyCodeSetIntent,
  codeSetConflictContext,
  codeSetPersistenceOptions,
  installCodeSetConflictRecovery,
} from '../sync.js'

test('older runtimes keep Atlas document writes in LWW mode', () => {
  assert.deepEqual(codeSetPersistenceOptions({}), { mode: 'lww' })
})

test('older runtimes do not install Atlas conditional conflict recovery', () => {
  let installed = false
  const storage = {
    onConflict() { installed = true; return () => {} },
    async getWithVersion() {},
    async durableWrite() {},
  }
  const detach = installCodeSetConflictRecovery(storage, {})
  assert.equal(installed, false)
  assert.equal(typeof detach, 'function')
})

test('an offline Atlas add is replayed over a disjoint remote add', async () => {
  const context = codeSetConflictContext({ base: [], mine: ['BIH'] })
  let listener
  const writes = []
  const storage = {
    onConflict(cb) { listener = cb; return () => { listener = null } },
    async getWithVersion() { return { value: ['FRA'], version: 'remote-v2' } },
    async durableWrite(path, value, options) {
      writes.push({ path, value, options })
      return { durability: 'synced' }
    },
  }
  const detach = installCodeSetConflictRecovery(storage, { authoritativeVersionedReads: true })
  assert.equal(await listener({
    path: 'visited.json',
    conflictContext: context,
    refusedValue: ['BIH'],
  }), true)
  assert.deepEqual(writes[0].value, ['BIH', 'FRA'])
  assert.equal(writes[0].options.ifMatch, 'remote-v2')
  assert.deepEqual(writes[0].options.conflictContext, context)
  detach()
})

test('Atlas leaves a queued conflict recovery unacknowledged', async () => {
  const context = codeSetConflictContext({ base: [], mine: ['BIH'] })
  let listener
  const storage = {
    onConflict(cb) { listener = cb; return () => { listener = null } },
    async getWithVersion() { return { value: ['FRA'], version: 'remote-v2' } },
    async durableWrite() { return { durability: 'queued' } },
  }
  installCodeSetConflictRecovery(storage, { authoritativeVersionedReads: true })
  assert.equal(await listener({
    path: 'visited.json',
    conflictContext: context,
    refusedValue: ['BIH'],
  }), false)
})

test('Atlas replay merges from the authoritative server while a replacement is queued', async () => {
  const context = codeSetConflictContext({ base: [], mine: ['BIH'] })
  const reads = [
    { value: ['FRA'], version: 'remote-v2' },
    { value: ['DEU', 'FRA'], version: 'remote-v3' },
  ]
  let listener
  const writes = []
  const storage = {
    onConflict(cb) { listener = cb; return () => {} },
    async getWithVersion() { return reads.shift() },
    async durableWrite(path, value, options) {
      writes.push({ path, value, options })
      return { durability: writes.length === 1 ? 'queued' : 'synced' }
    },
  }
  installCodeSetConflictRecovery(storage, { authoritativeVersionedReads: true })
  const conflict = {
    path: 'visited.json',
    conflictContext: context,
    refusedValue: ['BIH'],
  }

  assert.equal(await listener(conflict), false)
  assert.equal(await listener(conflict), true)
  assert.deepEqual(writes[1].value, ['BIH', 'DEU', 'FRA'])
  assert.equal(writes[1].options.ifMatch, 'remote-v3')
})

test('Atlas conflict intents preserve removals while retaining unrelated remote membership', () => {
  const context = codeSetConflictContext({ base: ['BIH', 'DEU'], mine: ['DEU'] })
  assert.deepEqual(applyCodeSetIntent(['BIH', 'DEU', 'FRA'], context), ['DEU', 'FRA'])
})

test('Atlas replays an ordered offline intent batch, including a reversal', async () => {
  const context = {
    kind: 'mobius-conflict-context-batch',
    version: 1,
    items: [
      codeSetConflictContext({ base: [], mine: ['BIH'] }),
      codeSetConflictContext({ base: ['BIH'], mine: ['BIH', 'DEU'] }),
      codeSetConflictContext({ base: ['BIH', 'DEU'], mine: ['DEU'] }),
    ],
  }
  let listener
  const writes = []
  const storage = {
    onConflict(cb) { listener = cb; return () => {} },
    async getWithVersion() { return { value: ['FRA'], version: 'remote-v2' } },
    async durableWrite(path, value, options) {
      writes.push({ path, value, options })
      return { durability: 'synced' }
    },
  }
  installCodeSetConflictRecovery(storage, { authoritativeVersionedReads: true })
  assert.equal(await listener({
    path: 'visited.json',
    conflictContext: context,
    refusedValue: ['DEU'],
  }), true)
  assert.deepEqual(writes[0].value, ['DEU', 'FRA'])
  assert.deepEqual(writes[0].options.conflictContext, context)
})
