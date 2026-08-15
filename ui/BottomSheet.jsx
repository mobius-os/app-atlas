import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Globe,
  Search,
  Star,
  StarFilled,
  X,
} from '@openai/apps-sdk-ui/components/Icon'
import {
  clamp,
  formatArea,
  formatLanguages,
  formatPopulation,
  lookupCountryInfo,
  shouldStartSheetBodyDrag,
} from '../domain.js'

// --------------------------------------------------------------------------
// Bottom sheet — vertically draggable list + search.
// --------------------------------------------------------------------------
// The sheet opens collapsed so the globe remains the hero. Forty percent of
// the viewport leaves room for the controls and 2–3 rows; the handle still
// expands the list to the middle and maximum stops below.
const SHEET_MIN = 0.40  // 40% — collapsed, with room for controls + 2–3 rows
const SHEET_MID = 0.50  // 50% — neutral, dragged-to
const SHEET_MAX = 0.80  // 80% — expanded, dragged-to
const SHEET_STOPS_DEFAULT = [SHEET_MIN, SHEET_MID, SHEET_MAX]
// The fraction the sheet opens at. Collapsed by default (see above); kept as a
// named const next to the stops so "how much screen the list takes on open" is
// a single, obvious knob.
const SHEET_OPEN_DEFAULT = SHEET_MIN

// Icon-only filter chips — globe = everything, check = visited, star =
// wishlist. Generic controls use the same OpenAI icon family as the shell;
// the aria-label + title carry the meaning for screen readers and hover.
const FILTER_CHIPS = [
  {
    id: 'all',
    label: 'Show all countries',
    shortLabel: 'All',
    icon: <Globe width={18} height={18} aria-hidden="true" focusable="false" />,
  },
  {
    id: 'visited',
    label: 'Show visited only',
    shortLabel: 'Been',
    icon: <Check width={18} height={18} aria-hidden="true" focusable="false" />,
  },
  {
    id: 'wishlist',
    label: 'Show wishlist only',
    shortLabel: 'Wishlist',
    icon: <Star width={18} height={18} aria-hidden="true" focusable="false" />,
  },
]

function StatusCheckIcon({ size = 16 }) {
  return <Check width={size} height={size} aria-hidden="true" focusable="false" />
}

function StatusStarIcon({ size = 18, filled = false }) {
  const Icon = filled ? StarFilled : Star
  return <Icon width={size} height={size} aria-hidden="true" focusable="false" />
}

export function BottomSheet({
  countries,
  visited,
  wishlist,
  selectedCountry,
  query,
  statusFilter,
  countrySort,
  continentStats,
  selectedContinents,
  loading,
  onQueryChange,
  onFilterChange,
  onSortChange,
  onToggleContinent,
  onSelect,
  onToggleVisited,
  onToggleWishlist,
  onSetCountriesStatus,
  onDeselect,
}) {
  const dragRef = useRef({ active: false, startY: 0, startFrac: SHEET_OPEN_DEFAULT, fromBody: false })
  const [frac, setFrac] = useState(SHEET_OPEN_DEFAULT)
  const [dragging, setDragging] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selectedCodes, setSelectedCodes] = useState(() => new Set())
  const scrollRef = useRef(null)

  const toggleSelected = (iso3) => {
    setSelectedCodes((current) => {
      const next = new Set(current)
      if (next.has(iso3)) next.delete(iso3)
      else next.add(iso3)
      return next
    })
  }
  const finishSelecting = () => {
    setSelecting(false)
    setSelectedCodes(new Set())
  }
  const applySelected = (status) => {
    onSetCountriesStatus(Array.from(selectedCodes), status)
    finishSelecting()
  }

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
    if (!shouldStartSheetBodyDrag(atTop, event.target)) return
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
        { key: 'area', label: 'Area', value: formatArea(selectedInfo.area) },
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
                <X width={18} height={18} aria-hidden="true" />
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
              {/* Older persisted country seeds included "Boundary:" in the
                  source value. Strip it at display time so both old and current
                  installs render one label without rewriting saved data. */}
              {selectedCountry.boundaryNote ? (
                <aside className="cb-boundary-note" aria-label="Boundary note">
                  <p>{selectedCountry.boundaryNote}</p>
                  {selectedCountry.boundarySource ? (
                    <small>
                      Boundary:{' '}
                      <a
                        href={selectedCountry.boundarySourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >{String(selectedCountry.boundarySource).replace(/^Boundary:\s*/i, '')}</a>
                      {selectedCountry.boundaryLicense ? (
                        <>
                          {' · '}
                          <a
                            href={selectedCountry.boundaryLicenseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >{selectedCountry.boundaryLicense}</a>
                        </>
                      ) : null}
                      {selectedCountry.boundaryChanges ? ` · ${selectedCountry.boundaryChanges}` : null}
                    </small>
                  ) : null}
                </aside>
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
                <span>Been</span>
                {isVisitedSelected ? <StatusCheckIcon /> : null}
              </button>
              <button
                type="button"
                className={'cb-detail-cta cb-detail-cta--wishlist' + (isWishlistedSelected ? ' is-on' : '')}
                onClick={() => onToggleWishlist(selectedCountry)}
                aria-pressed={isWishlistedSelected}
              >
                <span>Want to go</span>
                {isWishlistedSelected ? <StatusStarIcon size={15} filled /> : null}
              </button>
            </div>
          </>
        )}
      </div>

      <div className={'cb-list-panel' + (selectedCountry ? ' cb-list-panel--hidden' : '')}>
        <div className="cb-sheet-controls">
          <div className="cb-sheet-search">
            <Search
              className="cb-sheet-search-icon"
              width="16"
              height="16"
              aria-hidden="true"
              focusable="false"
            />
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
                <X width={14} height={14} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          {/* Status filter — compact icons beside search on phones, labeled
              segmented choices below it in the desktop sidebar. It filters the
              list (and dims non-matching countries on the globe); the choice
              persists per-device via prefWrite. */}
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
                <span className="cb-filter-label">{chip.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="cb-list-tools">
          <div className="cb-sort" role="group" aria-label="Sort countries">
            <button
              type="button"
              className={countrySort === 'alphabetical' ? 'is-on' : ''}
              aria-pressed={countrySort === 'alphabetical'}
              onClick={() => onSortChange('alphabetical')}
            >A–Z</button>
            <button
              type="button"
              className={countrySort === 'continent' ? 'is-on' : ''}
              aria-pressed={countrySort === 'continent'}
              onClick={() => onSortChange('continent')}
            >Continents</button>
          </div>
          <button
            type="button"
            className={'cb-select-toggle' + (selecting ? ' is-on' : '')}
            aria-pressed={selecting}
            onClick={() => selecting ? finishSelecting() : setSelecting(true)}
          >{selecting ? 'Cancel' : 'Select multiple'}</button>
        </div>

        <div className="cb-continent-stats" role="group" aria-label="Filter by continent">
          {continentStats.map((stat) => (
            <button
              type="button"
              className={'cb-continent-stat' + (selectedContinents.has(stat.name) ? ' is-on' : '')}
              key={stat.name}
              aria-pressed={selectedContinents.has(stat.name)}
              aria-label={`${stat.name}, ${stat.visited} of ${stat.total} visited`}
              onClick={() => onToggleContinent(stat.name)}
            >
              <strong>{stat.name}</strong>
              <span>{stat.visited}/{stat.total}</span>
            </button>
          ))}
        </div>

        <div
          className="cb-list"
          ref={scrollRef}
          tabIndex={0}
          aria-label="Countries"
          onPointerDown={onBodyDown}
          onPointerMove={onBodyMove}
          onPointerUp={onBodyUp}
          onPointerCancel={onBodyUp}
          onLostPointerCapture={onBodyUp}
        >
          {loading ? (
            // While the world is still loading, the list is empty only because
            // the data hasn't arrived — NOT because nothing matches. Showing a
            // "no results" state here would contradict the globe's "Loading the
            // world…" spinner (two opposite messages at once). Mirror the
            // loading copy until the data lands, then fall through to the real
            // empty-states below.
            <div className="cb-empty" role="status">
              <div className="cb-empty-mark" aria-hidden="true">🌍</div>
              <div className="cb-empty-title">Loading the world…</div>
              <p className="cb-empty-text">One moment while the country map loads.</p>
            </div>
          ) : countries.length === 0 ? (
            query ? (
              <div className="cb-empty">
                <div className="cb-empty-mark" aria-hidden="true">🔍</div>
                <div className="cb-empty-title">No matches</div>
                <p className="cb-empty-text">No country matches your search. Try a different name or code.</p>
              </div>
            ) : statusFilter === 'visited' ? (
              <div className="cb-empty">
                <div className="cb-empty-mark" aria-hidden="true">✈️</div>
                <div className="cb-empty-title">No countries marked “Been”</div>
                <p className="cb-empty-text">Tap the ring on a row to mark somewhere you’ve been.</p>
              </div>
            ) : statusFilter === 'wishlist' ? (
              <div className="cb-empty">
                <div className="cb-empty-mark" aria-hidden="true">⭐</div>
                <div className="cb-empty-title">Nothing on your list yet</div>
                <p className="cb-empty-text">Tap the star on a row to add a place you want to go.</p>
              </div>
            ) : (
              <div className="cb-empty">
                <div className="cb-empty-mark" aria-hidden="true">🌍</div>
                <div className="cb-empty-title">No countries</div>
                <p className="cb-empty-text">The country list is empty right now.</p>
              </div>
            )
          ) : (
            countries.map((country, index) => {
              const isVisited = visited.has(country.iso3)
              const isWishlisted = wishlist.has(country.iso3)
              const isSelected = selectedCodes.has(country.iso3)
              const showContinentHead = countrySort === 'continent' &&
                (index === 0 || countries[index - 1]?.region !== country.region)
              const continent = continentStats.find((stat) => stat.name === country.region)
              return (
                <div className="cb-country-block" key={country.iso3}>
                  {showContinentHead ? (
                    <div className="cb-continent-head">
                      <strong>{country.region || 'Other'}</strong>
                      <span>{continent?.visited || 0} of {continent?.total || 0} visited</span>
                    </div>
                  ) : null}
                  <div className={
                      'cb-row' +
                      (isVisited ? ' cb-row--visited' : '') +
                      (isWishlisted ? ' cb-row--wishlist' : '') +
                      (isSelected ? ' cb-row--selected' : '')
                    }>
                  <button
                    type="button"
                    className="cb-row-open"
                    aria-label={selecting ? `${isSelected ? 'Deselect' : 'Select'} ${country.displayName}` : `Open ${country.displayName}`}
                    aria-pressed={selecting ? isSelected : undefined}
                    onClick={() => selecting ? toggleSelected(country.iso3) : onSelect(country)}
                  >
                    {selecting ? (
                      <span className={'cb-row-select' + (isSelected ? ' is-on' : '')} aria-hidden="true">
                        {isSelected ? <StatusCheckIcon size={14} /> : null}
                      </span>
                    ) : (
                    <span className="cb-row-flag" aria-hidden="true">
                      {country.flag || '🏳️'}
                    </span>
                    )}
                    <span className="cb-row-text">
                      <strong>{country.displayName}</strong>
                      <small>
                        {country.region || 'World'}
                        {country.subregion ? ` · ${country.subregion}` : ''}
                      </small>
                    </span>
                  </button>
                  {/* Two one-tap status toggles per row (Change 5): the green
                      ring = 'Been', the star = 'Want to go'. Both stop
                      propagation so they mark without opening the detail.
                      Surfacing the wishlist on the row (not just inside the
                      detail) is what makes "want to go" discoverable. */}
                  {!selecting ? <span className="cb-row-marks">
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
                      <span aria-hidden="true">
                        <StatusStarIcon filled={isWishlisted} />
                      </span>
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
                      <span aria-hidden="true">
                        {isVisited ? <StatusCheckIcon size={15} /> : null}
                      </span>
                    </button>
                  </span> : null}
                  </div>
                </div>
              )
            })
          )}
        </div>
        {selecting ? (
          <div className="cb-bulk-bar" role="group" aria-label="Actions for selected countries">
            <span>{selectedCodes.size} selected</span>
            <button type="button" disabled={!selectedCodes.size} onClick={() => applySelected('visited')}>Mark Been</button>
            <button type="button" disabled={!selectedCodes.size} onClick={() => applySelected('wishlist')}>Want to go</button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
