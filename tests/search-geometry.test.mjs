import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../theme.js', import.meta.url), 'utf8')

test('country search keeps a stable full-height touch target when clear appears', () => {
  assert.match(css, /\.cb-sheet-search \{[\s\S]*min-height: 44px;[\s\S]*padding: 0 6px 0 14px;/)
  assert.match(css, /\.cb-sheet-search input \{[\s\S]*align-self: stretch;[\s\S]*min-height: 44px;/)
  assert.match(css, /\.cb-sheet-search-clear \{[\s\S]*min-height: 44px;[\s\S]*margin: 0;/)
})

// Regression guard for the mobile bottom-sheet drag geometry. The sheet height
// is a CSS percent set inline from `frac`, and BottomSheet's drag math converts
// finger movement to a frac delta using visualViewport.height, so the finger
// tracks the sheet edge ONLY while that percent resolves against the viewport.
// The desktop workspace wrapper (.cb-workspace) must therefore establish NO box
// on mobile — display:contents keeps .cb-sheet a child of .cb-app (position:
// fixed/inset:0 = the viewport). A flex/grid box here on mobile would resolve
// the percent against the viewport-minus-header and make drags lag the finger.
//
// NOTE: this is a CSS-invariant string guard, not a layout assertion — the test
// harness has no layout engine (jsdom-free; render-smoke stubs hooks), so the
// actual pixel geometry cannot be computed here. This guards the CSS that keeps
// the invariant intact against a re-introduced wrapper box on mobile.
test('workspace establishes no box on mobile so the sheet drag stays finger-aligned', () => {
  // The base (mobile/tablet) .cb-workspace rule collapses to display:contents.
  const baseRule = css.match(/\n\.cb-workspace \{[\s\S]*?\}/)
  assert.ok(baseRule, 'base .cb-workspace rule must exist')
  assert.match(baseRule[0], /display: contents;/)
  assert.doesNotMatch(baseRule[0], /display: (flex|grid);/)

  // The desktop workspace (inside @media (min-width: 900px)) IS a real grid box.
  assert.match(css, /@media \(min-width: 900px\)[\s\S]*\.cb-workspace \{[\s\S]*?display: grid;/)
  // On desktop the sheet drops the inline percent height, so the invariant above
  // is a mobile-only concern — keep the desktop override that pins it to auto.
  assert.match(css, /@media \(min-width: 900px\)[\s\S]*\.cb-sheet \{[\s\S]*?height: auto !important;/)
})
