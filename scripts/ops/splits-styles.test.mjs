import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const css = await readFile(
  fileURLToPath(new URL('../../apps/web/src/ui/components/SplitsTable.css', import.meta.url)),
  'utf8',
)
test('the splits table is the one representation at every width, scrolling inside its own region', () => {
  // No narrow-width list replaces it, and no rule hides it.
  assert.doesNotMatch(css, /\.splits-list\b/)
  assert.doesNotMatch(css, /\.splits-wide\s*\{[^}]*display:\s*none/)
  // The table scrolls sideways in its region rather than the page.
  assert.match(css, /\.splits-wide\s*\{[^}]*overflow-x:\s*auto/)
})

test('no table element or table class is displayed as a block, which would drop its table semantics', () => {
  // The bar classes are not tables, so only the exact table class and the table elements count.
  assert.doesNotMatch(css, /\.splits-table(?![\w-])[^{]*\{[^}]*display:\s*block/)
  assert.doesNotMatch(
    css,
    /(^|[\s,{}])(table|thead|tbody|tr|th|td|caption)\b[^{]*\{[^}]*display:\s*block/,
  )
})
