import { describe, expect, it } from 'vitest'
import { CHANGE } from '@rca/core/change'
import { DEFAULT_WINDOW_DAYS, MIN_WINDOW_DAYS } from '@rca/core/digest/trendPoints'
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

  it('lists every feature the app shows today in the state it belongs to', () => {
    const calculated = namesIn('calculated').join(' | ')
    for (const feature of [
      /Thresholds and floors/,
      /Best efforts and curves/,
      /Race predictions/,
      /Best efforts over time/,
      /How a change is called/,
      /The default period/,
      /Pace at heart rate/,
      /Best durations/,
      /Splits/,
      /The timeline in detail/,
      /Time in zones/,
      /Durability/,
      /reps held up/,
      /Weekly hours by sport/,
      /Runs at walking pace/,
      /Dated settings and zones/,
    ]) {
      expect(calculated).toMatch(feature)
    }
    expect(namesIn('read').join(' | ')).toMatch(
      /Heart rate.*Power from a power meter.*Timelines and laps.*Data checks.*Treadmill and indoor data/,
    )
  })

  it('has an entry for every section a sport page can show', () => {
    // Typed by SectionId, so a new section fails to compile here until it is listed.
    const entryFor: Record<SectionId, RegExp> = {
      years: /History/,
      bestEfforts: /Best efforts and curves/,
      racePredictions: /Race predictions/,
      bestsOverTime: /Best efforts over time/,
      sameHeartRate: /Pace at heart rate/,
      lateInEffort: /Durability/,
      timeInZones: /Time in zones/,
      standOut: /Best durations/,
      evidence: /Best efforts and curves/,
    }
    const calculated = namesIn('calculated')
    for (const id of Object.keys(entryFor) as SectionId[]) {
      expect(calculated.some((name) => entryFor[id].test(name))).toBe(true)
    }
  })

  it('puts readiness scores and vendor tests where they cannot be worked out', () => {
    const unavailable = entriesOf('unavailable')
    expect(unavailable.map((entry) => entry.name)).toEqual([
      'Readiness and recovery scores',
      'Vendor tests such as 4DP',
      'Lab measures such as lactate',
    ])
    expect(unavailable[0]?.lines.join(' ')).toMatch(
      /sleep, heart-rate variability and resting heart rate/,
    )
  })

  it('says what the figures come from, and where a file’s own values are the device’s', () => {
    expect(STATE_COPY.calculated.lines.join(' ')).toMatch(/year of birth, sex and weight/)
    const read = entryNamed('Sport, start time, distance, speed and route')
    expect(read.lines.join(' ')).toMatch(/activity type/)
    expect(read.lines.join(' ')).toMatch(/GPS positions with bad fixes dropped/)
    expect(entryNamed('Race predictions').lines.join(' ')).toMatch(/weekly running distance/)
  })

  it('gives each state at least one entry, and each name once', () => {
    for (const state of STATE_ORDER) expect(namesIn(state).length).toBeGreaterThan(0)
    const names = METHOD_ENTRIES.map((entry) => entry.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('says each line once across every entry, so no idea is defined twice', () => {
    const lines = METHOD_ENTRIES.flatMap(linesOf)
    expect(new Set(lines).size).toBe(lines.length)
  })

  it('drops the entries that only repeated another section’s explanation', () => {
    // Each of these is said once elsewhere on the page: the energy view, the age grades or the accuracy section.
    const names = METHOD_ENTRIES.map((entry) => entry.name)
    for (const repeated of [
      'Balance and levels',
      'Level target',
      'Grade by duration',
      'Virtual power',
      'Equivalence across sports',
      'Heart-rate set-aside',
      'Whether a change is a change',
      'Limits',
      'Where speed comes from',
    ]) {
      expect(names).not.toContain(repeated)
    }
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
      /limiter|weak|strength|holding you back|ahead of|may be|might|approximately|disclaimer/i,
    )
    expect(copy).not.toMatch(/impossible/)
    expect(copy).toMatch(/implausible readings/)
  })

  it('takes the figures it quotes from the code: the headline length and the threshold fit', () => {
    const threshold = entryNamed('Thresholds and floors')
    expect(threshold.lines.join(' ')).toContain('best 3 to 20 min efforts')
    expect(threshold.lines.join(' ')).toContain('your best 30 min or else 20 min')
  })

  it('explains a floor in one line: what “At least” marks, which best it is, and what that means for the threshold', () => {
    const threshold = entryNamed('Thresholds and floors')
    const floor = threshold.lines.filter((line) => line.includes('“At least”'))
    expect(floor).toEqual([
      'A floor, marked “At least”, is your best 30 min or else 20 min, and your real threshold is at least that.',
    ])
    expect(threshold.lines).toContain(
      'A 20 min best that was not hard sets a floor instead of a threshold.',
    )
    // The fit is stated as the threshold's, so the figure on Profile is not read as a fit of the best 30 min.
    expect(threshold.lines[0]).toMatch(/fitted to your best 3 to 20 min efforts/)
    expect(threshold.detail).toContain(
      'A best under 20 min is labelled with its length and is not a floor.',
    )
  })

  it('keeps the threshold’s own range in the threshold entry, apart from the 90% range', () => {
    const threshold = entryNamed('Thresholds and floors')
    expect(threshold.lines).toContain(
      'Its range is the fit’s own range, which is not the balance’s 90% range.',
    )
    expect(threshold.detail).toContain('It runs down by one standard error of the fit.')
    expect(threshold.detail).toContain('The allowance is calibrated on simulated athletes.')
    expect(entryNamed('Race predictions').lines).toContain(
      'The marathon’s range comes from a published validation.',
    )
  })

  it('says running bests start at 5 minutes and the running curve at 3, and why', () => {
    const lines = entryNamed('Best efforts and curves').lines
    expect(lines).toContain('Running bests by time start at 5 min and the running curve at 3 min.')
    expect(lines).toContain(
      'Shorter slope-adjusted windows mostly measure the slope reading, so they say little about the runner.',
    )
  })

  it('writes the default period as the shortest window every sport qualifies in, with the picked period never searched', () => {
    const { lines } = entryNamed('The default period')
    expect(lines).toContain(
      'The default period is the shortest window where every sport qualifies.',
    )
    expect(lines).toContain('A period you pick yourself is always used.')
    expect(lines).toContain('If two windows tie, the shorter one is used.')
  })

  it('says in the detail that a fitness status takes the seasonal swing out, and where its size is', () => {
    const trend = entryNamed('Best efforts over time')
    expect(trend.detail).toContain(
      'A fitness status first takes your usual seasonal swing out of every steady run, when your runs show one.',
    )
    expect(trend.detail).toContain('The size taken out is under See the evidence on the card.')
    // The card no longer says it, and the main page holds none of it.
    expect(trend.lines.join(' ')).not.toMatch(/seasonal/)
  })

  it('keeps the window and the bike model in the dated bests’ detail, with the days from the code', () => {
    const detail = entryNamed('Best efforts over time').detail?.join(' ') ?? ''
    expect(detail).toContain(
      `a third of the period’s length, kept between ${MIN_WINDOW_DAYS} and ${DEFAULT_WINDOW_DAYS} days`,
    )
    expect(detail).toContain(
      '6 weeks uses 14 days, 12 weeks uses 28 days, 6 months uses 42 days and 12 months uses 42 days.',
    )
    expect(detail).toContain('period’s one bike model')
    expect(detail).not.toContain('running economy')
  })

  it('explains the dated bests in plain facts, with no line and no window in the plain text', () => {
    const { lines } = entryNamed('Best efforts over time')
    expect(lines).toContain('Each dot is the best effort of its stretch, on the day it was done.')
    expect(lines).toContain('Each chart is for one length: 5 min, 20 min or 60 min.')
    expect(lines).toContain('Running uses grade-adjusted pace (GAP).')
    expect(lines).toContain('That is your pace allowing for hills, as if on level ground.')
    expect(lines).toContain('Cycling uses power in watts.')
    expect(lines).toContain('There is no line.')
    // Wherever a sport has a fitness status that is the trend, so the sentence reads right with or without a ride status.
    expect(lines).toContain('A fitness status comes from steady efforts at the same heart rate.')
    expect(lines).toContain('Where a sport has one, that status is the trend.')
    expect(lines).toHaveLength(11)
  })

  it('says how a change is called, with the numbers from the test’s own constants', () => {
    const change = entryNamed('How a change is called')
    expect(change.lines).toContain('The app calls a change only when it is bigger than chance.')
    // The strip lists a change plainly, so the page says what a call that read every effort can mean.
    expect(change.lines).toContain(
      'When either period has no hard efforts, a change compares every effort, so an easy period can read as slower.',
    )
    expect(change.lines).toContain(
      `With fewer than ${CHANGE.minPerSide} efforts of a length in either period, the app says nothing about it.`,
    )
    const detail = change.detail?.join(' ') ?? ''
    expect(detail).toContain(`${CHANGE.draws.toLocaleString('en-US')} times`)
    // The false-call rate is the simulations' own at a real library's spread, not "one time in ten at most".
    expect(detail).toContain('3% to 8% of pairs on a record row')
    expect(detail).not.toContain('one time in ten')
    expect(detail).toContain('A swing in how many hard efforts a period holds is not allowed for')
  })

  it('says which speed a GPX, TCX or GPS-only file uses, and where GPS is less reliable', () => {
    const entry = entryNamed('Sport, start time, distance, speed and route')
    expect(entry.lines).toContain('A file that records speed uses that speed.')
    const detail = entry.detail?.join(' ') ?? ''
    expect(detail).toContain(
      'the change in distance over the 10 s either side of each point (a centred difference)',
    )
    expect(detail).toContain('GPX files never carry device speed')
    expect(detail).toContain('a 20 s window centred on each point')
    expect(detail).toContain('more than twice the sport’s maximum speed')
    expect(detail).toContain('credits no distance across a gap longer than 30 s')
    expect(detail).toContain('Speeds below 0.5 m/s count as still.')
    expect(detail).toContain('Short best efforts under about 30 s')
  })

  it('names each data check once: dropouts, never corrected, the heart rate left out, and indoor data', () => {
    const checks = entryNamed('Data checks').lines
    expect(checks).toContain(
      'Sensor dropouts and implausible readings are left out automatically, never corrected.',
    )
    expect(checks).toContain('The watts and pace still count.')
    expect(entryNamed('Treadmill and indoor data').lines).toContain(
      'Indoor pace is never used for bests, thresholds or predictions.',
    )
    expect(entryNamed('Heart rate').lines).toContain('Heat, altitude and fatigue shift heart rate.')
  })

  it('names the zone schemes and the dated settings rules in the settings entry', () => {
    const settings = entryNamed('Dated settings and zones')
    expect(settings.lines).toContain('Each activity uses the latest entry on or before its day.')
    expect(settings.lines).toContain(
      'Training zones are cut from those settings by published schemes.',
    )
    expect(settings.detail).toContain('Power uses Coggan’s seven power levels.')
    expect(settings.detail).toContain('Pace uses Friel’s pace zones from threshold pace.')
  })

  it('uses British spelling', () => {
    const copy = METHOD_ENTRIES.flatMap(linesOf).join(' ')
    expect(copy).toMatch(/centred/)
    expect(copy).not.toMatch(/\b(centered|summarizes|analyze|color|kilometer)\w*/i)
  })
})
