import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const CORE = join(ROOT, 'packages/core/src')
const WEB = join(ROOT, 'apps/web/src')

/**
 * Calls that read or set a calendar field in `Date`'s own zone, or build a date from local fields. Only
 * calendar.ts may: every figure that depends on a day, a week, a month or a year asks it, so a figure is the
 * same on every device (D12 section 2.5).
 */
const FIELD_CALL =
  /\.(?:getTimezoneOffset|setHours|getHours|getMinutes|getDate|getFullYear|setFullYear|getMonth|getDay|setDate)\(|Intl\.DateTimeFormat\(/

/** Whether the text builds a date from fields (`new Date(y, m, ...)`, however nested the arguments): two or more top-level arguments. */
function buildsFromFields(text: string): boolean {
  for (let at = text.indexOf('new Date('); at !== -1; at = text.indexOf('new Date(', at + 1)) {
    let depth = 0
    for (let i = at + 'new Date'.length; i < text.length; i++) {
      const c = text[i]
      if (c === '(' || c === '[' || c === '{') depth++
      else if (c === ')' || c === ']' || c === '}') {
        depth--
        if (depth === 0) break
      } else if (c === ',' && depth === 1) return true
    }
  }
  return false
}

const reads = (text: string) => FIELD_CALL.test(text) || buildsFromFields(text)

/**
 * The files outside calendar.ts that still read the device's clock, and why. Each shows an instant as the
 * device's own wall clock, or names a file or an activity by it; none is part of a figure.
 */
const ALLOWED: Record<string, string> = {
  'packages/core/src/calendar.ts': 'the one module that does calendar arithmetic',
  'packages/core/src/import/names.ts': 'the hour names an activity ("Morning run") when imported',
  'packages/core/src/units/format.ts': 'the hour of a time on the screen',
  'apps/web/src/worker/viewerZone.ts': 'the adapter that hands the device zone to the calendar',
  'apps/web/src/ui/format/date.ts': 'dates written for the screen, in the device’s own clock',
  'apps/web/src/ui/checkInFixtures.ts':
    'a test fixture: noon on the reader’s own clock, so its words hold in any zone',
  'apps/web/src/ui/limitCopy.ts':
    'the time a daily limit resets, written on the viewer’s own clock',
  'apps/web/src/export/saveExport.ts': 'the date in the name of an export file',
}

function sources(dir: string, out: { path: string; text: string }[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'test' && entry.name !== 'node_modules') sources(path, out)
    } else if (/\.tsx?$/.test(entry.name) && !/\.(?:test|sim|perf)\.tsx?$/.test(entry.name)) {
      out.push({ path: relative(ROOT, path), text: readFileSync(path, 'utf8') })
    }
  }
  return out
}

describe('the device’s zone', () => {
  const files = [...sources(CORE), ...sources(WEB)]

  it('is read in calendar.ts and the files named here only', () => {
    expect(files.length).toBeGreaterThan(600)
    const offenders = files.filter(({ text }) => reads(text)).map(({ path }) => path)
    expect(offenders.sort()).toEqual(Object.keys(ALLOWED).sort())
  })

  it('is not read for a day, week, month or year by the files that show a time', () => {
    const readsDay = /\.(?:getDate|getDay|getMonth|setDate)\(/
    for (const path of ['packages/core/src/import/names.ts', 'packages/core/src/units/format.ts']) {
      const text = files.find((f) => f.path === path)!.text
      expect(text, path).toMatch(/getHours\(\)/)
      expect(readsDay.test(text), path).toBe(false)
    }
  })

  it('is found when a date is built from fields, however the arguments nest', () => {
    expect(reads('new Date(d.getUTCFullYear(), d.getUTCMonth(), 1, 12)')).toBe(true)
    expect(reads('new Date(f(a, b), 1)')).toBe(true)
    expect(reads('new Intl.DateTimeFormat(undefined, {})')).toBe(true)
    expect(reads('Intl.DateTimeFormat(undefined, {})')).toBe(true)
    expect(reads('new Date(ms)')).toBe(false)
    expect(reads('new Date(Date.UTC(2020, 1, 2))')).toBe(false)
    expect(reads('new Date(f(a, b))')).toBe(false)
  })

  it('is read by calendar.ts, which is where the guard looks for it', () => {
    expect(files.find((f) => f.path === 'packages/core/src/calendar.ts')!.text).toSatisfy(reads)
  })
})
