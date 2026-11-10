import type { LiftGrade } from '@rca/core/lift'
import { formatGrade } from '../gradeFormat'
import { hrefFor } from '../route'
import type { BigThreeLeadModel, BigThreeLift } from './bigThreeModel'
import '../pages/SportHero.css'
import './BigThreeLead.css'

/** What a gap in the grade asks of the athlete: the two things the athlete can fill in. */
const GRADE_NEEDS: Partial<Record<Extract<LiftGrade, { kind: 'gap' }>['why'], string>> = {
  'no-profile': 'Age grades need your year of birth and sex.',
  'no-mass': 'Age grades need your weight.',
}

/** One lift's column: its one-rep max, a bar filled to its age grade, and the level and grade under it. */
function LiftColumn({ entry, onLog }: { entry: BigThreeLift; onLog?: () => void }) {
  const graded = entry.grade?.kind === 'graded' ? entry.grade.grade.centre : null
  return (
    <div className="big-three__lift" data-testid={`big-three-${entry.lift}`}>
      <dt className="big-three__name">{entry.label}</dt>
      <dd className="big-three__body">
        {entry.max === null ? (
          <p className="big-three__empty">
            {onLog === undefined ? (
              'Not logged yet'
            ) : (
              <button type="button" className="big-three__log" onClick={onLog}>
                {`Log a ${entry.label.toLowerCase()}`}
              </button>
            )}
          </p>
        ) : (
          <>
            <p className="sport-hero__figure">
              <span className="display sport-hero__number">{entry.max.number}</span>{' '}
              <span className="sport-hero__unit">{entry.max.unit}</span>
            </p>
            {graded === null ? null : (
              <>
                <span className="big-three__bar" aria-hidden="true">
                  <span
                    className="big-three__fill"
                    style={{
                      width: `${Math.round(Math.min(1, Math.max(0, graded.grade)) * 100)}%`,
                    }}
                  />
                </span>
                <p className="big-three__level">
                  {graded.level}
                  {' · '}
                  <span className="num">{formatGrade(graded.grade)}</span>
                </p>
              </>
            )}
          </>
        )}
      </dd>
    </div>
  )
}

/**
 * The Lift page's lead: squat, bench and deadlift side by side, each with its projected one-rep max and a bar filled to its
 * age grade, and their total once all three have one. The figures are core's (`bigThreeTotal`, `liftGrade`), as on Balance.
 */
export function BigThreeLead({ model, onLog }: { model: BigThreeLeadModel; onLog?: () => void }) {
  const need = model.lifts
    .map((entry) => (entry.grade?.kind === 'gap' ? GRADE_NEEDS[entry.grade.why] : undefined))
    .find((text) => text !== undefined)
  return (
    <section className="band sport-hero big-three" data-sport="lift" aria-labelledby="lift-lead">
      <div className="big-three__head">
        <h2 id="lift-lead" className="sport-hero__title">
          Big three
        </h2>
        {model.total === null ? null : (
          <p className="big-three__total" data-testid="big-three-total">
            <span className="num">{`${model.total.number} ${model.total.unit}`}</span> total
          </p>
        )}
      </div>
      <dl className="big-three__lifts">
        {model.lifts.map((entry) => (
          <LiftColumn key={entry.lift} entry={entry} {...(onLog && { onLog })} />
        ))}
      </dl>
      {need === undefined ? null : (
        <p className="secondary">
          {need} <a href={hrefFor({ page: 'profile' })}>Open Profile</a>
        </p>
      )}
    </section>
  )
}
