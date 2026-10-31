import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS } from '@rca/core/fit'
import { MAX_ACTIVITY_LIST_BYTES, MAX_CSV_CELLS_PER_ROW } from '@rca/core/import'
import { WORKBENCH_ENTRY_BYTES, WORKBENCH_TOTAL_BYTES } from './worker/workbenchSchema'
import { MAX_CSV_FIELD_CHARS } from '@rca/core/import/limits'
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

/** Said when a pin fails: the page and the code disagree, and either may be the one that is wrong. */
const HINT =
  'docs/ARCHITECTURE.md and the code disagree: update the doc, or the code if the doc is right.'

describe('architecture doc states the Strava activity list limits as the code sets them', () => {
  it('gives the inflated byte cap in MiB', () => {
    expect(doc, HINT).toContain(`${MAX_ACTIVITY_LIST_BYTES / (1024 * 1024)} MiB`)
  })

  it('gives the cell cap per row, which bounds the cells a parse builds', () => {
    expect(doc, HINT).toContain(`more than ${MAX_CSV_CELLS_PER_ROW} cells`)
  })

  it('gives the field cap, in KiB and in characters', () => {
    expect(doc).toContain(
      `more than ${MAX_CSV_FIELD_CHARS / 1024} KiB (${MAX_CSV_FIELD_CHARS.toLocaleString('en-US')} characters)`,
    )
  })

  it('gives the row cap as rows in all', () => {
    const rows = DEFAULT_EXTRACT_LIMITS.maxFitFiles.toLocaleString('en-US')
    expect(doc, HINT).toContain(`at most ${rows} rows in all`)
  })

  it('says the byte cap is a memory budget, with its peak', () => {
    expect(doc, HINT).toContain('The cap is a memory budget')
    expect(doc, HINT).toContain('about 100–150 MB at peak')
  })

  it('says same-minute legs are numbered in file order, with an example', () => {
    expect(doc, HINT).toContain('numbered in file order')
    expect(doc, HINT).toContain('Morning Run, 6:11 am (2)')
  })
})

const MIB = 1024 * 1024

describe('architecture doc states the workbench cache limits as the code sets them', () => {
  it('gives the shared budget and the entry limit in MiB', () => {
    expect(doc, HINT).toContain(
      `Its shared ${WORKBENCH_TOTAL_BYTES / MIB} MiB budget and ${WORKBENCH_ENTRY_BYTES / MIB} MiB entry limit are defined in \`workbenchSchema.ts\``,
    )
  })

  it('says the budget is global, so the doc and the privacy page cannot disagree about it', () => {
    expect(doc, HINT).toContain(
      `the device results and every account share the ${WORKBENCH_TOTAL_BYTES / MIB} MiB`,
    )
  })
})
