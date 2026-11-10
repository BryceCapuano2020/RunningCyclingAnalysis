import type { LiftGrade } from '@rca/core/lift'
import type { UnitSystem } from '@rca/core/units'
import { formatGrade } from '../gradeFormat'
import { hrefFor } from '../route'
import { HeroFigure } from '../pages/SportHero'
import { WINDOW_WEEKS, loadParts, rangeText } from './liftEntries'
import type { LiftLead as LiftLeadModel } from './liftEntries'
import '../pages/SportHero.css'

/** What a gap in the grade asks of the athlete: the two things the athlete can fill in. */
const GRADE_NEEDS: Partial<Record<Extract<LiftGrade, { kind: 'gap' }>['why'], string>> = {
  'no-profile': 'Age grades need your year of birth and sex.',
  'no-mass': 'Age grades need your weight.',
}

/** A big-three lift's level and age grade, or what the grade needs; nothing for a lift with no grade. */
function LevelFigure({ grade }: { grade: LiftGrade | null }) {
  if (grade === null) return null
  if (grade.kind === 'gap') {
    const needs = GRADE_NEEDS[grade.why]
    return needs === undefined ? null : (
      <HeroFigure testId="lift-level" label="Level">
        <p className="secondary">
          {needs} <a href={hrefFor({ page: 'profile' })}>Open Profile</a>
        </p>
      </HeroFigure>
    )
  }
  return (
    <HeroFigure testId="lift-level" label="Level">
      <p className="sport-hero__level">
        <span className="sport-hero__level-name">{grade.grade.centre.level}</span>
        {' · '}
        <span className="num sport-hero__level-value">{formatGrade(grade.grade.centre.grade)}</span>
      </p>
    </HeroFigure>
  )
}

/**
 * The Lift page's lead, as the Run and Ride pages lead: one title line over one row of mono figures, each with a small
 * label. The top lift's one-rep max with its 80% range, its floor (the heaviest working set, with its date), the change on
 * the 8 weeks before (core's word) and, for the big three, its level and age grade.
 */
export function LiftLead({ lead, units }: { lead: LiftLeadModel; units: UnitSystem }) {
  const max = loadParts(lead.estimate.point, units)
  const floor = loadParts(lead.floor.loadKg, units)
  return (
    <section className="band sport-hero" data-sport="lift" aria-labelledby="lift-lead">
      <h2 id="lift-lead" className="sport-hero__title">
        {lead.title}
      </h2>
      <dl className="sport-hero__stats">
        <HeroFigure testId="lift-max" label="One-rep max">
          <p className="sport-hero__figure">
            <span className="display sport-hero__number">{max.number}</span>
            {' '}
            <span className="sport-hero__unit">{max.unit}</span>
          </p>
          <p className="sport-hero__range">
            {rangeText(lead.estimate.low, lead.estimate.high, units)}
          </p>
        </HeroFigure>
        <HeroFigure testId="lift-floor" label="Floor">
          <p className="sport-hero__figure">
            <span className="display sport-hero__number">{floor.number}</span>
            {' '}
            <span className="sport-hero__unit">{floor.unit}</span>{' '}
            <span className="sport-hero__side">{`× ${lead.floor.reps}`}</span>
          </p>
          <p className="sport-hero__range">{lead.floorDate}</p>
        </HeroFigure>
        <HeroFigure testId="lift-change" label={`Change on the ${WINDOW_WEEKS} weeks before`}>
          <p className="sport-hero__change">
            <span className="sport-hero__words">{lead.change ?? 'no clear change'}</span>
          </p>
        </HeroFigure>
        <LevelFigure grade={lead.grade} />
      </dl>
    </section>
  )
}
