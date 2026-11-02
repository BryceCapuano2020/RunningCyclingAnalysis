import { describe, expect, it } from 'vitest'
import type { BestEffort } from '@rca/core/history'
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
            [2020, 310, true, false],
            [2021, 310, true, false],
          ],
        },
      ],
      'metric',
    )!
    expect(tied.panels[0]!.best).toBe(0)
  })

  it('says whether any mark is a floor and whether any is hard, for the key', () => {
    expect(bestsModel('run', RUN_BESTS, 'metric')).toMatchObject({
      anyHollow: true,
      anySolid: true,
    })
    const allHard = bestsModel(
      'run',
      [{ length: 5000, years: [[2022, 1500, true, false]] }],
      'metric',
    )!
    expect([allHard.anyHollow, allHard.anySolid]).toEqual([false, true])
    const none = bestsModel(
      'run',
      [{ length: 5000, years: [[2022, 1500, false, false]] }],
      'metric',
    )!
    expect([none.anyHollow, none.anySolid]).toEqual([true, false])
  })
})

describe('estimated bests', () => {
  const ride = (...years: [number, number, boolean][]): BestEffort[] => [
    {
      length: 1200,
      years: years.map(([year, watts, estimated]) => [year, watts, true, estimated]),
    },
  ]

  it('never lets an estimate be the all-time best while a measured value is there', () => {
    // 2022's 320 W is a bike model's; the highest of the meter's readings is 2021's 300 W.
    const model = bestsModel(
      'ride',
      ride([2020, 290, false], [2021, 300, false], [2022, 320, true]),
      'metric',
    )!
    expect(model.panels[0]!.best).toBe(1)
    expect(model.panels[0]!.marks[2]).toMatchObject({ estimated: true, hollow: true })
  })

  it('takes the highest estimate as the best when every value is one', () => {
    const model = bestsModel('ride', ride([2020, 290, true], [2021, 310, true]), 'metric')!
    expect(model.panels[0]!.best).toBe(1)
  })

  it('draws an estimate hollow though it was a hard effort, and a floor hollow though it was measured', () => {
    const model = bestsModel('ride', ride([2020, 290, false], [2021, 300, true]), 'metric')!
    const [meter, estimate] = model.panels[0]!.marks
    expect([meter!.hollow, estimate!.hollow]).toEqual([false, true])
    expect(model).toMatchObject({ anyHollow: true, anySolid: true, hollowKey: 'Estimated' })
  })

  it('names why a mark is hollow in the key: estimated, not all-out, or both', () => {
    const both = bestsModel(
      'ride',
      [
        {
          length: 300,
          years: [
            [2020, 300, false, false],
            [2021, 310, true, true],
          ],
        },
      ],
      'metric',
    )!
    expect(both.hollowKey).toBe('Estimated or not all-out')
    expect(bestsModel('run', RUN_BESTS, 'metric')!.hollowKey).toBe('Not all-out')
  })

  it('tags an estimate in a note and last in a table cell, as the records do', () => {
    const model = bestsModel('ride', ride([2020, 290, true], [2021, 300, false]), 'metric')!
    const [estimate] = model.panels[0]!.marks
    expect(markNote(estimate!, false)).toBe('Estimated')
    expect(markNote(estimate!, true)).toBe('All-time best, Estimated')
    expect(markCell(estimate!)).toBe('290 W, estimated')
    const floor = bestsModel(
      'ride',
      [{ length: 1200, years: [[2021, 300, false, true]] }],
      'metric',
    )!
    expect(markCell(floor.panels[0]!.marks[0]!)).toBe('At least 300 W, estimated')
  })
})

describe('what a mark says', () => {
  const model = bestsModel('run', RUN_BESTS, 'imperial')!
  const [mile, fiveK] = model.panels

  it('adds the time, the all-time best and a floor to a note, and says nothing of a plain mark', () => {
    expect(markNote(fiveK!.marks[0]!, false)).toBe('25:00')
    expect(markNote(fiveK!.marks[3]!, true)).toBe('24:00, All-time best')
    expect(markNote(fiveK!.marks[1]!, false)).toBe('24:10, Not all-out')
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
