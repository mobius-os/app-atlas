import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyCodeSetIntent,
  codeSetConflictContext,
  installCodeSetConflictRecovery,
} from '../sync.js'

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
  const detach = installCodeSetConflictRecovery(storage)
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
  installCodeSetConflictRecovery(storage)
  assert.equal(await listener({
    path: 'visited.json',
    conflictContext: context,
    refusedValue: ['DEU'],
  }), true)
  assert.deepEqual(writes[0].value, ['DEU', 'FRA'])
  assert.deepEqual(writes[0].options.conflictContext, context)
})
