import { describe, expect, it } from 'vitest'
import { CHANGE } from '@rca/core/change'
import { runDurationRatio } from '@rca/core/threshold'
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
      /Thresholds/,
      /Best efforts and curves/,
      /Race predictions/,
      /Fitness status/,
      /How a change is called/,
      /The default period/,
      /Splits/,
      /The timeline in detail/,
      /Time in zones/,
      /reps held up/,
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
      timeInZones: /Time in zones/,
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

  it('takes the figures it quotes for a run from the running table, not from a hand-typed copy', () => {
    const { detail } = entryNamed('Thresholds')
    // Daniels and Gilbert's share of top effort held for m minutes, over the share held for an hour: 1.137, 1.073, 1.029.
    expect(detail).toContain(
      'It puts an all-out 10 min effort 14% above your hour’s oxygen cost, 20 min 7% and 40 min 3%.',
    )
    expect(runDurationRatio(600)).toBeCloseTo(1.137, 3)
    expect(runDurationRatio(1200)).toBeCloseTo(1.073, 3)
    expect(runDurationRatio(2400)).toBeCloseTo(1.029, 3)
  })

  it('says how a ride’s threshold is worked out: each ride’s strongest effort, averaged, with heart rate lifting it and never lowering it', () => {
    const { lines, detail } = entryNamed('Thresholds')
    expect(lines).toContain(
      'A ride’s threshold is the strongest effort of each ride, scaled to an hour and averaged.',
    )
    expect(lines).toContain('A ride’s threshold can be raised by heart rate and never lowered.')
    expect(detail).toContain(
      'The answer is the estimate from power alone, unless heart rate shows you had more in you.',
    )
    expect(detail).toContain('Then it rises toward what heart rate reads, and no further.')
    expect(detail).toContain(
      'The rides are averaged, with more weight on recent rides and on those near your top.',
    )
    expect(detail).toContain(
      'Heart rate is left out of a ride where the strap sticks or reads far from your other rides.',
    )
    expect(detail).toContain(
      'A ride’s range takes the higher 10th and the higher 90th percentile of the two estimates.',
    )
    // The old rule, that a best that was not hard set a floor instead of a threshold, no longer holds for either sport.
    expect([...lines, ...(detail ?? [])].join(' ')).not.toMatch(
      /was not hard|instead of a threshold/,
    ) // Heart rate never lowers it, and the range is never called an 80% range: it held the truth for more riders than that.
    expect([...lines, ...(detail ?? [])].join(' ')).not.toMatch(/vetoes|middle of|80%/)
  })

  it('says a run’s threshold the way a ride’s is said: each run’s strongest effort, scaled to an hour and averaged, never under an hour', () => {
    const { lines, detail } = entryNamed('Thresholds')
    expect(lines).toContain(
      'A run’s threshold is the strongest effort of each run, scaled to an hour and averaged.',
    )
    expect(lines).toContain('Neither is ever under a backed hour you did.')
    expect(detail).toContain(
      'The runs are averaged, with more weight on recent runs and on those near your top.',
    )
    // Both rules the code applies (`backedHour`): a next hour within the agreement, or under the estimate's 90th percentile.
    expect(detail).toContain(
      'An hour you ran or rode is backed when the next hour down is within 4% of it.',
    )
    expect(detail).toContain(
      'It is also backed when it is no higher than the 90th percentile of the estimate.',
    )
    expect(detail).toContain(
      'If the best hour is not backed, the second-best is tried the same way, and with neither backed there is no floor.',
    )
    expect(detail).toContain(
      'A backed hour is a floor: the answer, and the low end of its range, are never under it.',
    )
    // The old run method, a critical-speed fit with a refused-fit floor, is gone from the page.
    const copy = [...lines, ...(detail ?? [])].join(' ')
    expect(copy).not.toMatch(/critical speed|“At least”|floor, marked|short bests|second fit/)
  })

  it('says nothing about heart rate in any line about a run, and names the ride where it says what heart rate does', () => {
    const { lines, detail } = entryNamed('Thresholds')
    const all = [...lines, ...(detail ?? [])]
    const aboutRuns = all.filter((line) => /\bruns?\b|\bran\b/.test(line))
    expect(aboutRuns.length).toBeGreaterThanOrEqual(5)
    for (const line of aboutRuns) expect(line).not.toMatch(/heart rate|bpm|strap/i)
    // The summary's line on heart rate stands between the ride's line and the run's, so it names the ride: a bare "it" would
    // read as if heart rate raised a run too.
    const summaryHeartRate = lines.filter((line) => /heart rate/i.test(line))
    expect(summaryHeartRate).toEqual([
      'A ride’s threshold can be raised by heart rate and never lowered.',
    ])
    // The detail takes heart rate in the ride's block, before its first line on runs.
    const detailLines = detail ?? []
    const firstRun = detailLines.findIndex((line) => /^Each run\b/.test(line))
    expect(firstRun).toBeGreaterThan(0)
    const lastHeartRate = detailLines.findLastIndex((line) => /heart rate/i.test(line))
    expect(lastHeartRate).toBeGreaterThan(0)
    expect(lastHeartRate).toBeLessThan(firstRun)
    // Nowhere does the page say heart rate raises, lifts or sets a run.
    expect(all.join(' ')).not.toMatch(/heart rate[^.]*\bruns?\b|\bruns?\b[^.]*heart rate/i)
  })

  it('keeps the range apart from the balance’s 90% range, and says a run’s is the estimate’s own', () => {
    const threshold = entryNamed('Thresholds')
    expect(threshold.lines).toContain(
      'Each range is the estimate’s own, not the balance’s 90% range.',
    )
    expect(threshold.detail).toContain(
      'A run’s range is the estimate’s own 10th to 90th percentile.',
    )
    expect(threshold.detail).toContain(
      'The estimates were tuned on simulated athletes with a known threshold.',
    )
    expect(threshold.detail?.join(' ')).not.toMatch(/standard error|drawn lighter|calibrated/)
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
    // For now the default still passes over a window whose best 20 min was shown not hard (threshold.md, "What it replaces").
    expect(lines).toContain('Each sport also needs a 20 min best that is hard, or not checked.')
    expect(lines).toContain('If two windows tie, the shorter one is used.')
  })

  it('says in the detail that a fitness status takes the seasonal swing out, and where its size is', () => {
    const status = entryNamed('Fitness status')
    expect(status.detail).toContain(
      'A fitness status first takes your usual seasonal swing out of every steady run, when your runs show one.',
    )
    expect(status.detail).toContain('The size taken out is a row in the card’s Details.')
    // The card no longer says it, and the main page holds none of it.
    expect(status.lines.join(' ')).not.toMatch(/seasonal/)
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
