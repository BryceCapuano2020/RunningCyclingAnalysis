import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ANALYSIS_LEDGER_ROWS, ANALYSIS_REVISION } from './analysisRevision'

/** The ledger rows written before the revision existed: revision 2 accounts for the 15th row. */
const REVISION_OFFSET = 13

/** The rows of the ledger's table, header and rule left out. */
function ledgerRows(): number {
  const text = readFileSync(
    new URL('../../../docs/design/model-ledger.md', import.meta.url),
    'utf8',
  )
  const lines = text.split('\n')
  const rule = lines.findIndex((line) => line.startsWith('| ---'))
  let rows = 0
  for (const line of lines.slice(rule + 1) as string[]) {
    if (!line.startsWith('| ')) break
    rows += 1
  }
  return rows
}

describe('the analysis revision', () => {
  it('moves with the model ledger: a new row needs both ANALYSIS_LEDGER_ROWS and ANALYSIS_REVISION moved', () => {
    expect(
      ledgerRows(),
      'The model ledger gained a row: set ANALYSIS_LEDGER_ROWS to the count and bump ANALYSIS_REVISION with it, so stored results made before the change are recomputed',
    ).toBe(ANALYSIS_LEDGER_ROWS)
    // The pair is pinned: the revision is the row count less the 13 rows written before it existed, so a row added
    // without a bump fails here as well as above.
    expect(ANALYSIS_REVISION, 'ANALYSIS_REVISION must move with ANALYSIS_LEDGER_ROWS').toBe(
      ANALYSIS_LEDGER_ROWS - REVISION_OFFSET,
    )
  })
})
