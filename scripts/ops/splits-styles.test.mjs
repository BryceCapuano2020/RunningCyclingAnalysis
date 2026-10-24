import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const css = await readFile(
  fileURLToPath(new URL('../../apps/web/src/ui/components/SplitsTable.css', import.meta.url)),
  'utf8',
)
const MEDIA = '@media (max-width: 479px)'

/** The text inside the block that opens at `opener`, and where the whole block sits. */
function blockAt(text, opener) {
  const start = text.indexOf(opener)
  assert.notEqual(start, -1, `${opener} is declared`)
  const open = text.indexOf('{', start)
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    if (text[i] === '}' && --depth === 0) {
      return { body: text.slice(open + 1, i), start, end: i + 1 }
    }
  }
  assert.fail(`${opener} is closed`)
}

const narrow = blockAt(css, MEDIA)
const outside = css.slice(0, narrow.start) + css.slice(narrow.end)

test('the splits table shows at 480 px and wider, and the list below it, never both', () => {
  // The list is hidden by default, so the table is the only representation at wide widths.
  assert.match(outside, /\.splits-list\s*\{[^}]*display:\s*none/)
  // Below the breakpoint the table is hidden and the list shown, and both rules sit inside the block.
  assert.match(narrow.body, /\.splits-wide\s*\{[^}]*display:\s*none/)
  assert.match(narrow.body, /\.splits-list\s*\{[^}]*display:\s*block/)
  assert.doesNotMatch(outside, /\.splits-wide\s*\{[^}]*display:\s*none/)
})

test('no table element or table class is displayed as a block, which would drop its table semantics', () => {
  // The bar classes are not tables, so only the exact table class and the table elements count.
  assert.doesNotMatch(css, /\.splits-table(?![\w-])[^{]*\{[^}]*display:\s*block/)
  assert.doesNotMatch(
    css,
    /(^|[\s,{}])(table|thead|tbody|tr|th|td|caption)\b[^{]*\{[^}]*display:\s*block/,
  )
})
