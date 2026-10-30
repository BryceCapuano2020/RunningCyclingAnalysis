import { describe, expect, it } from 'vitest'
import * as digestLimits from '@rca/core/digest/limits'
import { DEFAULT_EXTRACT_LIMITS } from '@rca/core/fit'
import { DEFAULT_PARSE_LIMITS } from '@rca/core/import'
import * as importLimits from '@rca/core/import/limits'
import { readStylesheet } from './ui/components/stylesheet'

/*
 * docs/LIMITS.md lists every limit the importer and the digest reader hold, with its value. Each
 * constant must have a row whose value is the one in the code, so a change to a limit fails here until
 * the page says the new number, and a new limit fails here until it is listed.
 */
const doc = await readStylesheet(import.meta.url, '../../../docs/LIMITS.md')
const rows = doc
  .split('\n')
  .filter((line) => line.startsWith('|'))
  .map((line) => line.split('|').map((cell) => cell.trim()))

/** The value cell of the row that names a constant, or undefined when none does. */
function valueOf(name: string): string | undefined {
  return rows.find((cells) => cells[1]?.includes(`\`${name}\``))?.[2]
}

function numbersOf(group: object): Array<[string, number]> {
  return Object.entries(group).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  )
}

describe.each([
  ['the file and archive limits', numbersOf(importLimits)],
  ['the digest bounds', numbersOf(digestLimits)],
  ['the per-file parse limits', numbersOf(DEFAULT_PARSE_LIMITS)],
  ['the archive limits', numbersOf(DEFAULT_EXTRACT_LIMITS)],
])('docs/LIMITS.md gives %s as the code sets them', (_label, limits) => {
  it('has a row for each, with its value', () => {
    expect(limits.length).toBeGreaterThan(3)
    for (const [name, value] of limits) {
      expect(valueOf(name), name).toBe(value.toLocaleString('en-US'))
    }
  })
})
