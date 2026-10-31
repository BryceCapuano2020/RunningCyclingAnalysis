import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('.', import.meta.url))

/** Calls that read or set a calendar field in `Date`'s own zone, which only calendar.ts may do. */
const AMBIENT =
  /\.(?:getTimezoneOffset|setHours|getHours|getDate|getFullYear|getMonth|getDay|setDate)\(/

/**
 * The files outside calendar.ts that still read the device's clock for the hour of day, and why. The hour names
 * an activity ("Morning run") when it is imported and labels a time on the screen: both are the device's own
 * morning, not a calendar day, and neither is part of a figure.
 */
const HOUR_OF_DAY = ['import/names.ts', 'units/format.ts']

function sources(dir: string, out: { path: string; text: string }[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'test' && entry.name !== 'node_modules') sources(path, out)
    } else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      out.push({ path: relative(SRC, path), text: readFileSync(path, 'utf8') })
    }
  }
  return out
}

describe('the device’s zone', () => {
  const files = sources(SRC)

  it('is read in calendar.ts only, except for the hour of a name and a label', () => {
    expect(files.length).toBeGreaterThan(300)
    const offenders = files
      .filter(({ path, text }) => path !== 'calendar.ts' && AMBIENT.test(text))
      .map(({ path }) => path)
    expect(offenders.sort()).toEqual([...HOUR_OF_DAY].sort())
  })

  it('is not read for the hour of day in anything that is a figure', () => {
    for (const path of HOUR_OF_DAY) {
      const text = files.find((f) => f.path === path)!.text
      expect(text, path).toMatch(/getHours\(\)/)
      expect(text.match(AMBIENT)?.length, path).toBe(1)
    }
  })

  it('is read by calendar.ts, which is where the guard looks for it', () => {
    expect(files.find((f) => f.path === 'calendar.ts')!.text).toMatch(AMBIENT)
  })
})
