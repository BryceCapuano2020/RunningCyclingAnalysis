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
const AMBIENT =
  /\.(?:getTimezoneOffset|setHours|getHours|getMinutes|getDate|getFullYear|setFullYear|getMonth|getDay|setDate)\(|new Date\([^()]*,/

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
  'apps/web/src/share/cardLayout.ts': 'the date written on the share card',
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
    const offenders = files.filter(({ text }) => AMBIENT.test(text)).map(({ path }) => path)
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

  it('is read by calendar.ts, which is where the guard looks for it', () => {
    expect(files.find((f) => f.path === 'packages/core/src/calendar.ts')!.text).toMatch(AMBIENT)
  })
})
