import { describe, expect, it } from 'vitest'
import { balanceLead, triangleReading } from '@rca/core/standing'
import type { Grade } from '@rca/core/grade'
import type { TriangleGrade, TriangleGrades } from '@rca/core/standing'
import { wholeCentre } from '../../domain/lean'
import { gapReading } from '../components/balanceScale'
import { balanceTitle, readFrom } from '../components/headlineText'
import { plural } from '../components/plural'
import { SPORT_TITLE } from '../sports'
import { triangleViewOf } from '../triangleSports'
import { triangleLine, triangleRows, triangleTitle, triangleTitleText } from './triangleCopy'

const at = (percent: number): Grade => ({ grade: (percent + 0.04) / 100, level: 'x' })
const graded = (percent: number, spread = 0): TriangleGrade => ({
  kind: 'graded',
  grade: {
    centre: at(percent),
    range: spread === 0 ? null : { low: at(percent - spread), high: at(percent + spread) },
  },
})
const gap: TriangleGrade = { kind: 'gap' }
const three = (run: TriangleGrade, ride: TriangleGrade, lift: TriangleGrade): TriangleGrades => ({
  run,
  ride,
  lift,
})
const textOf = (grades: TriangleGrades) => {
  const reading = triangleReading(grades)
  const title = triangleTitle(reading)
  return { title: title === null ? null : triangleTitleText(title), line: triangleLine(reading) }
}

/** The headline and line the page wrote for two graded sports before the triangle, from its own pieces. */
function todaysText(run: number, ride: number) {
  const view = triangleViewOf({
    run: { kind: 'graded', age: 40, grade: { centre: at(run), range: null } },
    ride: { kind: 'graded', age: 40, grade: { centre: at(ride), range: null } },
  })
  const [one, other] = [view.grades.run, view.grades.ride]
  if (one.kind !== 'graded' || other.kind !== 'graded') throw new Error('graded')
  const reading = gapReading(balanceLead(one.grade, other.grade))
  const centre = wholeCentre(reading.lead)
  const line =
    centre === 0
      ? 'Running and cycling grade the same at threshold.'
      : `${SPORT_TITLE[readFrom(reading)]} grades ${plural(Math.abs(centre), 'point')} higher at threshold.`
  return { title: balanceTitle(reading), line }
}

describe('with run and ride graded the headline and line are the page’s own, to the character', () => {
  it('matches today across every pair of grades from 30% to 90%', () => {
    for (let run = 30; run <= 90; run += 1) {
      for (let ride = 30; ride <= 90; ride += 1) {
        const now = textOf(three(graded(run), graded(ride), gap))
        expect(now).toEqual(todaysText(run, ride))
      }
    }
  })

  it('states the examples a runner and a rider read', () => {
    expect(textOf(three(graded(61), graded(52), gap))).toEqual({
      title: 'Your balance leans toward running',
      line: 'Running grades 9 points higher at threshold.',
    })
    expect(textOf(three(graded(50), graded(60), gap)).title).toBe(
      'Your balance leans toward cycling',
    )
    expect(textOf(three(graded(60), graded(60), gap))).toEqual({
      title: 'Your running and cycling are in balance',
      line: 'Running and cycling grade the same at threshold.',
    })
  })
})

describe('with three graded sports', () => {
  it('leans toward the highest and states it over the lowest', () => {
    expect(textOf(three(graded(61), graded(52), graded(48)))).toEqual({
      title: 'Your balance leans toward running',
      line: 'Running grades 13 points higher than lifting.',
    })
  })

  it('leans toward two sports within the even rule of each other', () => {
    expect(textOf(three(graded(61), graded(60), graded(48)))).toEqual({
      title: 'Your balance leans toward running and cycling',
      line: 'Running grades 13 points higher than lifting.',
    })
  })

  it('is in balance when all three are within the rule, and says how near', () => {
    expect(textOf(three(graded(60), graded(59), graded(58)))).toEqual({
      title: 'Your running, cycling and lifting are in balance',
      line: 'The three sit within 2 points of each other.',
    })
    expect(textOf(three(graded(60), graded(60), graded(60))).line).toBe('The three grade the same.')
  })

  it('names the sports in the headline in order, for the page to underline', () => {
    const title = triangleTitle(triangleReading(three(graded(61), graded(60), graded(48))))
    expect(title).toEqual({ lead: 'Your balance leans toward ', sports: ['run', 'ride'] })
  })

  it('never says ahead of, weakest or a cause', () => {
    const { title, line } = textOf(three(graded(80), graded(40), graded(30)))
    expect(`${title} ${line}`).not.toMatch(/ahead|weak|limit|holding|because|caused/i)
  })
})

describe('with fewer than two graded', () => {
  it('has no headline or line of its own', () => {
    expect(textOf(three(graded(60), gap, gap))).toEqual({ title: null, line: null })
    expect(textOf(three(gap, gap, gap))).toEqual({ title: null, line: null })
  })
})

describe('triangleRows', () => {
  it('states each range once, and the gap with its range', () => {
    const rows = triangleRows({
      grades: three(graded(61, 6), graded(52, 6), graded(48, 6)),
      notes: {},
    })
    expect(rows).toEqual([
      { label: 'Range, 90%', value: 'running 55 to 67, cycling 46 to 58, lifting 42 to 54' },
      { label: 'Gap', value: 'running over lifting 13 points, range 5 to 21' },
    ])
  })

  it('signs a gap range that reaches zero, from the side of the higher sport', () => {
    const [, row] = triangleRows({ grades: three(graded(52, 8), graded(50, 8), gap), notes: {} })
    expect(row?.value).toBe('running over cycling 2 points, range −9 to +13')
    const [, flipped] = triangleRows({
      grades: three(graded(50, 8), graded(52, 8), gap),
      notes: {},
    })
    expect(flipped?.value).toBe('cycling over running 2 points, range −9 to +13')
  })

  it('has no rows when no sport has a range', () => {
    expect(triangleRows({ grades: three(graded(61), graded(52), gap), notes: {} })).toEqual([])
  })

  it('has the range of one graded sport and no gap', () => {
    expect(triangleRows({ grades: three(graded(61, 6), gap, gap), notes: {} })).toEqual([
      { label: 'Range, 90%', value: 'running 55 to 67' },
    ])
  })
})
