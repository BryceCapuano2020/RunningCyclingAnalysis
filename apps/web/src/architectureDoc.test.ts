import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS } from '@rca/core/fit'
import { MAX_ACTIVITY_LIST_BYTES, MAX_CSV_CELLS_PER_ROW } from '@rca/core/import'
import { readStylesheet } from './ui/components/stylesheet'

/*
 * The numbers in docs/ARCHITECTURE.md's import section are pinned to the constants they describe, so a
 * change to a limit fails here until the doc says the new number.
 */
// Whitespace is collapsed, so a phrase the doc wraps over two lines is still found.
const doc = (await readStylesheet(import.meta.url, '../../../docs/ARCHITECTURE.md')).replace(
  /\s+/g,
  ' ',
)

describe('architecture doc states the Strava activity list limits as the code sets them', () => {
  it('gives the inflated byte cap in MiB', () => {
    expect(doc).toContain(`${MAX_ACTIVITY_LIST_BYTES / (1024 * 1024)} MiB`)
  })

  it('gives the cell cap per row, which bounds the cells a parse builds', () => {
    expect(doc).toContain(`more than ${MAX_CSV_CELLS_PER_ROW} cells`)
  })

  it('gives the row cap as rows in all', () => {
    const rows = DEFAULT_EXTRACT_LIMITS.maxFitFiles.toLocaleString('en-US')
    expect(doc).toContain(`at most ${rows} rows in all`)
  })

  it('says the byte cap is a memory budget, with its peak', () => {
    expect(doc).toContain('The cap is a memory budget')
    expect(doc).toContain('about 100–150 MB at peak')
  })

  it('says same-minute legs are numbered in file order, with an example', () => {
    expect(doc).toContain('numbered in file order')
    expect(doc).toContain('Morning Run, 6:11 am (2)')
  })
})
