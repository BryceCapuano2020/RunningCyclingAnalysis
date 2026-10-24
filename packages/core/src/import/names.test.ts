import { describe, expect, it, vi } from 'vitest'
import {
  activityName,
  cleanTitle,
  dayPart,
  fileTitle,
  generatedName,
  MAX_TITLE_CHARS,
  withStartTimesWhereShared,
} from './names'

/** A local time on a fixed day, so the hour a test means is the hour the code reads. */
function localAt(hour: number, minute = 0): number {
  return new Date(2025, 4, 15, hour, minute).getTime()
}

describe('dayPart', () => {
  it.each([
    [0, 'Night'],
    [4, 'Night'],
    [5, 'Morning'],
    [10, 'Morning'],
    [11, 'Lunch'],
    [13, 'Lunch'],
    [14, 'Afternoon'],
    [16, 'Afternoon'],
    [17, 'Evening'],
    [20, 'Evening'],
    [21, 'Night'],
    [23, 'Night'],
  ])('puts hour %i in %s', (hour, part) => {
    expect(dayPart(hour)).toBe(part)
  })
})

describe('generatedName', () => {
  it('names a run from the local hour it started', () => {
    expect(generatedName(localAt(6, 30), 'run')).toBe('Morning Run')
    expect(generatedName(localAt(12, 15), 'ride')).toBe('Lunch Ride')
  })

  it('takes the part of the day at the start of each part, minute by minute', () => {
    expect(generatedName(localAt(4, 59), 'run')).toBe('Night Run')
    expect(generatedName(localAt(5, 0), 'run')).toBe('Morning Run')
    expect(generatedName(localAt(10, 59), 'ride')).toBe('Morning Ride')
    expect(generatedName(localAt(11, 0), 'ride')).toBe('Lunch Ride')
    expect(generatedName(localAt(18, 5), 'ride')).toBe('Evening Ride')
    expect(generatedName(localAt(21, 0), 'run')).toBe('Night Run')
  })

  it('names from the start instant across a clock change, not from where the clock ends up', () => {
    // 1:30 am on the day US clocks go forward. Four hours later, in US zones, the clock reads 6:30,
    // but the name keeps the hour the activity started.
    const start = new Date(2025, 2, 9, 1, 30).getTime()
    const fourHoursLater = start + 4 * 60 * 60 * 1000
    expect(generatedName(start, 'run')).toBe('Night Run')
    expect(generatedName(fourHoursLater, 'run')).toBe('Morning Run')
  })
})

describe('withStartTimesWhereShared', () => {
  const at = (name: string, hour: number) => ({ name, startMs: localAt(hour, 0) })

  it('leaves unique names alone', () => {
    const names = [at('Morning Run', 6), at('Lunch Ride', 12)]
    expect(withStartTimesWhereShared(names).map((a) => a.name)).toEqual([
      'Morning Run',
      'Lunch Ride',
    ])
  })

  it('puts the start time inside the brackets of a name that ends in them', () => {
    const names = [at('Brick (Run)', 6), at('Brick (Run)', 12), at('Brick (Ride)', 9)]
    expect(withStartTimesWhereShared(names).map((a) => a.name)).toEqual([
      'Brick (Run, 6:00 am)',
      'Brick (Run, 12:00 pm)',
      'Brick (Ride)',
    ])
  })

  it('numbers the legs that still repeat when they start in the same minute', () => {
    const start = localAt(6, 11)
    const legs = [
      { name: 'Morning Run', startMs: start },
      { name: 'Morning Run', startMs: start + 30_000 },
      { name: 'Morning Run', startMs: start + 45_000 },
    ]
    expect(withStartTimesWhereShared(legs).map((a) => a.name)).toEqual([
      'Morning Run, 6:11 am',
      'Morning Run, 6:11 am (2)',
      'Morning Run, 6:11 am (3)',
    ])
  })

  it('numbers a titled leg inside its brackets after the start time', () => {
    const start = localAt(6, 11)
    const legs = [
      { name: 'Brick (Run)', startMs: start },
      { name: 'Brick (Run)', startMs: start + 20_000 },
    ]
    expect(withStartTimesWhereShared(legs).map((a) => a.name)).toEqual([
      'Brick (Run, 6:11 am)',
      'Brick (Run, 6:11 am) (2)',
    ])
  })

  it('appends the start time to a name without brackets', () => {
    const names = [at('Night Run', 0), at('Night Run', 0)]
    expect(withStartTimesWhereShared(names).map((a) => a.name)).toEqual([
      'Night Run, 12:00 am',
      'Night Run, 12:00 am (2)',
    ])
  })
})

describe('cleanTitle', () => {
  it('counts characters only in the first two times the maximum of a huge name', () => {
    const from = vi.spyOn(Array, 'from')
    try {
      cleanTitle('x'.repeat(2_000_000))
      expect(from.mock.calls.length).toBeGreaterThan(0)
      const longest = Math.max(
        ...from.mock.calls.map(([value]) => (typeof value === 'string' ? value.length : 0)),
      )
      expect(longest).toBeLessThanOrEqual(2 * MAX_TITLE_CHARS)
    } finally {
      from.mockRestore()
    }
  })

  it('collapses leading whitespace before it cuts, so a name after many spaces is kept whole', () => {
    expect(cleanTitle(' '.repeat(5000) + 'Hill repeats')).toBe('Hill repeats')
  })

  it('cuts by character, so an emoji is never split in half', () => {
    const cut = Array.from(cleanTitle('🏃'.repeat(MAX_TITLE_CHARS + 5))!)
    expect(cut).toHaveLength(MAX_TITLE_CHARS)
    expect(cut.at(-1)).toBe('…')
  })

  it('keeps an emoji title of exactly the maximum number of characters', () => {
    const exact = '🏃'.repeat(MAX_TITLE_CHARS)
    expect(cleanTitle(exact)).toBe(exact)
  })

  it('trims a title and joins its lines', () => {
    expect(cleanTitle('  Hill\n   repeats  ')).toBe('Hill repeats')
  })

  it('returns nothing for a missing or blank title', () => {
    expect(cleanTitle(undefined)).toBeUndefined()
    expect(cleanTitle(' \n\t ')).toBeUndefined()
  })

  it('cuts a long title to the maximum with an ellipsis', () => {
    const cut = cleanTitle('x'.repeat(MAX_TITLE_CHARS + 50))!
    expect(cut).toHaveLength(MAX_TITLE_CHARS)
    expect(cut.endsWith('…')).toBe(true)
  })

  it('keeps a title that is exactly the maximum', () => {
    const exact = 'x'.repeat(MAX_TITLE_CHARS)
    expect(cleanTitle(exact)).toBe(exact)
  })
})

describe('fileTitle', () => {
  it('keeps a title a person wrote', () => {
    expect(fileTitle('Sunday Long Run with the Wednesday Group')).toBe(
      'Sunday Long Run with the Wednesday Group',
    )
  })

  it.each([
    ['ACTIVE LOG'],
    ['ACTIVE LOG #2'],
    ['ACTIVE LOG 1'],
    ['001'],
    ['2020-12-18 07:24:29'],
    ['2019-02-17 06:26:44 +0000'],
    ['2013-07-06T14:59:00Z'],
    ['2025-05-15'],
    ['Run 2019-02-17'],
  ])('ignores %s, which a device writes by default', (name) => {
    expect(fileTitle(name)).toBeUndefined()
  })

  it('keeps a title that only starts like a device name', () => {
    expect(fileTitle('Hill repeats 2019-02-17')).toBe('Hill repeats 2019-02-17')
  })

  it('ignores a blank title', () => {
    expect(fileTitle('   ')).toBeUndefined()
  })
})

describe('activityName', () => {
  const leg = { sport: 'run' as const, startMs: localAt(7, 0), shared: false }

  it('uses the title when there is one', () => {
    expect(activityName('Hill repeats', leg)).toBe('Hill repeats')
  })

  it('generates the name from the start and the sport when there is no title', () => {
    expect(activityName(undefined, leg)).toBe('Morning Run')
    expect(activityName('  ', leg)).toBe('Morning Run')
  })

  it('adds the sport to a title shared by several activities, so their legs tell apart', () => {
    const ride = { sport: 'ride' as const, startMs: localAt(7, 0), shared: true }
    expect(activityName('Brick', ride)).toBe('Brick (Ride)')
    expect(activityName('Brick', { ...leg, shared: true })).toBe('Brick (Run)')
  })

  it('adds the part number to a titled activity that a long gap split', () => {
    expect(activityName('Long ride', { ...leg, part: 2 })).toBe('Long ride (part 2)')
  })

  it('leaves the part out of a generated name, which the start time already tells apart', () => {
    expect(activityName(undefined, { ...leg, part: 2 })).toBe('Morning Run')
  })
})
