import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../theme.js', import.meta.url), 'utf8')

test('country search keeps a stable full-height touch target when clear appears', () => {
  assert.match(css, /\.cb-sheet-search \{[\s\S]*min-height: 44px;[\s\S]*padding: 0 6px 0 14px;/)
  assert.match(css, /\.cb-sheet-search input \{[\s\S]*align-self: stretch;[\s\S]*min-height: 44px;/)
  assert.match(css, /\.cb-sheet-search-clear \{[\s\S]*min-height: 44px;[\s\S]*margin: 0;/)
})
