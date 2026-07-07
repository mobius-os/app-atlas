import { useEffect, useRef, useState } from 'react'
import {
  clamp,
  formatArea,
  formatLanguages,
  formatPopulation,
  lookupCountryInfo,
} from '../domain.js'

// --------------------------------------------------------------------------
// Bottom sheet — vertically draggable list + search.
// --------------------------------------------------------------------------
// The sheet opens COLLAPSED so the globe is the hero. SHEET_MIN ≈ 34% of the
// viewport so the list shows ~3 full country rows at rest (rows are ~62px;
// after the 26px handle + the ~58px search/filter row, 34% of an ~890px
// viewport leaves ~205px of list ≈ three rows). The earlier 22% only cleared
// one row — the owner wanted ~3 visible without dragging. The list still
// scrolls within the band, and the handle drags up to SHEET_MID / SHEET_MAX
// for the full list; this collapsed default just stops the list from eating
// the globe while still showing enough rows to feel like a list.
const SHEET_MIN = 0.34  // ~34% of viewport — collapsed, ~3 rows; the open default
const SHEET_MID = 0.50  // 50% — neutral, dragged-to
const SHEET_MAX = 0.80  // 80% — expanded, dragged-to
const SHEET_STOPS_DEFAULT = [SHEET_MIN, SHEET_MID, SHEET_MAX]
// The fraction the sheet opens at. Collapsed by default (see above); kept as a
// named const next to the stops so "how much screen the list takes on open" is
// a single, obvious knob.
const SHEET_OPEN_DEFAULT = SHEET_MIN

// Icon-only filter chips — globe = everything, check = visited, star =
// wishlist. Inline SVGs, not unicode glyphs, for the same reason as the
// search icon (codepoints render as tofu on some Android WebViews); the
// aria-label + title carry the meaning for screen readers and desktop hover.
const FILTER_CHIPS = [
  {
    id: 'all',
    label: 'Show all countries',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="9" cy="9" r="6.75" />
        <ellipse cx="9" cy="9" rx="3.1" ry="6.75" />
        <line x1="2.25" y1="9" x2="15.75" y2="9" />
      </svg>
    ),
  },
  {
    id: 'visited',
    label: 'Show visited only',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <polyline points="3.2,9.6 7.2,13.4 14.8,4.8" />
      </svg>
    ),
  },
  {
    id: 'wishlist',
    label: 'Show wishlist only',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M9 2.4 L10.9 6.7 15.6 7.2 12.1 10.4 13.1 15 9 12.5 4.9 15 5.9 10.4 2.4 7.2 7.1 6.7 Z" />
      </svg>
    ),
  },
]

export function BottomSheet({
  countries,
  visited,
  wishlist,
  selectedCountry,
  query,
  statusFilter,
  loading,
  onQueryChange,
  onFilterChange,
  onSelect,
  onToggleVisited,
  onToggleWishlist,
  onDeselect,
}) {
  const dragRef = useRef({ active: false, startY: 0, startFrac: SHEET_OPEN_DEFAULT, fromBody: false })
  const [frac, setFrac] = useState(SHEET_OPEN_DEFAULT)
  const [dragging, setDragging] = useState(false)
  const scrollRef = useRef(null)

  // country_search (Reflection) — emitted after the query settles (debounced),
  // never per keystroke, so zero-result search patterns are visible. We send
  // only the query LENGTH and the result count — NEVER the query text (no PII).
  // result_count is the already-filtered list length passed in as `countries`.
  useEffect(() => {
    const q = query.trim()
    if (!q) return undefined
    const id = setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.mobius?.signal?.('country_search', {
          query_length: q.length,
          result_count: countries.length,
        })
      }
    }, 600)
    return () => clearTimeout(id)
  }, [query, countries.length])

  // Opening a country must NOT resize the sheet (owner feedback: the panel
  // jumped when you tapped a country). There is deliberately no auto-lift on
  // selection — the sheet stays at whatever height it's at, and the detail
  // view fits within that band: a fixed header + pinned action bar frame a
  // single scrolling body (see .cb-detail-body overflow-y:auto), so the facts
  // scroll internally while the name and CTAs stay put and nothing clips. The
  // user can still drag the handle up for more room; tapping a country just
  // never moves it for them.

  const minFrac = SHEET_MIN
  const stops = SHEET_STOPS_DEFAULT

  // Drag math reused by both the handle and the body. dragRef.startFrac
  // captures the sheet height at gesture start; dy is converted to a
  // frac delta using visualViewport.height so a soft keyboard doesn't
  // skew the math. We use visualViewport for *both* the displayed sheet
  // height (CSS percent of the visual viewport) and the drag conversion
  // so the user's finger and the sheet edge stay aligned.
  const startDrag = (event, fromBody) => {
    dragRef.current = {
      active: true,
      fromBody,
      startY: event.clientY,
      startFrac: frac,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const moveDrag = (event) => {
    if (!dragRef.current.active) return
    const dy = event.clientY - dragRef.current.startY
    const rawVh =
      (typeof window !== 'undefined' && window.visualViewport?.height) ||
      window.innerHeight ||
      800
    const vh = Number.isFinite(rawVh) && rawVh > 120 ? rawVh : 800
    // Drag up = sheet grows = frac increases. dy is positive downward.
    const next = clamp(dragRef.current.startFrac - dy / vh, minFrac, SHEET_MAX)
    setFrac(next)
  }
  const endDrag = (event) => {
    dragRef.current.active = false
    setDragging(false)
    if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    // Snap to the nearest legal stop so the sheet always rests in a known
    // pose, preserving the user's chosen height across list/detail modes.
    setFrac((current) => {
      let best = stops[0]
      let bestDist = Infinity
      for (const stop of stops) {
        const d = Math.abs(stop - current)
        if (d < bestDist) {
          best = stop
          bestDist = d
        }
      }
      return best
    })
  }

  const onHandleDown = (event) => startDrag(event, false)
  const onHandleMove = moveDrag
  const onHandleUp = endDrag
  // lostpointercapture pairs with the same teardown — without this the
  // sheet can wedge in mid-drag after iOS Safari yanks capture.
  const onHandleLost = endDrag

  // Keyboard resize for the handle (it's a role="separator", which the WAI-ARIA
  // pattern requires to be operable by keyboard, not just pointer drag). Arrow
  // up/down nudge by 5% of the viewport; PageUp/Down jump to the next/previous
  // snap stop; Home/End go to the min/max. Without this, a keyboard or
  // switch-control user could never resize the sheet at all.
  const KEY_STEP = 0.05
  const onHandleKeyDown = (event) => {
    let handled = true
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      setFrac((f) => clamp(f + KEY_STEP, minFrac, SHEET_MAX))
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      setFrac((f) => clamp(f - KEY_STEP, minFrac, SHEET_MAX))
    } else if (event.key === 'Home') {
      setFrac(minFrac)
    } else if (event.key === 'End') {
      setFrac(SHEET_MAX)
    } else if (event.key === 'PageUp') {
      setFrac((f) => stops.find((s) => s > f + 1e-6) ?? SHEET_MAX)
    } else if (event.key === 'PageDown') {
      setFrac((f) => [...stops].reverse().find((s) => s < f - 1e-6) ?? minFrac)
    } else {
      handled = false
    }
    if (handled) event.preventDefault()
  }
  // aria-value* describe the separator's position as a whole-number percent of
  // the viewport, so assistive tech announces "42%, min 34, max 80" — the same
  // band the pointer drag clamps to.
  const ariaNow = Math.round(frac * 100)
  const ariaMin = Math.round(minFrac * 100)
  const ariaMax = Math.round(SHEET_MAX * 100)

  // The body of the sheet (list / detail) accepts drag-down too — but
  // only when the inner scroller is at the top. If the user is scrolling
  // a long list, we want native scroll; if they're at the top and pull
  // further, we treat that as a sheet drag.
  const onBodyDown = (event) => {
    const atTop = (scrollRef.current?.scrollTop || 0) <= 0
    if (!atTop) return
    startDrag(event, true)
  }
  const onBodyMove = (event) => {
    if (!dragRef.current.active || !dragRef.current.fromBody) return
    // If the user dragged UP from the top, prefer native scroll over
    // sheet expansion — release the drag.
    const dy = event.clientY - dragRef.current.startY
    if (dy < -8) {
      endDrag(event)
      return
    }
    moveDrag(event)
  }
  const onBodyUp = (event) => {
    if (dragRef.current.active && dragRef.current.fromBody) endDrag(event)
  }

  const isVisitedSelected = selectedCountry && visited.has(selectedCountry.iso3)
  const isWishlistedSelected = selectedCountry && wishlist.has(selectedCountry.iso3)

  // Basic-info card data (Change 6) — bundled facts joined by ISO-3. null when
  // we have no facts row; the card then shows only region (always present).
  const selectedInfo = selectedCountry ? lookupCountryInfo(selectedCountry.iso3) : null
  const infoRows = selectedInfo
    ? [
        { key: 'capital', label: 'Capital', value: selectedInfo.capital || '—' },
        { key: 'population', label: 'Population', value: formatPopulation(selectedInfo.population) },
        { key: 'area', label: 'Surface area', value: formatArea(selectedInfo.area) },
        { key: 'languages', label: 'Languages', value: formatLanguages(selectedInfo.languages) },
      ]
    : []

  return (
    <div
      className={'cb-sheet' + (dragging ? ' cb-sheet--dragging' : '')}
      style={{ height: `${frac * 100}%` }}
    >
      <div
        className="cb-sheet-handle"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        onLostPointerCapture={onHandleLost}
        onKeyDown={onHandleKeyDown}
        role="separator"
        tabIndex={0}
        aria-label="Resize country list"
        aria-orientation="horizontal"
        aria-valuenow={ariaNow}
        aria-valuemin={ariaMin}
        aria-valuemax={ariaMax}
      >
        <span className="cb-sheet-grip" />
      </div>

      {/* Detail panel and list are ALWAYS mounted so the list's scrollTop is
          preserved by the DOM when the user goes back. CSS hides the inactive
          panel; the scroll container never unmounts, never resets to 0. */}
      <div
        className={'cb-detail' + (selectedCountry ? '' : ' cb-detail--hidden')}
        role="region"
        aria-label="Country detail"
        aria-hidden={!selectedCountry}
      >
        {selectedCountry && (
          <>
            {/* Condensed STICKY header — flag + name + region on one compact
                row, pinned to the top of the detail so the country you're
                looking at never scrolls out of view. The flag is smaller than
                the old 40px block so the header earns its keep on a short
                sheet (peek height) instead of eating the facts below it. */}
            <div className="cb-detail-head">
              <span className="cb-detail-flag" aria-hidden="true">
                {selectedCountry.flag || '🏳️'}
              </span>
              <div className="cb-detail-name">
                <strong>{selectedCountry.displayName}</strong>
                <small>
                  {selectedCountry.region || 'World'}
                  {selectedCountry.subregion ? ` · ${selectedCountry.subregion}` : ''}
                </small>
              </div>
              <button
                type="button"
                className="cb-detail-close"
                onClick={onDeselect}
                aria-label="Close country detail"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <line x1="4" y1="4" x2="14" y2="14" />
                  <line x1="14" y1="4" x2="4" y2="14" />
                </svg>
              </button>
            </div>

            {/* Scrollable body — the only region that scrolls. The sticky
                header above and the sticky action bar below stay put, so on a
                390px phone the country always has a visible identity and the
                Been / Want-to-go CTAs are always one tap away, no matter how
                tall the facts get or how short the sheet is dragged. */}
            <div className="cb-detail-body">
              {/* Basic-info card: capital / population / surface area / main
                  languages, joined from the bundled facts by ISO-3. A row whose
                  value is unknown renders an em dash, never a wrong "0". */}
              {infoRows.length > 0 ? (
                <dl className="cb-info">
                  {infoRows.map((row) => (
                    <div className="cb-info-row" key={row.key}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>

            {/* Sticky action bar — two independent status toggles ('Been' /
                'Want to go'). Marking one clears the other and each persists
                the same way (whole-list PUT of visited.json / wishlist.json).
                Pinned to the bottom so the primary action is always reachable
                even when the facts scroll. */}
            <div className="cb-detail-actions">
              <button
                type="button"
                className={'cb-detail-cta cb-detail-cta--visited' + (isVisitedSelected ? ' is-on' : '')}
                onClick={() => onToggleVisited(selectedCountry)}
                aria-pressed={isVisitedSelected}
              >
                {isVisitedSelected ? 'Been ✓' : 'Been'}
              </button>
              <button
                type="button"
                className={'cb-detail-cta cb-detail-cta--wishlist' + (isWishlistedSelected ? ' is-on' : '')}
                onClick={() => onToggleWishlist(selectedCountry)}
                aria-pressed={isWishlistedSelected}
              >
                {isWishlistedSelected ? 'Want to go ★' : 'Want to go'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className={'cb-list-panel' + (selectedCountry ? ' cb-list-panel--hidden' : '')}>
        <div className="cb-sheet-controls">
          <div className="cb-sheet-search">
            {/* Inline SVG, not U+2315 — the codepoint renders as tofu on some
                Android WebViews even when the system claims symbol coverage. */}
            <svg
              className="cb-sheet-search-icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="7" cy="7" r="4.5" />
              <line x1="10.5" y1="10.5" x2="13.5" y2="13.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search countries"
              aria-label="Search countries"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {query ? (
              <button
                type="button"
                className="cb-sheet-search-clear"
                onClick={() => onQueryChange('')}
                aria-label="Clear search"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <line x1="3" y1="3" x2="11" y2="11" />
                  <line x1="11" y1="3" x2="3" y2="11" />
                </svg>
              </button>
            ) : null}
          </div>

          {/* Status filter — icon-only segmented control beside the search
              box. Filters the list (and dims non-matching countries on the
              globe); the choice persists per-device via prefWrite. */}
          <div className="cb-filters" role="group" aria-label="Filter countries by status">
            {FILTER_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={'cb-filter' + (statusFilter === chip.id ? ' is-on' : '')}
                aria-label={chip.label}
                aria-pressed={statusFilter === chip.id}
                title={chip.label}
                onClick={() => onFilterChange(chip.id)}
              >
                {chip.icon}
              </button>
            ))}
          </div>
        </div>

        <div
          className="cb-list"
          ref={scrollRef}
          onPointerDown={onBodyDown}
          onPointerMove={onBodyMove}
          onPointerUp={onBodyUp}
          onPointerCancel={onBodyUp}
          onLostPointerCapture={onBodyUp}
        >
          {loading ? (
            // While the world is still loading, the list is empty only because
            // the data hasn't arrived — NOT because nothing matches. Showing
            // "No countries match" here contradicted the globe's "Loading the
            // world…" spinner (two opposite messages at once). Mirror the
            // loading copy until the data lands, then fall through to the real
            // empty-states below.
            <div className="cb-list-empty" role="status">Loading the world…</div>
          ) : countries.length === 0 ? (
            <div className="cb-list-empty">
              {query
                ? 'No countries match.'
                : statusFilter === 'visited'
                  ? 'No countries marked “Been” yet — tap the ring on a row to add one.'
                  : statusFilter === 'wishlist'
                    ? 'Nothing on your “Want to go” list yet — tap the star on a row to add one.'
                    : 'No countries match.'}
            </div>
          ) : (
            countries.map((country) => {
              const isVisited = visited.has(country.iso3)
              const isWishlisted = wishlist.has(country.iso3)
              return (
                <div
                  key={country.iso3}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${country.displayName}`}
                  className={
                    'cb-row' +
                    (isVisited ? ' cb-row--visited' : '') +
                    (isWishlisted ? ' cb-row--wishlist' : '')
                  }
                  onClick={() => onSelect(country)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect(country)
                    }
                  }}
                >
                  <span className="cb-row-flag" aria-hidden="true">
                    {country.flag || '🏳️'}
                  </span>
                  <span className="cb-row-text">
                    <strong>{country.displayName}</strong>
                    <small>
                      {country.region || 'World'}
                      {country.subregion ? ` · ${country.subregion}` : ''}
                    </small>
                  </span>
                  {/* Two one-tap status toggles per row (Change 5): the green
                      ring = 'Been', the star = 'Want to go'. Both stop
                      propagation so they mark without opening the detail.
                      Surfacing the wishlist on the row (not just inside the
                      detail) is what makes "want to go" discoverable. */}
                  <span className="cb-row-marks">
                    <button
                      type="button"
                      className={'cb-row-want' + (isWishlisted ? ' cb-row-want--on' : '')}
                      aria-label={isWishlisted
                        ? `Remove ${country.displayName} from want to go`
                        : `Add ${country.displayName} to want to go`}
                      aria-pressed={isWishlisted}
                      title={isWishlisted ? 'Want to go — tap to remove' : 'Tap to add to want to go'}
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleWishlist(country)
                      }}
                    >
                      <span aria-hidden="true">{isWishlisted ? '★' : '☆'}</span>
                    </button>
                    <button
                      type="button"
                      className={'cb-row-mark' + (isVisited ? ' cb-row-mark--on' : '')}
                      aria-label={isVisited
                        ? `Mark ${country.displayName} not been`
                        : `Mark ${country.displayName} been`}
                      aria-pressed={isVisited}
                      title={isVisited ? 'Been — tap to unmark' : 'Tap to mark been'}
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleVisited(country)
                      }}
                    >
                      <span aria-hidden="true">{isVisited ? '✓' : ''}</span>
                    </button>
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
