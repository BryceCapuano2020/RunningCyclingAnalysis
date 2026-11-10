import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ANALYSIS_LEDGER_ROWS, ANALYSIS_REVISION } from './analysisRevision'

/** The rows of the ledger's table, header and rule left out. */
function ledgerRows(): number {
  const text = readFileSync(
    new URL('../../../docs/design/model-ledger.md', import.meta.url),
    'utf8',
  )
  const lines = text.split('\n')
  const rule = lines.findIndex((line) => line.startsWith('| ---'))
  let rows = 0
  for (const line of lines.slice(rule + 1)) {
    if (!line.startsWith('| ')) break
    rows += 1
  }
  return rows
}

describe('the analysis revision', () => {
  it('moves with the model ledger: a new row needs ANALYSIS_REVISION bumped and ANALYSIS_LEDGER_ROWS set', () => {
    expect(
      ledgerRows(),
      'The model ledger gained a row: bump ANALYSIS_REVISION and set ANALYSIS_LEDGER_ROWS to the count, so stored results made before the change are recomputed',
    ).toBe(ANALYSIS_LEDGER_ROWS)
    expect(ANALYSIS_REVISION).toBeGreaterThanOrEqual(2)
  })
})
