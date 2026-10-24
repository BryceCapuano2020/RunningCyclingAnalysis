import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import type { Sport } from '@rca/core/types'
import { HEADLINE_LABEL, LEVEL_BANDS, gradeLevelText } from '../grades'
import type { Grade, SportGrade } from '../grades'
import { formatGrade } from '../gradeFormat'
import './LevelLadder.css'

export interface LevelLadderProps {
  sport: Sport
  /**
   * A solid dot for one recorded effort; a ring over a band when a ride's grade has a model range.
   * The grade is always the headline effort's, so the drawing names that effort's duration.
   */
  grade: SportGrade
}

/** The scale runs from 30% to 100%, the span the level bands cover. */
const SCALE_MIN = 0.3
const SCALE_MAX = 1

/** The shapes are drawn on a fixed grid; the labels are HTML placed by percentage of the same span. */
const WIDTH = 320
const HEIGHT = 30
const BAR_Y = 7
const BAR_H = 16
const MID_Y = BAR_Y + BAR_H / 2
const MARK_R = 8
/**
 * The marker's outline is 2 px, centred on its edge, so half of it lies outside the circle. The
 * drawing is 320 units wide and about 320 px on a phone, so one unit of half-stroke is close enough.
 */
const MARK_STROKE_HALF = 1

/** What each sport's shape means, in words beside the drawing: the key a colour-blind reader needs. */
const KEY: Record<Sport, string> = {
  run: 'Solid dot: the grade of one recorded effort.',
  ride: 'Ring: estimated, with its range.',
}

interface Band {
  name: string
  low: number
  high: number
}

const BANDS: Band[] = LEVEL_BANDS.map((band, index) => ({
  name: band.name,
  low: Math.max(band.min, SCALE_MIN),
  high: LEVEL_BANDS[index + 1]?.min ?? SCALE_MAX,
}))

/** The boundaries between bands, drawn as edges on the bar. The scale's ends are the bar's ends. */
const EDGES = BANDS.filter((band) => band.low > SCALE_MIN).map((band) => band.low)

/**
 * The percentages written on the scale: its start and each boundary. The top of the scale is the
 * bar's end, and its label would crowd the 90% boundary label on a 320 px screen.
 */
const SCALE_TICKS = [SCALE_MIN, ...EDGES]

/** A grade's place along the scale, in percent of its width, held at the ends. */
function place(grade: number): number {
  const clamped = Math.min(Math.max(grade, SCALE_MIN), SCALE_MAX)
  return ((clamped - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100
}

/** A grade's place in the drawing's own units, for the shapes. */
function x(grade: number): number {
  return (place(grade) / 100) * WIDTH
}

/**
 * The marker's centre: the grade's place, kept so the whole marker, outline included, stays inside
 * the track, so an off-scale dot sits at the end of the bar and not over its edge.
 */
function markerX(grade: number): number {
  const reach = MARK_R + MARK_STROKE_HALF
  return Math.min(Math.max(x(grade), reach), WIDTH - reach)
}

function percentText(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** The scale's first label starts at the bar's left end, so it does not run off the figure. */
function tickAlignment(index: number): 'start' | 'middle' {
  return index === 0 ? 'start' : 'middle'
}

/** Where a grade sits against the scale: below it, above it, or within it (null). */
function beyondScale(grade: SportGrade): 'below' | 'above' | null {
  const { centre, range } = grade
  const lowest = Math.min(centre.grade, range?.low.grade ?? centre.grade)
  const highest = Math.max(centre.grade, range?.high.grade ?? centre.grade)
  if (lowest < SCALE_MIN) return 'below'
  if (highest > SCALE_MAX) return 'above'
  return null
}

/** What a screen reader hears: the grade, its level, its range or single activity, and the scale. */
function ladderLabel(sport: Sport, grade: SportGrade): string {
  const { centre, range } = grade
  const effort = `from your best ${HEADLINE_LABEL}`
  const basis = range
    ? `${effort}, range ${formatGrade(range.low.grade)} to ${formatGrade(range.high.grade)}`
    : effort
  const side = beyondScale(grade)
  const scale = `${percentText(SCALE_MIN)} to ${percentText(SCALE_MAX)} scale`
  const beyond = side === null ? '' : `, ${side} the ${scale}`
  const name = sport === 'ride' ? 'Estimated age grade' : 'Age grade'
  return `${name} ${formatGrade(centre.grade)}, ${gradeLevelText(grade)}, ${basis}${beyond}, on the ${ROAD_STANDARDS_SOURCE.shortName}.`
}

/** The key under the drawing: what its shape means, and whether the grade lies off the scale. */
function keyText(sport: Sport, grade: SportGrade): string {
  const side = beyondScale(grade)
  const scale = `${percentText(SCALE_MIN)} to ${percentText(SCALE_MAX)} scale`
  const beyond = side === null ? '' : ` ${side === 'below' ? 'Below' : 'Above'} the ${scale}.`
  return `${KEY[sport]}${beyond}`
}

/**
 * The bands the grade falls in: the band of its centre, or every band from the range's low end to
 * its high end when a ride's range crosses an edge. Each is filled and named in bold.
 */
function currentBands(grade: SportGrade): Set<string> {
  const names = BANDS.map((band) => band.name)
  const levels = [grade.centre, grade.range?.low, grade.range?.high]
  const indexes = levels
    .flatMap((level) => (level ? [names.indexOf(level.level)] : []))
    .filter((index) => index >= 0)
  const first = Math.min(...indexes)
  const last = Math.max(...indexes)
  return new Set(names.filter((_, index) => index >= first && index <= last))
}

/** The range as a band over the bar, outlined so it stands out from the bar. */
function RangeBand({ range }: { range: { low: Grade; high: Grade } }) {
  const left = x(range.low.grade)
  return (
    <rect
      className="level-ladder__range"
      x={left}
      y={BAR_Y}
      width={Math.max(2, x(range.high.grade) - left)}
      height={BAR_H}
    />
  )
}

/**
 * An age grade on the level bands, on a 30% to 100% scale. A run is read as recorded: a solid dot.
 * A ride is estimated: a ring over a band for its model range. The band the grade falls in is filled
 * and its name is bold, and the names, percentages and key are visible text beside the drawing.
 */
export function LevelLadder({ sport, grade }: LevelLadderProps) {
  const { centre, range } = grade
  const current = currentBands(grade)
  return (
    <figure className={`level-ladder level-ladder--${sport}`}>
      <div className="level-ladder__scale" aria-hidden="true">
        {SCALE_TICKS.map((tick, index) => (
          <span
            key={tick}
            className={`level-ladder__pct level-ladder__pct--${tickAlignment(index)}`}
            style={{ left: `${place(tick)}%` }}
          >
            {percentText(tick)}
          </span>
        ))}
      </div>
      <svg
        className="level-ladder__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={ladderLabel(sport, grade)}
      >
        <rect className="level-ladder__track" x="0" y={BAR_Y} width={WIDTH} height={BAR_H} rx="8" />
        {BANDS.map((band) => (
          <rect
            key={band.name}
            className={
              current.has(band.name)
                ? 'level-ladder__band level-ladder__band--current'
                : 'level-ladder__band'
            }
            x={x(band.low)}
            y={BAR_Y}
            width={x(band.high) - x(band.low)}
            height={BAR_H}
          />
        ))}
        {range && <RangeBand range={range} />}
        {/* Drawn after the range, so the edges stay visible inside a ride's band. */}
        {EDGES.map((edge) => (
          <line
            key={edge}
            className="level-ladder__edge"
            x1={x(edge)}
            x2={x(edge)}
            y1={BAR_Y - 3}
            y2={BAR_Y + BAR_H + 3}
          />
        ))}
        {range ? (
          <circle className="level-ladder__ring" cx={markerX(centre.grade)} cy={MID_Y} r={MARK_R} />
        ) : (
          <circle className="level-ladder__dot" cx={markerX(centre.grade)} cy={MID_Y} r={MARK_R} />
        )}
      </svg>
      <div className="level-ladder__names" aria-hidden="true">
        {BANDS.map((band, index) => (
          <span
            key={band.name}
            className={`level-ladder__name level-ladder__name--${index % 2 === 0 ? 'top' : 'bottom'}${current.has(band.name) ? ' level-ladder__name--current' : ''}`}
            style={{ left: `${(place(band.low) + place(band.high)) / 2}%` }}
          >
            {band.name}
          </span>
        ))}
      </div>
      <figcaption className="level-ladder__key">{keyText(sport, grade)}</figcaption>
    </figure>
  )
}
