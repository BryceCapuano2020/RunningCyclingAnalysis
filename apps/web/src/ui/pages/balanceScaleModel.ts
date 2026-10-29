import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { readFrom, rangeText } from '../components/headlineText'
import type { BalanceReading } from '../components/balanceScale'
import { plural } from '../components/plural'
import { wholeCentre } from '../../domain/lean'
import type { LevelTarget } from '../levelTarget'
import { gradeLevelText, HEADLINE_LABEL } from '../grades'
import type { GradeOutcome, SportGrade } from '../grades'
import { wholeGrade } from '../gradeFormat'
import { headlineEffort, sportRecords } from '../records'
import { SPORT_LABEL, SPORT_NOUN, SPORT_ORDER, SPORT_TITLE } from '../sports'

/** One sport's mark on the level scale, in whole percent, with every string the drawing prints for it. */
export interface ScaleLane {
  sport: Sport
  /** The grade the dot or ring sits at. */
  centre: number
  /** The ends of an estimate's 90% range; both null for a recorded grade, which has no range. */
  low: number | null
  high: number | null
  /** The level name, or the two a range crosses: "Local", "Recreational to Local". */
  level: string
  /** "recorded" for a dot, "estimated" for a ring and its band. */
  basis: 'recorded' | 'estimated'
  /** The best effort's own figure the grade rests on, "6:37 /mi" or "246 W"; null without one. */
  effort: string | null
  /** The grade as printed large: "64%". */
  pct: string
  /** The line under it: the level and the figure it rests on, "Local · 6:37 /mi on your best 20 min". */
  sub: string
  /** The same without the effort's name, for a narrow plot, which says it once in the heading. */
  subShort: string
  /** The range's two ends, printed under the band: "52" and "63%". */
  rangeLow: string | null
  rangeHigh: string | null
}

/** The gap between the two marks and the words that label its bracket. */
export interface ScaleGap {
  /** "6 pts", set large beside the bracket. */
  figure: string
  /** The direction and the 90% range: "toward running · 90% range 1 to 12 points". */
  note: string
  /** The range alone, for a narrow plot. */
  noteShort: string
  /** The range's two ends alone, for a plot too narrow for the unit: "range 1 to 12". */
  noteTiny: string
}

/** The level target as a ghost ring: the lane it sits in, the grade it sits at, and its two lines. */
export interface ScaleTarget {
  sport: Sport
  at: number
  eyebrow: string
  line: string
  /** The whole sentence, as the page words it, for the drawing's description and its table twin. */
  sentence: string
}

/** Everything the level scale draws and says. */
export interface ScaleModel {
  /** Both sports' lanes, or the one graded sport's alone while the other has no activities to compare. */
  lanes: ScaleLane[]
  /** The gap between the two lanes; null for a lone lane, which has no other sport to differ from. */
  gap: ScaleGap | null
  target: ScaleTarget | null
  /** What a screen reader hears for the drawing. */
  description: string
  /** The table twin's rows: sport, basis, grade, level, figure, range. */
  rows: string[][]
}

export const SCALE_TABLE_COLUMNS = ['Sport', 'Basis', 'Age grade', 'Level', 'Best 20 min', 'Range']

const NO_BREAK = ' '

/**
 * A sport's best effort at the headline duration as the grade line names it: "6:37 /mi", or "246 W (estimated)" for
 * a ride whose watts no power meter measured. Null when it has none.
 */
function effortFigure(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): string | null {
  const text = headlineEffort(sport, sportRecords(result, sport, massKg, units))
  return text === null ? null : text.replace(', estimated', ' (estimated)')
}

function laneOf(sport: Sport, grade: SportGrade, effort: string | null): ScaleLane {
  const { centre, range } = grade
  const level = gradeLevelText(grade)
  const pct = `${wholeGrade(centre.grade)}%`
  return {
    sport,
    centre: wholeGrade(centre.grade),
    low: range === null ? null : wholeGrade(range.low.grade),
    high: range === null ? null : wholeGrade(range.high.grade),
    level,
    basis: range === null ? 'recorded' : 'estimated',
    pct,
    effort,
    sub: `${effort === null ? level : `${level} · ${effort}`} on your best ${HEADLINE_LABEL}`,
    subShort: effort === null ? level : `${level} ·${NO_BREAK}${effort}`,
    rangeLow: range === null ? null : String(wholeGrade(range.low.grade)),
    rangeHigh: range === null ? null : `${wholeGrade(range.high.grade)}%`,
  }
}

/** The lead's side and size as the bracket labels it: "6 pts", toward the sport the estimate favours. */
function gapOf(reading: BalanceReading): ScaleGap {
  const size = Math.abs(wholeCentre(reading.lead))
  const side = size === 0 ? 'same grade' : `toward ${SPORT_NOUN[readFrom(reading)]}`
  const range = `range ${rangeText(reading)}`
  return {
    figure: plural(size, 'pt'),
    note: `${side} · 90% ${range}`,
    noteShort: range,
    noteTiny: range.replace(/\u00a0?points$/, ''),
  }
}

function targetOf(target: LevelTarget, lanes: ScaleLane[]): ScaleTarget | null {
  const leader = lanes.find((lane) => lane.sport === target.higher)
  if (leader === undefined) return null
  const range = target.range === null ? '' : ` (${target.range})`
  return {
    sport: target.lower,
    at: leader.centre,
    eyebrow: `To level with ${SPORT_NOUN[target.higher]}`,
    line: `about ${target.centre}${range} · now ${target.now}`,
    sentence: target.sentence,
  }
}

/** The words a screen reader hears for one lane. */
function spoken(lane: ScaleLane): string {
  const range = lane.low === null ? '' : `, range ${lane.low} to ${lane.high} percent`
  return `${SPORT_LABEL[lane.sport]} ${lane.centre} percent, ${lane.level}, ${lane.basis}${range}.`
}

/** The rows of the table twin: sport, basis, grade, level, figure, range. */
function rowsOf(lanes: ScaleLane[]): string[][] {
  return lanes.map((lane) => [
    SPORT_LABEL[lane.sport],
    lane.basis === 'recorded' ? 'Recorded' : 'Estimated',
    `${lane.centre}%`,
    lane.level,
    lane.effort ?? 'None',
    lane.rangeLow === null ? 'None' : `${lane.rangeLow} to ${lane.rangeHigh}`,
  ])
}

/**
 * The level scale's model from the grades the page already holds: both sports' grades at the headline
 * duration, the balance reading, and the level target. With a reading it is null unless both sports are
 * graded. Without one, a lone graded sport gets a lane of its own, with no gap and no target, and anything
 * else is null. Every figure is one the tiles, the balance and the level target already print, in whole percent.
 */
export function scaleModel(input: {
  grades: Record<Sport, GradeOutcome | null>
  reading: BalanceReading | null
  target: LevelTarget | null
  result: AnalysisResult
  massKg: number
  units: UnitSystem
}): ScaleModel | null {
  const { grades, reading, target, result, massKg, units } = input
  const lanes = SPORT_ORDER.flatMap((sport) => {
    const outcome = grades[sport]
    return outcome?.kind === 'graded'
      ? [laneOf(sport, outcome.grade, effortFigure(result, sport, massKg, units))]
      : []
  })
  const intro = `Age-grade level of your best ${HEADLINE_LABEL}.`
  if (reading === null) {
    if (lanes.length !== 1) return null
    return {
      lanes,
      gap: null,
      target: null,
      description: `${intro} ${lanes.map(spoken).join(' ')}`,
      rows: rowsOf(lanes),
    }
  }
  if (lanes.length !== SPORT_ORDER.length) return null
  const gap = gapOf(reading)
  const lead = reading.lean === 'even' ? null : SPORT_TITLE[reading.lean]
  const size = Math.abs(wholeCentre(reading.lead))
  const leadText =
    lead === null ? 'The two sports grade level' : `${lead} grades ${plural(size, 'point')} higher`
  return {
    lanes,
    gap,
    target: target === null ? null : targetOf(target, lanes),
    description: `${intro} ${lanes.map(spoken).join(' ')} ${leadText}, ${gap.noteShort}.${
      target === null ? '' : ` ${target.sentence}`
    }`,
    rows: rowsOf(lanes),
  }
}
