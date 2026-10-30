import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DAILY_LIMITS,
  DAILY_UPLOAD_BYTES,
  DATABASE_SOFT_LIMIT_BYTES,
  MAX_ACTIVITIES_PER_USER,
  MAX_CONCURRENT_UPLOADS_PER_USER,
  MAX_DIGEST_BYTES,
  MAX_DIGEST_BYTES_PER_USER,
  MAX_FILE_BYTES,
  MAX_GLOBAL_R2_MONTHLY_OPERATIONS,
  MAX_GLOBAL_R2_STANDARD_OPERATIONS,
  MAX_GLOBAL_R2_WRITE_BYTES,
  MAX_MEASUREMENTS_PER_USER,
  MAX_MONTHLY_R2_PUT_BYTES,
  MAX_PAGE_BODY_BYTES,
  MAX_PAGE_DIGEST_BYTES,
  MAX_PAGE_SIZE,
  MAX_RECORD_ENVELOPE_BYTES,
  MAX_STORED_BYTES_PER_USER,
  MIN_GLOBAL_R2_PUT_CHARGE_BYTES,
} from '@rca/contract'
import { UPLOAD_SLOT_LEASE_MS } from './budget.ts'
import { MAX_HEALTH_PROBES_PER_DAY, MAX_HEALTH_PROBES_PER_MONTH } from './healthBudget.ts'
import {
  MAX_MAINTENANCE_OPERATIONS,
  ORPHAN_PAGES_PER_RUN,
  PENDING_DELETIONS_PER_RUN,
} from './maintenance.ts'

/*
 * The numbers in apps/api/LIMITS.md are pinned to the code and configuration they describe, so a limit
 * that changes fails here until the page says the new number. Tables are read cell by cell; sentences
 * are found by the phrase that carries the number.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const doc = read('../LIMITS.md')
const wrangler = read('../wrangler.toml')
const text = doc.replace(/\s+/g, ' ')

const MIB = 1024 * 1024
const GIB = 1024 * MIB
const n = (value: number) => value.toLocaleString('en-US')

/** The cells of every row of the markdown table under `heading`, markup removed. */
function tableRows(heading: string): string[][] {
  const lines = doc.split('\n')
  const start = lines.findIndex((line) => line.startsWith(heading))
  if (start < 0) throw new Error(`LIMITS.md has no heading starting "${heading}"`)
  const rows: string[][] = []
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('#') && rows.length > 0) break
    if (!line.startsWith('|')) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.replace(/[`*]/g, '').trim())
    if (!cells.every((cell) => /^[-: ]*$/.test(cell))) rows.push(cells)
  }
  return rows.slice(1)
}

describe('the per-minute rate limit table', () => {
  const rows = tableRows('## Per-minute rate limits')

  it('lists every rate limiter binding of wrangler.toml, with its namespace id and limit', () => {
    const bindings = [
      ...wrangler.matchAll(
        /name = "(\w+)"\nnamespace_id = "(\d+)"\nsimple = \{ limit = (\d+), period = 60 \}/g,
      ),
    ]
    expect(bindings.map((binding) => binding[1])).toHaveLength(rows.length)
    expect(bindings.length).toBeGreaterThan(0)
    for (const [, name, namespace, limit] of bindings) {
      const row = rows.find((cells) => cells[0] === name)
      expect(row, `a row for ${name}`).toBeDefined()
      expect(row![1]).toBe(namespace)
      expect(Number(row![2]!.replace(/,/g, ''))).toBe(Number(limit))
    }
  })
})

describe('the daily budget table', () => {
  const rows = tableRows('## Daily budgets')
  const BY_ACTION: Record<keyof typeof DAILY_LIMITS, string> = {
    fileDownload: 'File downloads',
    profileWrite: 'Profile writes',
    measurementWrite: 'Dated-settings writes',
    measurementRead: 'Dated-settings reads',
    activityDelete: 'Activity deletions',
    activityCreate: 'Activity creates',
    fileUpload: 'Original-file uploads',
    read: 'Library listings',
  }

  it.each(Object.entries(BY_ACTION))('gives %s the limit the code sets', (key, label) => {
    const row = rows.find((cells) => cells[0]!.startsWith(label))
    expect(row, `a row for ${label}`).toBeDefined()
    expect(Number(row![1]!.replace(/,/g, ''))).toBe(DAILY_LIMITS[key as keyof typeof DAILY_LIMITS])
  })

  it('has a row for every budgeted action, and none for an action that is gone', () => {
    expect(Object.keys(BY_ACTION).sort()).toEqual(Object.keys(DAILY_LIMITS).sort())
    // The seven cleared rows are the actions above plus the upload-bytes row.
    expect(rows).toHaveLength(Object.keys(DAILY_LIMITS).length + 1)
  })

  it('gives the daily upload bytes as the budget sets them', () => {
    const row = rows.find((cells) => cells[0]!.startsWith('Original-file bytes'))
    expect(row![1]).toBe(`1 GiB (${n(DAILY_UPLOAD_BYTES)} bytes)`)
    expect(DAILY_UPLOAD_BYTES).toBe(GIB)
  })

  it('says creates are capped at the library limit, and uploads at their own', () => {
    expect(text).toContain(`(\`MAX_ACTIVITIES_PER_USER\`, ${n(MAX_ACTIVITIES_PER_USER)})`)
    expect(text).toContain(`Uploads are capped at ${n(DAILY_LIMITS.fileUpload)}`)
    expect(text).toContain(`**${n(DAILY_LIMITS.read)} per UTC day**`)
  })
})

describe('the per-user limits table', () => {
  const rows = tableRows('## Other per-user limits')
  const value = (label: string) => rows.find((cells) => cells[0] === label)?.[1]

  it('gives each stored quota as the contract sets it', () => {
    expect(value('Activities stored')).toBe(n(MAX_ACTIVITIES_PER_USER))
    expect(value('Digest JSON bytes stored')).toBe(`${MAX_DIGEST_BYTES_PER_USER / MIB} MiB`)
    expect(value('Original-file bytes stored')).toBe(`${MAX_STORED_BYTES_PER_USER / GIB} GiB`)
    expect(value('Dated settings stored')).toBe(n(MAX_MEASUREMENTS_PER_USER))
    expect(value('Concurrent original uploads')).toBe(String(MAX_CONCURRENT_UPLOADS_PER_USER))
    expect(value('Request body')).toBe(
      `${MAX_DIGEST_BYTES / 1024} KiB digest; ${MAX_FILE_BYTES / MIB} MiB file`,
    )
  })

  it('says an upload slot expires after the lease the code grants', () => {
    expect(text).toContain(`A slot expires after ${UPLOAD_SLOT_LEASE_MS / 60_000} minutes`)
  })
})

describe('the activity list figures', () => {
  it('gives the page size and the digest budget', () => {
    expect(text).toContain(
      `at most ${MAX_PAGE_SIZE} activities (\`MAX_PAGE_SIZE\`) and at most ${MAX_PAGE_DIGEST_BYTES / 1024} KiB of digest JSON (\`MAX_PAGE_DIGEST_BYTES\`)`,
    )
    expect(text).toContain(
      `A single digest is at most ${MAX_DIGEST_BYTES / 1024} KiB (\`MAX_DIGEST_BYTES\`)`,
    )
  })

  it('gives the response cap and the record envelope', () => {
    expect(text).toContain(`(${n(MAX_RECORD_ENVELOPE_BYTES)} bytes)`)
    expect(text).toContain(`${n(MAX_PAGE_BODY_BYTES)} bytes in all`)
  })

  it('gives the bound parameters of a page read', () => {
    expect(text).toContain(`${MAX_PAGE_SIZE + 1} of the 100 bound parameters`)
  })
})

describe('the deployment ledger and the database guard', () => {
  it('gives the operation caps', () => {
    expect(text).toContain(`${n(MAX_GLOBAL_R2_MONTHLY_OPERATIONS)} per month hard cap`)
    expect(text).toContain(`${n(MAX_GLOBAL_R2_STANDARD_OPERATIONS)} for ordinary traffic`)
    expect(text).toContain(
      `Cleanup keeps ${n(MAX_GLOBAL_R2_MONTHLY_OPERATIONS - MAX_GLOBAL_R2_STANDARD_OPERATIONS)} headroom`,
    )
  })

  it('gives the deep-health probe caps', () => {
    expect(text).toContain(
      `${n(MAX_HEALTH_PROBES_PER_DAY)} per UTC day and ${n(MAX_HEALTH_PROBES_PER_MONTH)} per UTC month`,
    )
  })

  it('gives the PUT byte caps and the minimum charge', () => {
    expect(text).toContain(
      `${MAX_MONTHLY_R2_PUT_BYTES / GIB} GiB per month**, \`MAX_MONTHLY_R2_PUT_BYTES\``,
    )
    expect(text).toContain(
      `${MAX_GLOBAL_R2_WRITE_BYTES / GIB} GiB lifetime total**, \`MAX_GLOBAL_R2_WRITE_BYTES\``,
    )
    expect(text).toContain(`at least ${MIN_GLOBAL_R2_PUT_CHARGE_BYTES / 1024} KiB`)
  })

  it('gives the database soft limit', () => {
    expect(text).toContain(
      `\`DATABASE_SOFT_LIMIT_BYTES\` is ${DATABASE_SOFT_LIMIT_BYTES / MIB} MiB`,
    )
    expect(text).toContain(`Database over ${DATABASE_SOFT_LIMIT_BYTES / MIB} MiB`)
  })
})

describe('the scheduled job', () => {
  it('runs on the cron expression of wrangler.toml', () => {
    const cron = /crons = \["([^"]+)"\]/.exec(wrangler)![1]
    expect(text).toContain(`\`[triggers] crons = ["${cron}"]\``)
  })

  it('states its per-run bounds as the code sets them', () => {
    expect(text).toContain(
      `\`MAX_MAINTENANCE_OPERATIONS\`, which is **${MAX_MAINTENANCE_OPERATIONS}** per run`,
    )
    expect(text).toContain(`Finishes up to two interrupted account deletions`)
    expect(PENDING_DELETIONS_PER_RUN).toBe(2)
    expect(text).toContain(`Sweeps two pages of`)
    expect(ORPHAN_PAGES_PER_RUN).toBe(2)
  })
})
