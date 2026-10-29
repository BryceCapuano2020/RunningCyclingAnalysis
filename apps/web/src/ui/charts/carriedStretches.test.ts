import { describe, expect, it } from 'vitest'
import {
  carriedNote,
  carriedSpans,
  isCarried,
  spanLabel,
  strokeSplit,
  widestSpan,
} from './carriedStretches'
import { linePath } from './paths'

const at = (x: number, y = 10) => ({ x, y })

describe('isCarried', () => {
  it('is true for a value taken from a longer window, and false for one measured over its own length', () => {
    expect(isCarried({ durationS: 1800, value: 210, windowS: 3600 })).toBe(true)
    expect(isCarried({ durationS: 1200, value: 250, windowS: 1200 })).toBe(false)
  })

  it('is false without a window, as on a curve made without digests, and for no value at all', () => {
    expect(isCarried({ durationS: 1800, value: 210 })).toBe(false)
    expect(isCarried({ durationS: 1800, value: 210, windowS: null })).toBe(false)
    expect(isCarried({ durationS: 1800, value: NaN, windowS: 3600 })).toBe(false)
  })
})

describe('carriedSpans', () => {
  it('runs from the measured point before a stretch to the measured point after it', () => {
    const carried = [false, false, true, true, false, false]
    expect(
      carriedSpans(
        carried,
        carried.map(() => true),
      ),
    ).toEqual([{ from: 1, to: 4 }])
  })

  it('finds each stretch, and none where nothing is carried', () => {
    const carried = [false, true, false, true, false]
    expect(
      carriedSpans(
        carried,
        carried.map(() => true),
      ),
    ).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 4 },
    ])
    expect(carriedSpans([false, false], [true, true])).toEqual([])
  })

  it('steps over a point with no value, which is not a measured end', () => {
    const carried = [false, true, false, false]
    const present = [true, true, false, true]
    expect(carriedSpans(carried, present)).toEqual([{ from: 0, to: 3 }])
  })

  it('starts a stretch at the curve’s own start when its first points are carried', () => {
    expect(carriedSpans([true, true, false], [true, true, true])).toEqual([{ from: 0, to: 2 }])
  })
})

describe('widestSpan', () => {
  it('is the stretch covering the widest range of durations, since the chart labels one', () => {
    const durations = [60, 300, 1200, 3600, 5400, 7200]
    const spans = [
      { from: 0, to: 1 },
      { from: 2, to: 3 },
      { from: 3, to: 5 },
    ]
    expect(widestSpan(spans, durations)).toEqual({ from: 0, to: 1 })
    expect(widestSpan([], durations)).toBeNull()
  })
})

describe('strokeSplit', () => {
  const points = [at(0), at(10), at(20), at(30), at(40)]

  it('puts a step in the light line when either end of it is carried, and the rest in the measured one', () => {
    const { measured, carried } = strokeSplit(points, [false, false, true, false, false])
    expect(linePath(measured)).toBe('M0 10L10 10M30 10L40 10')
    expect(linePath(carried)).toBe('M10 10L20 10L30 10')
  })

  it('keeps the measured line apart where it resumes after a stretch', () => {
    const { measured } = strokeSplit(points, [false, true, false, false, false])
    expect(linePath(measured)).toBe('M20 10L30 10L40 10')
  })

  it('breaks at a point with no value, as the line does', () => {
    const { measured, carried } = strokeSplit(
      [at(0), at(10), null, at(30), at(40)],
      [false, false, false, false, false],
    )
    expect(linePath(measured)).toBe('M0 10L10 10M30 10L40 10')
    expect(carried).toEqual([])
  })
})

describe('spanLabel', () => {
  it('describes the shape of the line, with the unit said once when both ends are whole minutes', () => {
    expect(spanLabel(1200, 3600)).toBe('Between 20 and 60 min the line carries your 60 min best.')
  })

  it('never says an effort is missing from the file, which a longer window always contains', () => {
    expect(spanLabel(1200, 3600)).not.toMatch(/no effort|on file/i)
  })

  it('names the effort the carried points came from, which need not be the far end of the stretch', () => {
    // The 30 and 45 minute points carry a 90 minute effort across a stretch that ends at 60 minutes.
    expect(spanLabel(1200, 3600, 5400)).toBe(
      'Between 20 and 60 min the line carries your 90 min best.',
    )
  })

  it('names each end in full when they are not both minutes', () => {
    expect(spanLabel(30, 300)).toBe('Between 30 s and 5 min the line carries your 5 min best.')
  })
})

describe('carriedNote', () => {
  it('says whose effort a carried value is, in the length records are named by', () => {
    expect(carriedNote(3600)).toBe('from your 60 min effort')
    expect(carriedNote(5400)).toBe('from your 90 min effort')
  })
})
