# Atlas

Tap a 3D globe to mark every country you've been to. Watch your map fill in with accent-colored glow as the count climbs toward 195. A [Möbius](https://github.com/mobius-os) mini-app.

<!-- TODO: docs/screenshot.png after first install. -->
<!-- TODO: icon.png — currently relying on Möbius's auto-generated letter icon. -->

## Install

### Via the App Store (recommended)

Open the **App Store** mini-app in Möbius, search for "Atlas", tap **Install**.

### Via paste-a-URL

In the App Store, choose **Install from URL** and paste:

```
https://raw.githubusercontent.com/mobius-os/app-countries/main/mobius.json
```

Möbius will fetch the manifest, show you the bundled GeoJSON and `d3-geo` runtime dep, and install with one tap.

## What it does

- A draggable orthographic globe is the centerpiece. Spin it with a finger; let go and it eases into a slow idle rotation. Pinch to zoom (or scroll/`+`/`-` on desktop) to get in close. Tap any country to toggle it visited (it glows accent).
- A bottom sheet lists every country with a search box. Tap a row and the globe smoothly pans to face that country. Visited countries float to the top of the list.
- The header keeps a running count — e.g. `47 / 195` — so the trip across the planet feels like a single number creeping up.
- Drag the sheet handle up to expand the list (80% of the screen), down to collapse it (30%) and give the globe more room.

## Customize

There is nothing to configure. Your visited list lives in app storage at `visited.json` and is just an array of ISO-3 codes (`["BEL", "FRA", "JPN", ...]`) — read it, write it, import it, all from any place you have your Möbius bearer token.

## How it works

The globe is rendered as an SVG with [`d3-geo`](https://github.com/d3/d3-geo)'s orthographic projection. Country geometry comes from a public-domain Natural Earth derivative (the [`datasets/geo-countries`](https://github.com/datasets/geo-countries) bundle), trimmed to ~270 KB and seeded into the app's storage on install.

Pointer drag rotates the projection in real time. When the user lifts off, an `requestAnimationFrame` loop nudges the longitude forward a fraction of a degree per frame for a slow idle spin. A second finger turns the gesture into a pinch that scales the projection (wheel/trackpad and `+`/`-` do the same on desktop); zoom is a multiplier on the size-derived base radius, clamped between `MIN_ZOOM` and `MAX_ZOOM` — change those two constants to widen the range. Tapping a country runs a point-in-polygon test against the projected paths and toggles the country in a `Set`; saves go through `window.mobius.storage` when the offline runtime is present, falling back to `fetch('/api/storage/apps/<id>/visited.json')` otherwise — so the app works on every Möbius version, and picks up the offline cache when the sibling feature ships.

Smooth pans to a tapped list-row use the country's centroid (`d3.geoCentroid`) as the rotation target and ease over ~1s with a cubic ease-out.

## Credits

Country borders: [`datasets/geo-countries`](https://github.com/datasets/geo-countries) — public-domain Natural Earth derivative.

## License

MIT — see [LICENSE](LICENSE).
