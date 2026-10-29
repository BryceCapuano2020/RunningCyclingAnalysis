import '../../test/warmSample'
import { describe, expect, it } from 'vitest'
import { AnalysisSession } from '@rca/core/session'
import { gapOfHeadline } from '../balanceGap'
import { gapReading } from '../components/balanceScale'
import { formatGrade, wholeGrade } from '../gradeFormat'
import { headlineGrades } from '../grades'
import type { GradeOutcome } from '../grades'
import { levelTarget } from '../levelTarget'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from '../sampleAthlete'
import { scaleModel } from './balanceScaleModel'

/** The sample athlete's analysis, with every input the page hands the model. */
function sample() {
  const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
  if (state.result === null) throw new Error('The sample has no result')
  const { result } = state
  const headline = headlineGrades(result, SAMPLE_PROFILE)
  const gap = gapOfHeadline(headline)
  if (gap === null) throw new Error('The sample has no gap')
  const grades = { run: headline.run, ride: headline.ride }
  const target = levelTarget({
    lean: gap.lean,
    grades,
    result,
    sex: SAMPLE_PROFILE.sex,
    massKg: SAMPLE_SETTINGS.massKg,
    units: 'metric',
    calibration: state.heartRateJudgement.calibration,
  })
  const model = scaleModel({
    grades,
    reading: gapReading(gap),
    target,
    result,
    massKg: SAMPLE_SETTINGS.massKg,
    units: 'metric',
  })
  return { model, grades, gap, target }
}

function gradeOf(outcome: GradeOutcome | null) {
  if (outcome?.kind !== 'graded') throw new Error('Expected a graded outcome')
  return outcome.grade
}

describe('scaleModel', () => {
  it('takes each lane’s percent from the grade the tiles show, whole and floored, and nothing else', () => {
    const { model, grades } = sample()
    for (const lane of model?.lanes ?? []) {
      const grade = gradeOf(grades[lane.sport])
      expect(lane.centre).toBe(wholeGrade(grade.centre.grade))
      expect(lane.pct).toBe(formatGrade(grade.centre.grade))
    }
  })

  it('makes the run a recorded dot and the ride an estimate with the range its grade carries', () => {
    const { model, grades } = sample()
    const [run, ride] = model?.lanes ?? []
    expect(run).toMatchObject({ sport: 'run', basis: 'recorded', low: null, high: null })
    const range = gradeOf(grades.ride).range
    expect(ride).toMatchObject({
      sport: 'ride',
      basis: 'estimated',
      low: wholeGrade(range?.low.grade ?? 0),
      high: wholeGrade(range?.high.grade ?? 0),
    })
    expect(ride?.rangeHigh).toBe(formatGrade(range?.high.grade ?? 0))
  })

  it('names each lane’s level and the figure it rests on, as the tiles name them', () => {
    const { model } = sample()
    const [run, ride] = model?.lanes ?? []
    expect(run?.sub).toMatch(/^\w+ · \d+:\d{2} \/km on your best 20 min$/)
    // The ride's watts say estimated when no power meter measured them, as its tile's grade line does.
    expect(ride?.sub).toMatch(/ · \d+ W( \(estimated\))? on your best 20 min$/)
    expect(run?.subShort).not.toMatch(/best 20 min/)
  })

  it('sizes the gap as the headline does, from the side the balance leans to', () => {
    const { model, gap } = sample()
    expect(model?.gap?.figure).toBe(`${Math.abs(Math.round(gap.centre))} pts`)
    expect(model?.gap?.note).toMatch(/^toward running · 90% range \d+ to \d+ points$/)
    expect(model?.gap?.noteShort).toMatch(/^range /)
    expect(model?.gap?.noteTiny).not.toMatch(/points/)
  })

  it('puts the ghost ring in the lower sport’s lane, at the higher sport’s grade, with the target’s own figures', () => {
    const { model, target } = sample()
    expect(target).not.toBeNull()
    expect(model?.target?.sport).toBe(target?.lower)
    const higher = model?.lanes.find((lane) => lane.sport === target?.higher)
    expect(model?.target?.at).toBe(higher?.centre)
    expect(model?.target?.eyebrow).toBe('To level with running')
    expect(model?.target?.line).toContain(`about ${target?.centre}`)
    expect(model?.target?.line).toContain(`now ${target?.now}`)
    if (target?.range !== null) expect(model?.target?.line).toContain(`(${target?.range})`)
    expect(model?.target?.sentence).toBe(target?.sentence)
    // The drawing's description carries the sentence too, so the target is not in the picture alone.
    expect(model?.description).toContain(target?.sentence ?? 'no sentence')
  })

  it('draws no ghost when there is no target', () => {
    const { grades, gap } = sample()
    const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
    const model = scaleModel({
      grades,
      reading: gapReading(gap),
      target: null,
      result: state.result!,
      massKg: SAMPLE_SETTINGS.massKg,
      units: 'metric',
    })
    expect(model?.target).toBeNull()
  })

  it('is null unless both sports are graded', () => {
    const { grades, gap } = sample()
    const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
    for (const held of [
      { ...grades, ride: null },
      { ...grades, run: null },
    ]) {
      expect(
        scaleModel({
          grades: held,
          reading: gapReading(gap),
          target: null,
          result: state.result!,
          massKg: SAMPLE_SETTINGS.massKg,
          units: 'metric',
        }),
      ).toBeNull()
    }
  })

  it('names the drawing for a screen reader with each lane and the gap, and gives the same figures as a table', () => {
    const { model } = sample()
    expect(model?.description).toMatch(
      /^Age-grade level of your best 20 min\. Run \d+ percent, \w+, recorded\./,
    )
    expect(model?.description).toMatch(
      /Ride \d+ percent, .*, estimated, range \d+ to \d+ percent\./,
    )
    expect(model?.description).toMatch(/Running grades \d+ points? higher, range /)
    expect(model?.rows).toHaveLength(2)
    expect(model?.rows[0]).toEqual([
      'Run',
      'Recorded',
      `${model?.lanes[0]?.centre}%`,
      model?.lanes[0]?.level,
      model?.lanes[0]?.effort,
      'None',
    ])
    expect(model?.rows[1]?.[1]).toBe('Estimated')
  })
})

describe('scaleModel for one sport', () => {
  it('gives the lone graded sport its own lane, with no gap and no target', () => {
    const { grades, gap } = sample()
    const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
    const model = scaleModel({
      grades: { run: grades.run, ride: null },
      reading: null,
      target: null,
      result: state.result!,
      massKg: SAMPLE_SETTINGS.massKg,
      units: 'metric',
    })
    expect(gap).not.toBeNull()
    expect(model?.lanes.map((lane) => lane.sport)).toEqual(['run'])
    expect(model?.gap).toBeNull()
    expect(model?.target).toBeNull()
    expect(model?.description).toMatch(
      /^Age-grade level of your best 20 min\. Run \d+ percent, \w+, recorded\.$/,
    )
    expect(model?.rows).toHaveLength(1)
  })

  it('is null with no grade, or with both and no reading, which is a balance held back', () => {
    const { grades } = sample()
    const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
    const input = {
      reading: null,
      target: null,
      result: state.result!,
      massKg: SAMPLE_SETTINGS.massKg,
      units: 'metric' as const,
    }
    expect(scaleModel({ ...input, grades: { run: null, ride: null } })).toBeNull()
    expect(scaleModel({ ...input, grades })).toBeNull()
  })
})

describe('scaleModel effort figure', () => {
  const rideSub = (powerSource: 'virtual' | 'measured') => {
    const { grades, gap } = sample()
    const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
    const result = state.result!
    const model = scaleModel({
      grades,
      reading: gapReading(gap),
      target: null,
      result: {
        ...result,
        activities: result.activities.map((a) => Object.assign({}, a, { powerSource })),
      },
      massKg: SAMPLE_SETTINGS.massKg,
      units: 'metric',
    })
    return model?.lanes[1]
  }

  it('says estimated on a ride’s watts that no power meter measured, in the line and the table', () => {
    const lane = rideSub('virtual')
    expect(lane?.sub).toMatch(/ \d+ W \(estimated\) on your best 20 min$/)
    expect(lane?.effort).toMatch(/^\d+ W \(estimated\)$/)
    expect(lane?.subShort).toMatch(/\(estimated\)$/)
  })

  it('leaves it off watts a power meter measured', () => {
    const lane = rideSub('measured')
    expect(lane?.sub).toMatch(/ \d+ W on your best 20 min$/)
    expect(lane?.effort).toMatch(/^\d+ W$/)
  })
})
