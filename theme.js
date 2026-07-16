// ----------------------------------------------------------------- styles ---

export const CSS = `
/* mobius-ui:NativeTouch v1 — keep in sync; library candidate. Diverge below the marker only. */
* { -webkit-tap-highlight-color: transparent; }
.cb-sheet-handle, .cb-detail-cta, .cb-detail-close, .cb-sheet-search-clear, .cb-row-open {
  touch-action: manipulation;
}
.cb-header, .cb-counter, .cb-pill, .cb-detail-flag, .cb-row-flag {
  user-select: none; -webkit-user-select: none;
}
.cb-detail-close:active { transform: scale(0.94); }
.cb-list { overscroll-behavior: contain; }
.cb-detail-body { overscroll-behavior: contain; }
.cb-sheet-search input { font-size: 16px; }
@media (hover: hover) {
  .cb-country:not(.cb-country--visited):not(.cb-country--wishlist):not(.cb-country--selected):hover {
    fill: var(--cb-land-hover);
  }
  .cb-row:hover {
    background: color-mix(in srgb, var(--surface2, var(--surface)) 80%, transparent);
  }
  .cb-sheet-search-clear:hover { color: var(--text); }
  .cb-detail-close:hover {
    background: var(--surface2, var(--surface));
    color: var(--text);
  }
}
/* /mobius-ui:NativeTouch */

/* mobius-ui:Focus v1 -- shared keyboard focus ring (WCAG 2.4.7); never bare outline:none */
:where(button,a,input,textarea,select,summary,[role="button"],[tabindex]:not([tabindex="-1"])):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
/* /mobius-ui:Focus */

/* mobius-ui:Root v1 — keep in sync; library candidate. Diverge below the marker only. */
.cb-app {
  /* mobius-ui:identity-palette — DELIBERATE divergence. The ocean blue is
     an atlas-identity color the theme tokens can't express; it keeps a
     stable atlas identity while mixing in the active theme background so
     standalone installs and shell embeds do not feel like different apps.
     Keep these hardcoded hex; everything else rides the theme tokens. */
  --cb-ocean-1: color-mix(in srgb, #5aa7d8 76%, var(--bg) 24%);
  --cb-ocean-2: color-mix(in srgb, #186cae 82%, var(--bg) 18%);
  --cb-ocean-3: color-mix(in srgb, #082a5d 92%, var(--bg) 8%);
  /* /mobius-ui:identity-palette */
  /* Specular shine — a soft highlight. Mixing with literal white
     read OK on dark themes but flat-out vanished into the page on
     light ones; mix toward --bg so the highlight sits one shade
     lighter than the underlying surface in every theme. The
     accent tint keeps the globe feeling planet-shaped rather
     than just paler-than-its-frame. */
  --cb-shine-1: color-mix(in srgb, #ffffff 30%, transparent);
  --cb-shine-2: color-mix(in srgb, #d8efff 13%, transparent);
  --cb-shine-3: transparent;
  --cb-surface: color-mix(in srgb, var(--surface) 82%, transparent);
  /* --surface2 isn't guaranteed by every Möbius theme; fall back
     to --surface so the sheet stays solid on themes that don't
     define the deeper surface token. */
  --cb-surface-strong: color-mix(in srgb, var(--surface2, var(--surface)) 92%, transparent);
  --cb-border: var(--border);
  --cb-land-fill: color-mix(in srgb, #c7b98f 82%, var(--surface) 18%);
  --cb-land-hover: color-mix(in srgb, #d8c99d 82%, var(--text) 18%);
  --cb-land-stroke: color-mix(in srgb, #24333b 62%, var(--bg) 38%);
  /* Status colours are overlays, not alternate terrain. The fill mixes status
     back into the same neutral land, so the procedural world texture remains
     visible and unvisited countries never look accidentally marked. */
  --cb-visited-base: color-mix(in srgb, var(--green, #27ae60) 78%, var(--accent) 22%);
  --cb-visited-fill: color-mix(in srgb, var(--cb-visited-base) 48%, var(--cb-land-fill) 52%);
  --cb-visited-stroke: color-mix(in srgb, var(--cb-visited-base) 58%, var(--cb-land-stroke) 42%);
  --cb-wishlist: color-mix(in srgb, #f39c12 88%, var(--cb-land-fill) 12%);
  --cb-wishlist-fill: color-mix(in srgb, var(--cb-wishlist) 54%, var(--cb-land-fill) 46%);
  /* Selected fill: the theme accent brightened with literal white — NOT
     --text, which flips dark on light themes and would read as shadow
     instead of highlight. The white lift keeps it clearly lighter than
     the visited green even on themes whose accent is itself green. */
  --cb-selected-fill: color-mix(in srgb, var(--accent) 72%, #ffffff 28%);
  /* Foreground on the ACTIVE 'Been'/'Want to go' CTAs. Those CTAs fill with the
     app-identity status colors (--cb-visited-fill green / --cb-wishlist orange),
     NOT the theme --accent — so --accent-fg is the wrong token here: on the
     default theme it resolves to white, and white on the orange fill is ~2:1
     (WCAG fail). Per the design conventions' own carve-out, a foreground on an
     app-specific accent the theme can't express stays a hardcoded, contrast-
     tuned ink. This dark ink clears 6:1+ on both the green and the orange fill
     in light AND dark themes (the fills are app-owned and only mix ~12% with
     theme tokens, so they stay legible under any theme). Deliberate identity-
     palette divergence, like --cb-ocean above. */
  --cb-active-cta-text: #101820;
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  /* App-root/page background is the plain theme token, matching every other
     Möbius app. The accent radial-gradient that used to sit here tinted the
     whole page; the globe carries its own scene (ocean gradient, accent halo)
     so the planet still reads as a planet without painting the chrome. */
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  overflow: hidden;
}

.cb-error {
  margin: 0 18px 8px;
  padding: 10px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--text);
  border: 1px solid var(--cb-border);
  font-size: 13px;
}
.cb-banner {
  margin: 0 18px 8px;
  padding: 8px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  border: 1px solid var(--cb-border);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}
/* /mobius-ui:Root */

/* mobius-ui:Header v1 — keep in sync; library candidate. Diverge below the marker only. */
.cb-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  /* Top-pinned bar: clear the notch / status bar on phones. */
  padding: max(14px, env(safe-area-inset-top)) 18px 8px;
  flex-shrink: 0;
}
.cb-header h1 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0;
  color: var(--text);
  min-width: 0;
  line-height: 1.15;
}
/* Rotating hero saying — flavor text, not a headline shout. Slightly softer
   weight/size than a title and truncated to one line so a longer phrase can't
   wrap into the meta chips. */
.cb-saying {
  font-size: 15px;
  font-weight: 500;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Brand mark: the app's real glossy icon, no name text. The changing
   sentence ("12 stamps on the map.") sits beside it as status, not
   identity. */
.cb-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.cb-brand-icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  display: block;
}
.cb-brand-fallback {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  /* Accent FILL → --accent-fg is the one legal foreground (no fallback hex):
     the shell themes it to a legible ink for the active accent, so a custom
     theme can't strand this glyph unreadable the way var(--bg) did. */
  background: var(--accent-hover, var(--accent));
  color: var(--accent-fg);
  font-weight: 700;
  line-height: 1;
}
.cb-header-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
@media (min-height: 760px) {
  .cb-header h1 { font-size: 20px; }
}
/* Tablet spacing. The actual desktop workspace switch lives beside the
   workspace styles below, where the map and country panel can be read as one
   responsive component rather than unrelated header overrides. */
@media (min-width: 720px) {
  .cb-header {
    padding: max(18px, env(safe-area-inset-top)) 24px 12px;
  }
}
@media (max-width: 430px) {
  .cb-header {
    align-items: center;
    padding: max(12px, env(safe-area-inset-top)) 14px 8px;
  }
  .cb-header h1 {
    font-size: 16px;
  }
  .cb-counter {
    padding: 5px 9px;
  }
}
/* /mobius-ui:Header */

/* mobius-ui:SyncPill v1 — keep in sync; library candidate. Diverge below the marker only. */
.cb-counter {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cb-surface) 88%, var(--bg) 12%);
  border: 1px solid var(--cb-border);
  /* Derived stats render in --mono to match how sibling apps set
     numeric/metadata chips. */
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
  transition: opacity 200ms ease;
}
.cb-counter--faded {
  /* When we boot offline with no cached GeoJSON, the totals are
     unknown — fade the counter so the user doesn't read a
     confidently-stated "0 / …" as fact. */
  opacity: 0.55;
}
/* Balanced counter (Change 3): the visited count and the total now read at
   the SAME size and weight — the old design set 54 at 18px accent and /195 at
   13px muted, which made the pair look lopsided. Only color separates them
   (the current count picks up the accent; the divider + total sit in muted),
   so "54 / 195" reads as one tidy, even fraction. */
.cb-counter-now {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
}
.cb-counter-sep,
.cb-counter-total {
  font-size: 14px;
  font-weight: 600;
  color: var(--muted);
}
/* Sync pill — SILENT WHEN HEALTHY: not rendered while online. It mounts only
   when offline, to plainly announce that taps will sync on reconnect. (The old
   online "Saving…" state was removed — durable queuing is invisible plumbing.) */
.cb-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  /* Metadata chip: --mono + tabular-nums so the pending count reads as a
     derived stat, matching sibling apps. */
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  border: 1px solid var(--cb-border);
  background: var(--cb-surface);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.cb-pill-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
}
.cb-pill--offline .cb-pill-dot {
  background: color-mix(in srgb, var(--text) 50%, transparent);
}
/* /mobius-ui:SyncPill */

/* Atlas workspace. Mobile keeps the original vertical globe + draggable
   bottom-sheet composition. At desktop width it becomes a map workspace with
   a persistent country sidebar, so search, filters, and the list are visible
   without dragging a phone control across a large web canvas. */
.cb-workspace {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* mobius-ui:Globe v1 — keep in sync; library candidate. Diverge below the marker only. */
.cb-globe-shell {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
  overflow: hidden;
}
.cb-globe-shell::before {
  content: '';
  position: absolute;
  inset: 4% 0 10%;
  pointer-events: none;
  background:
    radial-gradient(circle at 50% 42%,
      color-mix(in srgb, var(--accent) 12%, transparent) 0%,
      color-mix(in srgb, #55c7ff 8%, transparent) 34%,
      transparent 68%);
  filter: blur(14px);
  opacity: 0.8;
}
.cb-globe-canvas {
  position: absolute;
  inset: 0;
  /* touch-action:none on the container div prevents the shell zoom-lock
     from eating pinch gestures before the SVG's own touchAction:none
     takes effect — important during the first render frame. */
  touch-action: none;
}
.cb-globe-svg {
  width: 100%;
  height: 100%;
  display: block;
}
/* Suppress the outline only for mouse/touch focus; the shared Focus
   block below still paints a ring for keyboard (:focus-visible) users. */
.cb-globe-svg:focus:not(:focus-visible) {
  outline: none;
}
.cb-globe-svg g[role='button']:focus:not(:focus-visible) {
  outline: none;
}
/* The focused country may sit near or behind the limb where a thin
   stroke is easy to miss — pair a thick accent stroke with a
   non-scaling accent halo so keyboard focus is unmistakable. */
.cb-globe-svg g[role='button']:focus-visible {
  outline: none;
}
.cb-globe-svg g[role='button']:focus-visible .cb-country {
  stroke: var(--accent);
  stroke-width: 2.2;
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--accent) 70%, transparent));
}
.cb-globe-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 14px;
  text-align: center;
  padding: 0 24px;
}
.cb-globe-loading--offline {
  /* Sticks slightly above center so it doesn't overlap the bottom
     sheet's grip on short viewports. */
  align-items: start;
  padding-top: 28%;
}
.cb-country {
  fill: var(--cb-land-fill);
  stroke: var(--cb-land-stroke);
  stroke-width: 0.48;
  opacity: 1;
  transition: fill 180ms ease, stroke 180ms ease, opacity 180ms ease;
  cursor: pointer;
}
.cb-country--visited {
  fill: var(--cb-visited-fill);
  /* Stroke previously mixed accent with literal "white", which
     vanished the outline on light themes. Mix with --bg so the
     border keeps separation from the ocean in every theme. */
  stroke: var(--cb-visited-stroke);
  stroke-width: 0.64;
}
.cb-country--wishlist {
  fill: var(--cb-wishlist-fill);
  stroke: color-mix(in srgb, var(--cb-wishlist) 58%, var(--cb-land-stroke) 42%);
  stroke-width: 0.64;
}
.cb-country--selected {
  /* Selection highlights the TERRITORY, never its boundary. A stroke-based
     highlight can't work here: each country is one path, but countries
     paint in document order, so a neighbor drawn later overpaints the half
     of the selection stroke that falls on its side of a shared border (and
     redraws its own dark stroke on top) — the white outline showed up
     broken wherever the selected country touched land. A fill can't be
     overpainted (polygons tile), and because the whole MultiPolygon is one
     path keyed by iso3 the fill covers every island and exclave too.
     The country keeps its normal boundary stroke (land/visited/wishlist);
     only the fill changes — flat, no glow (owner feedback: drop-shadows
     read as smudge, and the accent+white fill is unambiguous on its own).
     Overrides visited/wishlist fill so the selection is always clear —
     the CTA state in the detail panel shows the status instead. */
  fill: var(--cb-selected-fill);
}
/* Status filter mirror — countries outside the active filter fade back so
   the matching set reads at a glance. Opacity (not a fill swap) keeps the
   visited/wishlist hue legible through the fade, and the dimmed paths stay
   tappable so the user can still select and mark them. */
.cb-country--dimmed {
  opacity: 0.3;
}
/* /mobius-ui:Globe */

/* mobius-ui:Sheet v1 — keep in sync; library candidate. Diverge below the marker only. */
.cb-sheet {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--cb-surface-strong);
  backdrop-filter: blur(14px);
  border-top: 1px solid var(--cb-border);
  /* Sheet top on the shared radius scale (16px). */
  border-radius: 16px 16px 0 0;
  /* Neutral elevation shadow — same in light + dark themes; the
     color-mix tint comes from the surface underneath. */
  box-shadow: 0 -4px 8px color-mix(in srgb, var(--text) 18%, transparent);
  /* Drag updates set height directly; avoid animating layout properties so
     the globe and list stay responsive during snap changes. */
  transition: box-shadow 180ms ease, border-color 180ms ease;
  overflow: hidden;
  /* min-height previously used vh which conflicted with the
     percent-of-cb-app inline height during keyboard-up; drop
     the min entirely — SHEET_MIN (0.30) already enforces the
     floor in code. */
}
.cb-sheet--dragging {
  transition: none;
}
.cb-sheet-handle {
  /* Subtle grab affordance, not a band. The visible row is short (26px)
     to give the list back ~18px of vertical space (owner: the handle ate
     too much). The grip is centred in the 26px row; a ::before below extends
     the actual touch target to 44px. */
  flex-shrink: 0;
  height: 26px;
  display: grid;
  place-items: center;
  touch-action: none;
  cursor: ns-resize;
  position: relative;
}
/* WCAG 2.5.8: a resize handle is an interactive control and must offer a
   >=44px touch target. The visible grip stays a slim 26px; this transparent
   ::before grows the HIT area to 44px without eating list space. It extends
   DOWNWARD (the sheet's rounded top edge + overflow:hidden clip anything
   above), and where it reaches the search row below, those later-painted
   controls win hit-testing — so the search field stays tappable while the
   surrounding gap grabs the handle. */
.cb-sheet-handle::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 44px;
}
/* The handle is keyboard-operable (role=separator, tabindex 0, arrow-key
   resize). Inset the shared focus ring so it reads inside the short 26px row
   instead of bleeding into the list/globe above and below. */
.cb-sheet-handle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -3px;
  border-radius: 8px;
}
@media (hover: hover) {
  .cb-sheet-handle:hover .cb-sheet-grip {
    background: color-mix(in srgb, var(--text) 36%, transparent);
  }
}
.cb-sheet-grip {
  width: 34px;
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 20%, transparent);
}
.cb-sheet-search {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  box-sizing: border-box;
  padding: 0 6px 0 14px;
  border-radius: 12px;
  background: var(--cb-surface);
  border: 1px solid var(--cb-border);
  color: var(--muted);
}
.cb-sheet-search-icon {
  flex-shrink: 0;
  display: block;
  color: var(--muted);
}
.cb-sheet-search input {
  /* width:100% + box-sizing keeps the field a constant width as the user
     types — flex:1 alone let WebKit's intrinsic input sizing nudge the pill
     wider/narrower per character, so the search box visibly reflowed. */
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  align-self: stretch;
  min-height: 44px;
  background: transparent;
  border: 0;
  color: var(--text);
  font: inherit;
  /* Drop the native search affordance: type="search" paints WebKit's own
     ::-webkit-search-cancel-button, which doubled up with the app's custom
     clear button (two × glyphs). appearance:none removes the styled control
     so only the app's button shows. */
  appearance: none;
  -webkit-appearance: none;
}
/* Belt-and-braces: some WebKit builds still draw the cancel button even with
   appearance:none on the input, so hide the pseudo-element outright. */
.cb-sheet-search input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
  display: none;
}
.cb-sheet-search input::-webkit-search-decoration {
  -webkit-appearance: none;
  appearance: none;
  display: none;
}
/* Keep the borderless look for mouse focus; the shared Focus block
   still paints a keyboard ring on :focus-visible. */
.cb-sheet-search input:focus:not(:focus-visible) {
  outline: 0;
}
.cb-sheet-search input::placeholder {
  color: var(--muted);
}
.cb-sheet-search-clear {
  /* 44px hit target (WCAG 2.5.8); the visible glyph stays small because the
     button centres it. Was 28px — below the 44px floor for a touch target. */
  flex-shrink: 0;
  min-width: 44px;
  min-height: 44px;
  /* The pill has no vertical padding, so showing this button never changes
     the row height. Its 44px hit target remains flush with the right edge. */
  margin: 0;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  border: 0;
  cursor: pointer;
}
/* /mobius-ui:Sheet */

/* Search + status-filter row above the list. The search pill flexes to
   fill; the chips keep fixed 44px touch targets. */
.cb-sheet-controls {
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin: 4px 14px 10px;
}
.cb-filters {
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
}
.cb-filter {
  width: 44px;
  min-height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 12px;
  border: 1px solid var(--cb-border);
  background: var(--cb-surface);
  color: var(--muted);
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
}
.cb-filter:active {
  transform: scale(0.94);
}
.cb-filter.is-on {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  color: var(--accent);
}
.cb-filter-label {
  display: none;
}
@media (hover: hover) {
  .cb-filter:hover { color: var(--text); }
  .cb-filter.is-on:hover { color: var(--accent); }
}

/* mobius-ui:Card v1 — keep in sync; library candidate. Diverge below the marker only. */
/* Detail panel and list panel sit in the same flex slot. Exactly one
   is visible at a time; the other is display:none so it takes no space
   but stays mounted — this is the mechanism that preserves scrollTop on
   the list without any JS save/restore logic. */
.cb-detail--hidden,
.cb-list-panel--hidden {
  display: none !important;
}
.cb-list-panel {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
/* Detail view — shown while a country is selected. It deliberately keeps the
   same sheet height the list had, so tapping a country never shrinks the globe.
   The content is dense: a compact header, a tight fact grid, and a small pinned
   action bar. */
.cb-detail {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden; /* the body scrolls, not the shell */
}
/* Condensed header — pinned at the top of the detail. */
.cb-detail-head {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 4px 14px 6px;
  border-bottom: 1px solid color-mix(in srgb, var(--cb-border) 54%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface2, var(--surface)) 34%, transparent),
    transparent
  );
}
.cb-detail-flag {
  font-size: 25px;
  line-height: 1;
  filter: drop-shadow(0 2px 5px color-mix(in srgb, var(--text) 18%, transparent));
}
.cb-detail-name {
  min-width: 0; /* let the name ellipsize instead of pushing the close button off */
}
.cb-detail-name strong {
  display: block;
  font-size: 17px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cb-detail-name small {
  display: block;
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--muted);
  letter-spacing: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* The one scrolling region. At the default collapsed height it fits the normal
   four facts without forcing the globe smaller; if a country has unusually long
   language text, this narrow band scrolls instead of expanding the sheet. */
.cb-detail-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 14px;
}
/* Basic-info card — dense 2x2 fact grid. */
.cb-info {
  margin: 0;
  /* Don't let the flex body squeeze the facts card: when the sheet is dragged
     very short the body must scroll, not crush the card to a sliver. shrink:0
     keeps the card at its natural height so .cb-detail-body overflows (and
     scrolls) instead of clipping the rows. */
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.cb-info-row {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  min-height: 42px;
  padding: 6px 9px;
  border: 1px solid color-mix(in srgb, var(--cb-border) 58%, transparent);
  border-radius: 10px;
  background:
    linear-gradient(145deg,
      color-mix(in srgb, var(--surface2, var(--surface)) 64%, transparent),
      color-mix(in srgb, var(--surface) 42%, transparent));
  box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 5%, transparent);
}
.cb-info-row dt {
  font-size: 10.5px;
  letter-spacing: 0;
  color: var(--muted);
}
.cb-info-row dd {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.15;
  color: var(--text);
  text-align: left;
  /* Numeric facts (population/area) align as derived stats, matching the
     counter chip's tabular treatment. */
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.cb-detail-close {
  width: 44px;
  min-width: 44px;
  min-height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface2, var(--surface)) 80%, transparent);
  color: var(--muted);
  border: 1px solid var(--cb-border);
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease, transform 120ms ease;
}
.cb-detail-cta {
  min-height: 44px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0;
  background: color-mix(in srgb, var(--surface2, var(--surface)) 88%, transparent);
  color: var(--text);
  border: 1px solid var(--cb-border);
  cursor: pointer;
  transition: transform 120ms ease, background 160ms ease, color 160ms ease;
}
/* Pinned action bar — flex-shrink:0 keeps it on-screen while the facts scroll.
   The top divider + surface tint read it as a footer; the safe-area inset (now
   that the shell dropped its own padding) keeps the CTAs clear of the home
   indicator on notched phones. */
.cb-detail-actions {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  padding: 8px 14px max(8px, env(safe-area-inset-bottom));
  border-top: 1px solid color-mix(in srgb, var(--cb-border) 54%, transparent);
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--cb-surface-strong) 42%, transparent),
      color-mix(in srgb, var(--cb-surface-strong) 76%, transparent));
}
.cb-detail-cta:active {
  transform: scale(0.985);
}
.cb-detail-cta--visited.is-on {
  background: var(--cb-visited-fill);
  color: var(--cb-active-cta-text);
  border-color: var(--cb-visited-fill);
}
.cb-detail-cta--wishlist.is-on {
  background: var(--cb-wishlist);
  color: var(--cb-active-cta-text);
  border-color: var(--cb-wishlist);
}
.cb-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  /* Bottom-most surface: keep the last row clear of the home
     indicator / gesture bar on notched phones. */
  padding: 0 12px max(18px, env(safe-area-inset-bottom));
  -webkit-overflow-scrolling: touch;
}
/* mobius-ui:Empty v1 — keep in sync; library candidate. Diverge below the marker only. */
/* Three-part empty state (mark + title + subtitle) for the list — loading, no
   search match, no visited, no wishlist — replacing the old bare one-liners. */
.cb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  max-width: 440px;
  margin: 0 auto;
  padding: 40px 24px;
  color: var(--muted);
}
.cb-empty-mark {
  width: 60px;
  height: 60px;
  margin-bottom: 8px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  line-height: 1;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--cb-border));
}
.cb-empty-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
}
.cb-empty-text {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.55;
}
/* /mobius-ui:Empty */
.cb-row {
  width: 100%;
  min-height: 56px;
  display: flex;
  align-items: center;
  padding: 0 4px 0 0;
  margin-bottom: 6px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 60%, transparent);
  color: var(--text);
  transition: background 160ms ease, border-color 160ms ease;
}
.cb-row-open {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 56px;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 8px 0 8px 14px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 120ms ease;
}
.cb-row-open:active {
  transform: scale(0.995);
}
.cb-row-open:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.cb-row-flag {
  font-size: 22px;
  line-height: 1;
}
.cb-row-text strong {
  display: block;
  font-size: 15px;
  font-weight: 600;
}
.cb-row-text small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--muted);
}
/* Two one-tap toggles per row, side by side (Change 5): the star =
   'Want to go', the ring = 'Been'. The group is the row's third grid column. */
.cb-row-marks {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
/* 'Want to go' star toggle — wishlist orange when on, hollow when off.
   Same 40px hit target as the visited ring so the two read as a pair. */
.cb-row-want {
  /* 44px hit target (WCAG 2.5.8). The 56px row absorbs the extra height via the
     negative vertical margin, so the row stays the same size; only the tap
     surface grows. Was 40px — under the 44px floor. */
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  margin: -10px -2px -10px 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  font-size: 20px;
  line-height: 1;
  color: color-mix(in srgb, var(--muted) 80%, transparent);
  transition: color 0.12s, transform 0.08s;
}
.cb-row-want--on {
  color: var(--cb-wishlist);
}
.cb-row-want svg {
  display: block;
  width: 20px;
  height: 20px;
}
.cb-row-want:active { transform: scale(0.88); }
@media (hover: hover) {
  .cb-row-want:hover { color: var(--cb-wishlist); }
}
/* One-tap visited toggle on each list row: mark a country without opening
   its detail (tap stops propagation). 40px hit target around a 26px ring;
   fills accent with a check when visited. The owner's core flow is bulk-
   marking 195 countries, so this turns "row → detail → mark → back" into a
   single tap. */
.cb-row-mark {
  /* 44px hit target (WCAG 2.5.8). Negative vertical margin keeps the 56px row
     unchanged; only the tap surface grows. Was 40px — under the 44px floor. */
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  margin: -10px -4px -10px 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  color: var(--cb-visited-fill, var(--accent));
}
.cb-row-mark > span {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  line-height: 1;
  transition: background 0.12s, border-color 0.12s, transform 0.08s;
}
.cb-row-mark svg {
  display: block;
  width: 15px;
  height: 15px;
}
.cb-row-mark--on > span {
  background: var(--cb-visited-fill, var(--accent));
  border-color: var(--cb-visited-fill, var(--accent));
  color: var(--bg);
}
.cb-row-mark:active > span { transform: scale(0.88); }
@media (hover: hover) {
  .cb-row-mark:hover > span { border-color: var(--cb-visited-fill, var(--accent)); }
}
.cb-row--visited .cb-row-text strong {
  color: var(--cb-visited-fill);
}
.cb-row--wishlist {
  border-color: color-mix(in srgb, var(--cb-wishlist) 22%, transparent);
  background: color-mix(in srgb, var(--cb-wishlist) 8%, var(--surface));
}
.cb-row--wishlist .cb-row-text strong {
  color: var(--cb-wishlist);
}
/* /mobius-ui:Card */

/* mobius-ui:Scrollskin v2 — keep in sync; hidden by default, content stays scrollable. */
.cb-list, .cb-detail-body {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.cb-list::-webkit-scrollbar, .cb-detail-body::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
/* /mobius-ui:Scrollskin */

/* Wide web workspace -------------------------------------------------------
   The breakpoint intentionally leaves tablets and narrow split-screen windows
   on the proven bottom-sheet UI. Once there is room for a real sidebar, the
   map becomes the hero panel and every browsing control remains in view. */
@media (min-width: 900px) {
  .cb-app {
    background:
      radial-gradient(circle at 70% 42%,
        color-mix(in srgb, var(--accent) 5%, transparent),
        transparent 38%),
      var(--bg);
  }
  .cb-header {
    padding: max(20px, env(safe-area-inset-top)) 28px 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--cb-border) 55%, transparent);
  }
  .cb-brand {
    gap: 12px;
  }
  .cb-brand-icon,
  .cb-brand-fallback {
    width: 38px;
    height: 38px;
    border-radius: 10px;
  }
  .cb-saying {
    font-size: 16px;
  }
  .cb-banner,
  .cb-error {
    margin: 12px 28px 0;
  }
  .cb-workspace {
    display: grid;
    grid-template-columns: clamp(350px, 29vw, 430px) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    gap: 18px;
    padding: 18px 24px 24px;
  }
  .cb-globe-shell {
    grid-column: 2;
    grid-row: 1;
    border: 1px solid color-mix(in srgb, var(--cb-border) 72%, transparent);
    border-radius: 22px;
    background:
      linear-gradient(145deg,
        color-mix(in srgb, var(--surface) 24%, transparent),
        color-mix(in srgb, var(--bg) 84%, transparent));
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, #ffffff 5%, transparent),
      0 18px 50px color-mix(in srgb, #000000 18%, transparent);
  }
  .cb-globe-shell::before {
    inset: 2% 2% 4%;
    opacity: 1;
  }
  .cb-sheet {
    grid-column: 1;
    grid-row: 1;
    height: auto !important;
    min-height: 0;
    border: 1px solid color-mix(in srgb, var(--cb-border) 78%, transparent);
    border-radius: 18px;
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, #ffffff 5%, transparent),
      0 14px 38px color-mix(in srgb, #000000 16%, transparent);
    backdrop-filter: blur(18px);
  }
  .cb-sheet-handle {
    display: none;
  }
  .cb-sheet-controls {
    flex-direction: column;
    margin: 14px 14px 12px;
  }
  .cb-filters {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .cb-filter {
    width: auto;
    padding: 0 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    font-family: var(--font);
    font-size: 12px;
    font-weight: 650;
  }
  .cb-filter-label {
    display: inline;
  }
  .cb-sheet-search {
    background: color-mix(in srgb, var(--surface) 88%, transparent);
  }
  .cb-list {
    padding: 0 10px 14px;
    scrollbar-width: thin;
    scrollbar-color: var(--cb-border) transparent;
  }
  .cb-list::-webkit-scrollbar,
  .cb-detail-body::-webkit-scrollbar {
    display: block;
    width: 8px;
    height: 8px;
  }
  .cb-list::-webkit-scrollbar-thumb,
  .cb-detail-body::-webkit-scrollbar-thumb {
    background: var(--cb-border);
    border-radius: 999px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  .cb-row {
    min-height: 58px;
    padding: 0 8px 0 0;
    margin-bottom: 5px;
    background: color-mix(in srgb, var(--surface) 72%, transparent);
  }
  .cb-row-open {
    min-height: 58px;
    padding-left: 12px;
  }
  .cb-detail-head {
    padding: 16px 14px 12px;
  }
  .cb-detail-body {
    padding: 14px;
    scrollbar-width: thin;
    scrollbar-color: var(--cb-border) transparent;
  }
  .cb-info {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .cb-info-row {
    min-height: 54px;
    padding: 9px 11px;
  }
  .cb-detail-actions {
    padding: 12px 14px 14px;
  }
}

/* mobius-ui:ReducedMotion v1 -- honor the OS reduce-motion setting */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
/* /mobius-ui:ReducedMotion */
`
