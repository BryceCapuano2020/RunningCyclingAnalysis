import type { CSSProperties } from 'react'
import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import type { Sport } from '@rca/core/types'
import { HEADLINE_LABEL, LEVEL_BANDS, gradeLevelText } from '../grades'
import type { SportGrade } from '../grades'
import { formatGrade } from '../gradeFormat'
import { SPORT_FORMAT } from '../sports'
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

/** What each sport's shape means, in words beside the drawing: the key a colour-blind reader needs. */
const KEY: Record<Sport, string> = {
  run: 'Solid dot: the grade of one recorded effort.',
  ride: 'Ring: estimated, with its 90% range in brackets.',
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

/** A grade's place along the scale, in percent of the bar's width, held at the ends. */
function place(grade: number): number {
  const clamped = Math.min(Math.max(grade, SCALE_MIN), SCALE_MAX)
  return ((clamped - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100
}

/** A shape on the bar from one grade to another: its left edge and its width, both in percent. */
function spanStyle(from: number, to: number): CSSProperties {
  return { left: `${place(from)}%`, width: `${place(to) - place(from)}%` }
}

/**
 * The marker's centre, handed to the stylesheet as a custom property. The stylesheet holds the whole
 * marker inside the track, so a grade past either end sits at that end of the bar, not over its edge.
 */
function markerStyle(grade: number): CSSProperties {
  return { ['--at' as string]: `${place(grade)}%` }
}

function percentText(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** The scale's first label starts at the bar's left end, so it does not run off the figure. */
function tickAlignment(index: number): 'start' | 'middle' {
  return index === 0 ? 'start' : 'middle'
}

/**
 * The lowest and the highest band's names sit centred on narrow bands near the ends of the figure, so at a large
 * text size they would run past it: they are anchored to its edge instead.
 */
function nameEnd(index: number): string {
  if (index === 0) return ' level-ladder__name--first'
  return index === BANDS.length - 1 ? ' level-ladder__name--last' : ''
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
  const effort = `on your best ${HEADLINE_LABEL}`
  const basis = range
    ? `${effort}, range ${formatGrade(range.low.grade)} to ${formatGrade(range.high.grade)}`
    : effort
  const side = beyondScale(grade)
  const scale = `${percentText(SCALE_MIN)} to ${percentText(SCALE_MAX)} scale`
  const beyond = side === null ? '' : `, ${side} the ${scale}`
  const name = SPORT_FORMAT[sport].gradeName
  const level = gradeLevelText(grade)
  const named = level === null ? '' : `, ${level}`
  return `${name} ${formatGrade(centre.grade)}${named}, ${basis}${beyond}, on the ${ROAD_STANDARDS_SOURCE.shortName}.`
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

/**
 * A chevron just outside the bar end a grade lies past, pointing out past it. It sits beside the bar
 * rather than on the marker, so a grade whose centre is on the scale still reads cleanly.
 */
function BeyondMark({ side }: { side: 'below' | 'above' }) {
  const d = side === 'below' ? 'M6 0 L0 6 L6 12' : 'M0 0 L6 6 L0 12'
  return (
    <svg
      className={`level-ladder__beyond level-ladder__beyond--${side}`}
      data-side={side}
      viewBox="0 0 6 12"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

/** The bar: the bands and the range clipped to its rounded ends, the edges, the marker and any chevron. */
function LadderTrack({ sport, grade }: { sport: Sport; grade: SportGrade }) {
  const { centre, range } = grade
  const current = currentBands(grade)
  const side = beyondScale(grade)
  const markerKind = range ? 'level-ladder__ring' : 'level-ladder__dot'
  return (
    <div className="level-ladder__track" role="img" aria-label={ladderLabel(sport, grade)}>
      <div className="level-ladder__fill">
        {BANDS.map((band) => (
          <span
            key={band.name}
            className={`level-ladder__band level-ladder__band--${BANDS.indexOf(band) + 1}${current.has(band.name) ? ' level-ladder__band--current' : ''}`}
            style={spanStyle(band.low, band.high)}
          />
        ))}
        {range && (
          <span
            className="level-ladder__range"
            style={spanStyle(range.low.grade, range.high.grade)}
          />
        )}
      </div>
      {/* Drawn after the range, so the edges stay visible inside a ride's band. */}
      {EDGES.map((edge) => (
        <span key={edge} className="level-ladder__edge" style={{ left: `${place(edge)}%` }} />
      ))}
      <span className={`level-ladder__marker ${markerKind}`} style={markerStyle(centre.grade)} />
      {side && <BeyondMark side={side} />}
    </div>
  )
}

/**
 * An age grade on the level bands, on a 30% to 100% scale. A run is read as recorded: a solid dot.
 * A ride is estimated: a ring over a band for its model range. The band the grade falls in is filled
 * and its name is bold, and the names, percentages and key are visible text beside the drawing.
 */
export function LevelLadder({ sport, grade }: LevelLadderProps) {
  const current = currentBands(grade)
  return (
    <figure className={`scale-figure level-ladder level-ladder--${sport}`} data-sport={sport}>
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
      <LadderTrack sport={sport} grade={grade} />
      <div className="level-ladder__names" aria-hidden="true">
        {BANDS.map((band, index) => (
          <span
            key={band.name}
            className={`level-ladder__name level-ladder__name--${index % 2 === 0 ? 'top' : 'bottom'}${current.has(band.name) ? ' level-ladder__name--current' : ''}${nameEnd(index)}`}
            style={
              nameEnd(index) === ''
                ? { left: `${(place(band.low) + place(band.high)) / 2}%` }
                : undefined
            }
          >
            {band.name}
          </span>
        ))}
      </div>
      <p className="level-ladder__key">{keyText(sport, grade)}</p>
    </figure>
  )
}
