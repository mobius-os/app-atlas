const codeIdentity = (code) => String(code)
const conflictContexts = (context) => (
  context?.kind === 'mobius-conflict-context-batch'
  && context?.version === 1 && Array.isArray(context.items)
    ? context.items.flatMap(conflictContexts)
    : [context]
)

export function codeSetConflictContext({ base, mine }) {
  const before = new Set(Array.isArray(base) ? base.map(codeIdentity) : [])
  const after = new Set(Array.isArray(mine) ? mine.map(codeIdentity) : [])
  return {
    kind: 'atlas-code-set',
    added: [...after].filter((code) => !before.has(code)),
    removed: [...before].filter((code) => !after.has(code)),
  }
}

export function applyCodeSetIntent(current, context) {
  const next = new Set(Array.isArray(current) ? current.map(codeIdentity) : [])
  for (const code of context?.removed || []) next.delete(codeIdentity(code))
  for (const code of context?.added || []) next.add(codeIdentity(code))
  return [...next].sort()
}

export function installCodeSetConflictRecovery(
  storage = window.mobius?.storage,
  runtimeFeatures = typeof window !== 'undefined' ? window.mobius?.runtimeFeatures : null,
) {
  if (runtimeFeatures?.authoritativeVersionedReads !== true
      || !storage?.onConflict || !storage?.getWithVersion || !storage?.durableWrite) return () => {}
  return storage.onConflict(async (conflict) => {
    const context = conflict?.conflictContext
    const intents = conflictContexts(context)
    if (!['visited.json', 'wishlist.json'].includes(conflict?.path)
        || !intents.length
        || intents.some((intent) => intent?.kind !== 'atlas-code-set')) return false
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = await storage.getWithVersion(conflict.path, 'json')
      if (current?.offline === true) return false
      const merged = intents.reduce(applyCodeSetIntent, current?.value)
      try {
        const result = await storage.durableWrite(conflict.path, merged, {
          kind: 'json',
          ...(current?.version ? { ifMatch: current.version } : { ifNoneMatch: true }),
          conflictContext: context,
        })
        return result?.durability === 'synced'
      } catch (error) {
        if (error?.code !== 'conflict') throw error
      }
    }
    return false
  })
}
