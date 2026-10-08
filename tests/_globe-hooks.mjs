// Minimal synchronous commit harness: stable hook slots, dependency comparisons,
// batched state updates, ref attachment and effect cleanup. Not a browser renderer.
let current
const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
export function useRef(value) {
  const i = current.index++
  return current.slots[i] ||= { current: value }
}
export function useState(initial) {
  const h = current, i = h.index++
  const slot = h.slots[i] ||= { value: typeof initial === 'function' ? initial() : initial }
  return [slot.value, next => {
    if (!h.mounted) { h.lateUpdates++; return }
    const value = typeof next === 'function' ? next(slot.value) : next
    if (!Object.is(value, slot.value)) { slot.value = value; h.dirty = true }
  }]
}
export function useMemo(factory, deps) {
  const i = current.index++, old = current.slots[i]
  if (!old || !equal(old.deps, deps)) current.slots[i] = { value: factory(), deps }
  return current.slots[i].value
}
export const useCallback = (fn, deps) => useMemo(() => fn, deps)
export function useEffect(fn, deps) {
  const i = current.index++, old = current.slots[i]
  if (!old || !equal(old.deps, deps)) {
    const slot = { deps, cleanup: old?.cleanup }
    current.slots[i] = slot
    current.effects.push(() => { slot.cleanup?.(); slot.cleanup = fn() })
  }
}
export const useLayoutEffect = useEffect
export function jsx(type, props) {
  if (props.ref && typeof props.ref === 'object') props.ref.current = current.nodes[type] || null
  return { type, props }
}
export const jsxs = jsx
export function mount(Component, props, nodes) {
  const h = { slots: [], index: 0, effects: [], dirty: true, mounted: true, lateUpdates: 0, nodes }
  h.flush = () => {
    for (let count = 0; h.dirty && h.mounted; count++) {
      if (count > 30) throw new Error('hook harness did not settle')
      h.dirty = false; h.index = 0; current = h
      Component(props)
      const effects = h.effects.splice(0)
      for (const effect of effects) effect()
    }
  }
  h.unmount = () => {
    h.mounted = false
    for (const slot of h.slots) slot?.cleanup?.()
  }
  h.flush()
  return h
}
