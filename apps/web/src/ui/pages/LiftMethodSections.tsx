import { MethodLines } from '../components/MethodLines'
import { MethodText } from '../components/MethodText'
import { SECTION_ID } from '../components/methodTopics'
import {
  LIFT_GRADE_LINES,
  LIFT_STANDARDS_CREDIT,
  ONE_REP_MAX_LINES,
  ONE_REP_MAX_RANGE_LINES,
} from './liftMethodCopy'

/** The two Lift sections of Method: the estimated one-rep max, and the lift age grade with its standard's credit. */
export function LiftMethodSections() {
  return (
    <>
      <section className="section band" aria-labelledby={SECTION_ID.lift}>
        <h2 id={SECTION_ID.lift} tabIndex={-1}>
          Estimated one-rep max
        </h2>
        <MethodText>
          <MethodLines lines={ONE_REP_MAX_LINES} />
          <MethodLines lines={ONE_REP_MAX_RANGE_LINES} />
        </MethodText>
      </section>
      <section className="section band" aria-labelledby={SECTION_ID.liftGrade}>
        <h2 id={SECTION_ID.liftGrade} tabIndex={-1}>
          Lift age grade
        </h2>
        <MethodText>
          <MethodLines lines={LIFT_GRADE_LINES} />
          <p className="secondary">{LIFT_STANDARDS_CREDIT}</p>
        </MethodText>
      </section>
    </>
  )
}
