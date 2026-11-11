import { describe, expect, it } from 'vitest'
import { CHANGE } from '@rca/core/change'
import {
  METHOD_ENTRIES,
  STATE_COPY,
  STATE_ORDER,
  entriesOf,
  entryNamed,
  type EntryState,
} from './methodEntries'
import type { SectionId } from '../pages/sportSections'

const namesIn = (state: EntryState) => entriesOf(state).map((entry) => entry.name)

/** Every line an entry holds: its plain lines, then its detail lines. */
const linesOf = (entry: (typeof METHOD_ENTRIES)[number]) => [
  ...entry.lines,
  ...(entry.detail ?? []),
]

/** A sentence ends at a full stop followed by a space; a line may hold a decimal point or an initial. */
const SENTENCE_END = /(?<=[a-z)%\]])\. (?=[A-Z])/

describe('How this works entries', () => {
  it('names its three states as the page lists them', () => {
    expect(STATE_ORDER.map((state) => STATE_COPY[state].title)).toEqual([
      'Calculated by this app',
      'Recorded in your files',
      'Not available from activity files',
    ])
  })

  it('lists what the app shows that has no section of its own, in the state it belongs to', () => {
    expect(namesIn('calculated')).toEqual([
      'Best efforts and curves',
      'How a change is called',
      'The default period',
      'Fitness status',
      'Dated settings and zones',
      'Runs at walking pace',
    ])
    expect(namesIn('read')).toEqual([
      'What files record',
      'Data checks',
      'Treadmill and indoor data',
    ])
    expect(namesIn('unavailable')).toEqual(['Readiness, vendor tests and lab measures'])
  })

  it('has an entry for every section a sport page can show, or a Method section of its own', () => {
    // Typed by SectionId, so a new section fails to compile here until it is placed. Race predictions have their own
    // Method section, Thresholds and race times, which their Details link to. Levels say what they mean in the table itself.
    const entryFor: Record<SectionId, RegExp | null> = {
      years: /Fitness status/,
      bestEfforts: /Best efforts and curves/,
      levels: null,
      racePredictions: null,
      timeInZones: /Dated settings and zones/,
    }
    const calculated = namesIn('calculated')
    for (const id of Object.keys(entryFor) as SectionId[]) {
      const pattern = entryFor[id]
      if (pattern !== null)
        expect(
          calculated.some((name) => pattern.test(name)),
          id,
        ).toBe(true)
    }
    expect(entryNamed('Fitness status').lines.join(' ')).toMatch(/over the years on History/)
    expect(entryNamed('Dated settings and zones').lines.join(' ')).toMatch(/Coggan’s power levels/)
  })

  it('says how a change is called, with the numbers from the test’s own constants', () => {
    const { lines } = entryNamed('How a change is called')
    expect(lines.join(' ')).toContain(`${CHANGE.draws.toLocaleString('en-US')} random deals`)
    expect(lines.join(' ')).toContain('outside the middle 90%')
    expect(lines).toContain(`It needs ${CHANGE.minPerSide} efforts of a length in each period.`)
  })

  it('writes the default period as the shortest window every sport qualifies in, and a picked one as kept', () => {
    const { lines } = entryNamed('The default period')
    expect(lines[0]).toMatch(/^The shortest of .+ in which every sport qualifies\.$/)
    expect(lines).toContain('A period you pick is always used.')
  })

  it('says indoor pace is never used for bests, and what a data check does', () => {
    expect(entryNamed('Treadmill and indoor data').lines.join(' ')).toMatch(
      /indoor pace is never used for bests, thresholds or predictions/,
    )
    expect(entryNamed('Data checks').lines).toContain(
      'Dropouts and implausible readings are left out, never corrected.',
    )
  })

  it('gives each name once, and says each line once', () => {
    const names = METHOD_ENTRIES.map((entry) => entry.name)
    expect(new Set(names).size).toBe(names.length)
    const lines = METHOD_ENTRIES.flatMap(linesOf)
    expect(new Set(lines).size).toBe(lines.length)
  })

  it('keeps each line one sentence of 25 words or fewer, with no hedge and none of the words the app avoids', () => {
    for (const entry of METHOD_ENTRIES) {
      for (const line of linesOf(entry)) {
        expect(line.split(SENTENCE_END).length, line).toBe(1)
        expect(line, line).toMatch(/\.$/)
        expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(25)
      }
    }
    const copy = METHOD_ENTRIES.map((entry) => `${entry.name} ${linesOf(entry).join(' ')}`).join(
      ' ',
    )
    expect(copy).not.toMatch(
      /limiter|weak|strength|holding you back|ahead of|may be|might|approximately|quietly|because/i,
    )
    expect(copy).not.toMatch(/\b(centered|summarizes|analyze|color|kilometer)\w*/i)
  })
})
