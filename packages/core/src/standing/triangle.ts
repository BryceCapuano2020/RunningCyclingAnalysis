import { gradePercent, levelOf } from '../grade'
import type { SportGrade } from '../grade'
import { wholePercent } from './lead'

/**
 * The sports on the level triangle, in the order their axes sit: run at the top, cycling at the lower right and lifting at the
 * lower left, which is the rail's order read clockwise. Lifting is here before it has a grade, so a corner exists for it.
 */
export const TRIANGLE_SPORTS = ['run', 'ride', 'lift'] as const
export type TriangleSport = (typeof TRIANGLE_SPORTS)[number]

/** A corner's grade as the figure reads it: graded with its centre and range, or no grade (the page says why). */
export type TriangleGrade = { kind: 'graded'; grade: SportGrade } | { kind: 'gap' }

export type TriangleGrades = Record<TriangleSport, TriangleGrade>

/** Every corner without a grade, the state before any sport is graded. */
export const NO_TRIANGLE_GRADES: TriangleGrades = {
  run: { kind: 'gap' },
  ride: { kind: 'gap' },
  lift: { kind: 'gap' },
}

export interface Point {
  x: number
  y: number
}

/** One corner: where its axis ends, and what is drawn on it. A corner with no grade has a cap and no dot. */
export interface TriangleCorner {
  /** The axis's outer end, where the corner's label hangs. */
  tip: Point
  /** The grade's centre as a whole percent, floored as every surface shows it; null without a grade. */
  percent: number | null
  /** The level of the unrounded centre, the word the sport pages print beside the same percent. */
  level: string | null
  /** The 90% range as whole percents; null for a grade with none (a recorded effort is a dot). */
  range: { low: number; high: number } | null
  /** The best estimate, on the axis. */
  dot: Point | null
  /** The range's two ends, along the axis. */
  band: [Point, Point] | null
  /** The short mark across the end of an axis that has no grade, in place of a dot. */
  cap: [Point, Point] | null
}

/** A hairline triangle at one grade, such as the 80% ring; `top` is where it crosses the run axis, where its number sits. */
export interface TriangleRing {
  percent: number
  points: Point[]
  top: Point
}

export interface TriangleGeometry {
  centre: Point
  radius: number
  corners: Record<TriangleSport, TriangleCorner>
  /** The outer triangle and the inner ones, outermost first. */
  rings: TriangleRing[]
  /** The shape through the dots: closed with all three, an open line with two, nothing with fewer. */
  shape: { points: Point[]; closed: boolean }
}

/** The plot is drawn in a square of this many units; every length below is a share of it. */
const BASE = 300
const CENTRE_Y = 175 / BASE
const RADIUS = 118 / BASE
/** The rings inside the outer triangle: the lower edges of National and Local. The outer one is 100%. */
const RING_PERCENTS = [100, 80, 60] as const
/** The half length of the cap on an axis with no grade. */
const CAP_HALF = 6 / BASE
/** The angle of each axis in degrees, clockwise from the right, so up is -90. */
const ANGLE: Record<TriangleSport, number> = { run: -90, ride: 30, lift: 150 }

/**
 * The figure's geometry in a square of `size` units: a point on an axis at a percent of its length, 0 at the centre and 100 at the
 * corner. The SVG and the share canvas both read this, so they cannot drift. Pure: the grades in, points out.
 */
export function triangleGeometry(grades: TriangleGrades, size: number): TriangleGeometry {
  const centre = { x: size / 2, y: size * CENTRE_Y }
  const radius = size * RADIUS
  const at = (sport: TriangleSport, percent: number): Point => {
    const angle = (ANGLE[sport] * Math.PI) / 180
    const length = (percent / 100) * radius
    return { x: centre.x + length * Math.cos(angle), y: centre.y + length * Math.sin(angle) }
  }
  const place = (sport: TriangleSport, grade: number): Point =>
    at(sport, Math.min(100, gradePercent(grade) ?? 0))
  const corners = Object.fromEntries(
    TRIANGLE_SPORTS.map((sport): [TriangleSport, TriangleCorner] => {
      const tip = at(sport, 100)
      const outcome = grades[sport]
      if (outcome.kind === 'gap') {
        const across = ((ANGLE[sport] + 90) * Math.PI) / 180
        const half = size * CAP_HALF
        const cap: [Point, Point] = [
          { x: tip.x - half * Math.cos(across), y: tip.y - half * Math.sin(across) },
          { x: tip.x + half * Math.cos(across), y: tip.y + half * Math.sin(across) },
        ]
        return [sport, { tip, percent: null, level: null, range: null, dot: null, band: null, cap }]
      }
      const { centre: middle, range } = outcome.grade
      return [
        sport,
        {
          tip,
          percent: wholePercent(middle.grade),
          level: levelOf(middle.grade),
          range:
            range === null
              ? null
              : { low: wholePercent(range.low.grade), high: wholePercent(range.high.grade) },
          dot: place(sport, middle.grade),
          band:
            range === null ? null : [place(sport, range.low.grade), place(sport, range.high.grade)],
          cap: null,
        },
      ]
    }),
  ) as Record<TriangleSport, TriangleCorner>
  const dots = TRIANGLE_SPORTS.flatMap((sport) => corners[sport].dot ?? [])
  return {
    centre,
    radius,
    corners,
    rings: RING_PERCENTS.map((percent) => ({
      percent,
      points: TRIANGLE_SPORTS.map((sport) => at(sport, percent)),
      top: at('run', percent),
    })),
    shape: { points: dots.length >= 2 ? dots : [], closed: dots.length === 3 },
  }
}
