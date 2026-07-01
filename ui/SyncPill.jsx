// --------------------------------------------------------------------------
// Sync pill — surfaces offline state next to the counter.
// --------------------------------------------------------------------------
// Offline is the primary state surfaced; a transient online "Saving…" appears
// while a durable write is in flight (useDocument status==='saving') so a
// queued change isn't invisible. Online + idle → null (clean steady state).
// hasRuntime=false means the runtime didn't load (dev/fallback) — there's no
// offline outbox to surface, so the pill stays hidden in that mode.
export function SyncPill({ online, hasRuntime, saving = false }) {
  if (!hasRuntime) return null
  if (!online) {
    return (
      <span
        className="cb-pill cb-pill--offline"
        role="status"
        aria-live="polite"
        title="You're offline — taps will sync when you're back online."
      >
        <span className="cb-pill-dot" aria-hidden="true" />
        Offline
      </span>
    )
  }
  if (saving) {
    return (
      <span
        className="cb-pill cb-pill--saving"
        role="status"
        aria-live="polite"
        title="Saving your change…"
      >
        <span className="cb-pill-dot" aria-hidden="true" />
        Saving…
      </span>
    )
  }
  return null
}
