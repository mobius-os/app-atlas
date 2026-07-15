import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const bottomSheetSource = readFileSync(new URL('../ui/BottomSheet.jsx', import.meta.url), 'utf8')

test('country rows use sibling native buttons instead of nested interactive controls', () => {
  assert.match(bottomSheetSource, /className="cb-row-open"/)
  assert.doesNotMatch(bottomSheetSource, /role="button"/)
})
