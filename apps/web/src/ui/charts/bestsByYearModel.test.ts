import { describe, expect, it } from 'vitest'
import { RIDE_BESTS, RUN_BESTS } from '../historyBestsFixtures'
import { bestsModel, bestsNote, markCell, markNote } from './bestsByYearModel'

describe('bestsModel', () => {
  it('is a panel for each length, on one run of years that keeps a year with no best as an empty room', () => {
    const model = bestsModel('run', RUN_BESTS, 'imperial')!
    expect(model.years).toEqual([2021, 2022, 2023, 2024])
    expect(model.panels.map((panel) => panel.label)).toEqual(['Mile', '5 km', '10 km'])
    const fiveK = model.panels[1]!
    expect(fiveK.marks.map((mark) => mark?.year ?? null)).toEqual([2021, 2022, null, 2024])
  })

  it('has no model without a best', () => {
    expect(bestsModel('run', [], 'metric')).toBeNull()
    expect(bestsModel('ride', [{ length: 300, years: [] }], 'metric')).toBeNull()
  })

  it('reads a run as pace in the units setting, with the time where the pace is not the time', () => {
    const imperial = bestsModel('run', RUN_BESTS, 'imperial')!
    const [mile, fiveK] = imperial.panels
    // 400 s over a mile is 6:40 /mi, and that is the time too.
    expect(mile!.marks[0]).toMatchObject({ text: '6:40 /mi', time: null, plotted: 400 })
    // 1500 s over 5 km is 8:03 /mi, and the clock reads 25:00.
    expect(fiveK!.marks[0]).toMatchObject({ text: '8:03 /mi', time: '25:00' })
    const metric = bestsModel('run', RUN_BESTS, 'metric')!
    expect(metric.panels[1]!.marks[0]).toMatchObject({ text: '5:00 /km', time: '25:00' })
    // The mile's pace per kilometre is not its time.
    expect(metric.panels[0]!.marks[0]).toMatchObject({ text: '4:09 /km', time: '6:40' })
  })

  it('reads a ride as watts, labelled by its duration', () => {
    const model = bestsModel('ride', RIDE_BESTS, 'metric')!
    expect(model.panels.map((panel) => panel.label)).toEqual(['5 min', '20 min'])
    expect(model.panels[0]!.marks[0]).toMatchObject({ text: '300 W', plotted: 300, time: null })
  })

  it('picks the all-time best as the fastest or highest, the earliest year where two tie', () => {
    const model = bestsModel('run', RUN_BESTS, 'metric')!
    // The mile's least time is 2022's 380 s; the 5 km's is 2024's 1440 s.
    expect(model.panels.map((panel) => panel.best)).toEqual([1, 3, 1])
    const tied = bestsModel(
      'ride',
      [
        {
          length: 300,
          years: [
            [2020, 310, true],
            [2021, 310, true],
          ],
        },
      ],
      'metric',
    )!
    expect(tied.panels[0]!.best).toBe(0)
  })

  it('says whether any mark is a floor and whether any is hard, for the key', () => {
    expect(bestsModel('run', RUN_BESTS, 'metric')).toMatchObject({ anyFloor: true, anyHard: true })
    const allHard = bestsModel('run', [{ length: 5000, years: [[2022, 1500, true]] }], 'metric')!
    expect([allHard.anyFloor, allHard.anyHard]).toEqual([false, true])
    const none = bestsModel('run', [{ length: 5000, years: [[2022, 1500, false]] }], 'metric')!
    expect([none.anyFloor, none.anyHard]).toEqual([true, false])
  })
})

describe('what a mark says', () => {
  const model = bestsModel('run', RUN_BESTS, 'imperial')!
  const [mile, fiveK] = model.panels

  it('adds the time, the all-time best and a floor to a note, and says nothing of a plain mark', () => {
    expect(markNote(fiveK!.marks[0]!, false)).toBe('25:00')
    expect(markNote(fiveK!.marks[3]!, true)).toBe('24:00, All-time best')
    expect(markNote(fiveK!.marks[1]!, false)).toBe('24:10, Not confirmed hard')
    expect(markNote(mile!.marks[0]!, false)).toBeUndefined()
  })

  it('is a table cell that starts with at least for a floor, and says none for a year with no best', () => {
    expect(markCell(fiveK!.marks[0]!)).toBe('8:03 /mi')
    expect(markCell(fiveK!.marks[1]!)).toBe('At least 7:47 /mi')
    expect(markCell(fiveK!.marks[2]!)).toBe('None')
  })

  it('names the unit and which way is better under the title', () => {
    expect(bestsNote('run', 'imperial')).toBe('Pace (/mi), faster up')
    expect(bestsNote('run', 'metric')).toBe('Pace (/km), faster up')
    expect(bestsNote('ride', 'metric')).toBe('Power (W)')
  })
})
