// --------------------------------------------------------------------------
// Sync pill — SILENT WHEN HEALTHY.
// --------------------------------------------------------------------------
// window.mobius.storage queues writes durably; an in-flight "Saving…" while
// online is invisible plumbing, not information — so the pill NEVER renders it
// (that online saving indicator was removed). The pill mounts ONLY when the app
// is offline, with the plain word "Offline" (no counts, no timestamps). A
// dead-letter the owner must act on is surfaced separately as the .cb-error
// banner in the app root. hasRuntime=false (dev/fallback host) means there is
// no offline outbox at all, so there is nothing to announce.
export function SyncPill({ online, hasRuntime }) {
  if (!hasRuntime) return null
  if (online) return null
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
