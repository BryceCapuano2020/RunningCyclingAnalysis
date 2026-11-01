import { describe, expect, it } from 'vitest'
import type { Grade, SportGrade } from '../grades'
import { directLabels } from './gradeProfileLayout'
import type { ProfileRow, SportMarks } from './gradeProfileLayout'

const MIN = 60
const grade = (fraction: number): Grade => ({ grade: fraction, level: 'Local' })
const run = (fraction: number): SportGrade => ({ centre: grade(fraction), range: null })
const ride = (fraction: number): SportGrade => ({
  centre: grade(fraction),
  range: { low: grade(fraction - 0.06), high: grade(fraction + 0.05) },
})

const ROWS: ProfileRow[] = [
  { durationS: 10 * MIN, grades: { run: run(0.62), ride: ride(0.58) } },
  { durationS: 20 * MIN, grades: { run: run(0.64), ride: ride(0.58) } },
  { durationS: 30 * MIN, grades: { run: run(0.55), ride: ride(0.5) } },
]

function marks(runY: number, rideY: number, x = 200): SportMarks[] {
  const at = (y: number) => [null, { x, y }, null]
  return [
    { sport: 'run', ranged: false, centre: at(runY), low: [], high: [] },
    { sport: 'ride', ranged: true, centre: at(rideY), low: [], high: [] },
  ]
}

describe('directLabels', () => {
  it('names each sport’s grade at 20 min, and the ride’s range under its label', () => {
    const [first, second] = directLabels(ROWS, marks(80, 140), 600)
    expect(first).toMatchObject({ sport: 'run', text: 'Run 64%', range: null })
    expect(second).toMatchObject({ sport: 'ride', text: 'Ride 58%', range: 'range 52 to 63' })
  })

  it('puts the higher sport’s label above and right of its point, and the lower one below and left', () => {
    const [run, ride] = directLabels(ROWS, marks(80, 140), 600)
    expect(run).toMatchObject({ anchor: 'start', below: false })
    expect(run!.x).toBeGreaterThan(200)
    expect(run!.y).toBeLessThan(80)
    expect(ride).toMatchObject({ anchor: 'end', below: true })
    expect(ride!.x).toBeLessThan(200)
    expect(ride!.y).toBeGreaterThan(140)
  })

  it('swaps the sides when the ride is the higher on the plot, so the two never meet', () => {
    const [run, ride] = directLabels(ROWS, marks(140, 80), 600)
    expect(ride).toMatchObject({ anchor: 'start', below: false })
    expect(run).toMatchObject({ anchor: 'end', below: true })
  })

  it('turns the upper label to run leftward from a point near the plot’s right edge', () => {
    const [run] = directLabels(ROWS, marks(80, 140, 560), 600)
    expect(run).toMatchObject({ anchor: 'end' })
  })

  it('labels a lone sport above its point', () => {
    const only = [marks(80, 140)[0]!]
    const labels = directLabels(ROWS, only, 600)
    expect(labels).toHaveLength(1)
    expect(labels[0]).toMatchObject({ sport: 'run', below: false })
  })

  it('has no labels when 20 min is not among the durations', () => {
    expect(directLabels([ROWS[0]!, ROWS[2]!], marks(80, 140), 600)).toEqual([])
  })
})
