import type { CSSProperties } from 'react'
import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import type { Sport } from '@rca/core/types'
import { LEVEL_BANDS, gradeLevelText } from '../grades'
import type { SportGrade } from '../grades'
import { formatGrade } from '../gradeFormat'
import { SPORT_FORMAT } from '../sports'
import { rootFontPx } from '../charts/rootFont'
import { useSize } from '../charts/useSize'
import { aloneAlignment, namesFit } from './ladderNames'
import type { NamedBand } from './ladderNames'
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

/** Where the current level's name stands when it is named alone, by how it is held inside the bar. */
const ALONE_AT: Record<'start' | 'centre' | 'end', (at: number) => CSSProperties> = {
  start: () => ({ left: 0 }),
  centre: (at) => ({ left: `${at}%` }),
  end: () => ({ right: 0 }),
}

/** The bands as the names line reads them: each name, and its band's edges on the bar in percent. */
const NAMED: NamedBand[] = BANDS.map((band) => ({
  name: band.name,
  from: place(band.low),
  to: place(band.high),
}))

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
  const effort = 'at threshold'
  const basis = range
    ? `${effort}, range ${formatGrade(range.low.grade)} to ${formatGrade(range.high.grade)}`
    : effort
  const side = beyondScale(grade)
  const scale = `${percentText(SCALE_MIN)} to ${percentText(SCALE_MAX)} scale`
  const beyond = side === null ? '' : `, ${side} the ${scale}`
  const name = SPORT_FORMAT[sport].gradeName
  return `${name} ${formatGrade(centre.grade)}, ${gradeLevelText(grade)}, ${basis}${beyond}, on the ${ROAD_STANDARDS_SOURCE.shortName}.`
}

/** The line under the drawing when the grade lies off the scale; null when it is on it. */
function offScaleText(grade: SportGrade): string | null {
  const side = beyondScale(grade)
  if (side === null) return null
  return `${side === 'below' ? 'Below' : 'Above'} the ${percentText(SCALE_MIN)} to ${percentText(SCALE_MAX)} scale.`
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

/** The bar: a hairline with a tick at each band's edge, the one mark and any chevron. A ride's range is in its label. */
function LadderTrack({ sport, grade }: { sport: Sport; grade: SportGrade }) {
  const { centre, range } = grade
  const side = beyondScale(grade)
  const markerKind = range ? 'level-ladder__ring' : 'level-ladder__dot'
  return (
    <div className="level-ladder__track" role="img" aria-label={ladderLabel(sport, grade)}>
      {EDGES.map((edge) => (
        <span key={edge} className="level-ladder__edge" style={{ left: `${place(edge)}%` }} />
      ))}
      <span className={`level-ladder__marker ${markerKind}`} style={markerStyle(centre.grade)} />
      {side && <BeyondMark side={side} />}
    </div>
  )
}

/**
 * An age grade on the level bands, on a 30% to 100% scale: a hairline with a tick at each band's edge and one ink mark,
 * a solid dot for a run's recorded effort and a ring for a ride's estimate. The level names are one line, each under its
 * own tick, the current one in ink and the rest in the secondary ink; where they cannot all fit, only the current
 * level is named, under the mark. The names and percentages are visible text beside the drawing.
 */
export function LevelLadder({ sport, grade }: LevelLadderProps) {
  const current = gradeLevelText(grade)
  const off = offScaleText(grade)
  const [measure, width] = useSize()
  const rootPx = rootFontPx()
  // One line of names, each under its own tick, while all of them fit; else the current level alone, under the mark.
  const allFit = namesFit(NAMED, width, rootPx)
  const at = place(grade.centre.grade)
  const alone = aloneAlignment(current, at, width, rootPx)
  return (
    <figure
      ref={measure}
      className={`scale-figure level-ladder level-ladder--${sport}`}
      data-sport={sport}
    >
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
        {allFit ? (
          NAMED.map((band) => (
            <span
              key={band.name}
              className={
                band.name === current
                  ? 'level-ladder__name level-ladder__name--current'
                  : 'level-ladder__name'
              }
              style={{ left: `${band.from}%` }}
            >
              {band.name}
            </span>
          ))
        ) : (
          <span
            className={`level-ladder__name level-ladder__name--current level-ladder__name--${alone}`}
            style={ALONE_AT[alone](at)}
          >
            {current}
          </span>
        )}
      </div>
      {off !== null && <p className="level-ladder__key">{off}</p>}
    </figure>
  )
}
