import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const bottomSheetSource = readFileSync(new URL('../ui/BottomSheet.jsx', import.meta.url), 'utf8')

test('country rows use sibling native buttons instead of nested interactive controls', () => {
  assert.match(bottomSheetSource, /className="cb-row-open"/)
  assert.doesNotMatch(bottomSheetSource, /role="button"/)
})

test('the scrollable country list is reachable by keyboard even when empty', () => {
  assert.match(bottomSheetSource, /className="cb-list"[\s\S]*?tabIndex=\{0\}/)
  assert.match(bottomSheetSource, /className="cb-list"[\s\S]*?aria-label="Countries"/)
})

test('country controls are excluded from sheet pointer capture', () => {
  assert.match(
    bottomSheetSource,
    /if \(!shouldStartSheetBodyDrag\(atTop, event\.target\)\) return[\s\S]*?startDrag\(event, true\)/,
  )
})
