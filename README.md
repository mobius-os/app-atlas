# Atlas

Spin a 3D globe and mark the countries you've visited. Watch your map fill in as the count climbs toward 195. A [Möbius](https://github.com/mobius-os) mini-app.

<!-- TODO: docs/screenshot.png after first install. -->
<!-- TODO: icon.png — currently relying on Möbius's auto-generated letter icon. -->

## Install

### Via the App Store (recommended)

Open the **App Store** mini-app in Möbius, search for "Atlas", tap **Install**.

### Via paste-a-URL

In the App Store, choose **Install from URL** and paste:

```
https://raw.githubusercontent.com/mobius-os/app-atlas/main/mobius.json
```

Möbius will fetch the manifest, show you the bundled GeoJSON and `d3-geo` runtime dep, and install with one tap.

## What it does

- A draggable orthographic globe is the centerpiece. Spin it with a finger and let go — it glides to rest with a little release inertia. The globe only moves when you move it: there is no autonomous idle spin. Pinch to zoom, or scroll / `+` / `-` on desktop.
- A bottom sheet lists every country in alphabetical order, with a search box and visited / wishlist filter chips. Tap a row (or a country on the globe) to open its detail card — capital, population, surface area, languages — then mark it with the **Been** or **Want to go** button. Each row also carries one-tap ring (Been) and star (Want to go) toggles. Marking a country never re-sorts the list, so a row never jumps out from under your thumb.
- The header keeps a running count — e.g. `47 / 195` — so the trip across the planet feels like a single number creeping up.
- Drag the sheet handle up to expand the list (up to 80% of the screen), down to collapse it (~34%) and give the globe more room.

## Customize

There is nothing to configure. Your data lives in app storage as two files — `visited.json` and `wishlist.json` — each a plain array of ISO-3 codes (`["BEL", "FRA", "JPN", ...]`). Read them, write them, or import them from anywhere you have your Möbius bearer token; a country listed in both is treated as visited.

## How it works

The globe is rendered as an SVG with [`d3-geo`](https://github.com/d3/d3-geo)'s orthographic projection. Country geometry comes from a public-domain Natural Earth derivative (the [`datasets/geo-countries`](https://github.com/datasets/geo-countries) bundle), trimmed to ~270 KB and seeded into the app's storage on install.

Pointer drag rotates the projection with versor ("grab-the-surface") maths, so the point under your finger stays glued to it at any zoom and latitude. When you lift off, a short release-inertia glide keeps the globe moving with the velocity of the swipe and decays to rest — there is no perpetual idle spin. A second finger turns the gesture into a pinch that scales the projection (wheel/trackpad and `+`/`-` do the same on desktop); zoom is a multiplier on the size-derived base radius, clamped between `MIN_ZOOM` and `MAX_ZOOM` — change those two constants to widen the range. Tapping a country (on the globe or in the list) selects it and opens its detail card; the **Been** / **Want to go** buttons there, and the one-tap ring/star on each list row, are what toggle its status. The visited/wishlist codes persist through Möbius's `useDocument` hook (`window.mobius.createUseDocument(React)`), one document per code-file (`visited.json` / `wishlist.json`). The hook owns durability end-to-end: an optimistic read-your-writes value renders the toggle instantly, `update()` serializes writes per document and resolves only on a durable write (a fatal rejection surfaces an error rather than a false "saved"), and an offline write queues durably and drains on reconnect. Under `mode:'lww'` a custom set-union merge (`mergeCodeSets`) makes cross-context convergence a union — a code added by another tab is never lost — while still honoring a removal this context made. This replaced an earlier defensive subsystem (a localStorage distrust cache, an `unsynced` flag, and a boot read-union) that existed only because the old storage API couldn't be trusted to report durability.

Before rendering, corrupt seed geometry is repaired: features whose winding is inverted (which would fill a whole hemisphere) are rewound, and impossible sub-polygons are dropped. When a repair actually happens it is reported through the `geometry_repaired` analytics signal as an early warning that the map seed drifted.

## Credits

Country borders: [`datasets/geo-countries`](https://github.com/datasets/geo-countries) — public-domain Natural Earth derivative.

## License

MIT — see [LICENSE](LICENSE).
