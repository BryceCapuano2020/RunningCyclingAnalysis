import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (url: string) => readFileSync(fileURLToPath(new URL(url, import.meta.url)), 'utf8')

describe('held-out log', () => {
  it('the last log row names the hash of the configurations and their bands', () => {
    const hash = createHash('sha256')
      .update(read('./heldOut.ts'))
      .update(read('./heldOut.bands.ts'))
      .digest('hex')
      .slice(0, 12)
    const rows = read('../../../../../docs/design/heldout-log.md')
      .split('\n')
      .filter((line) => /^\| \d{4}-\d{2}-\d{2} \|/.test(line))
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[rows.length - 1]).toContain(`\`${hash}\``)
  })
})
