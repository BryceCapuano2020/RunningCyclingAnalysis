import { MethodSection } from './MethodSection'
import {
  LIFT_FACTS,
  LIFT_GRADE_FACTS,
  LIFT_GRADE_LEAD,
  LIFT_LEAD,
  LIFT_STANDARDS_CREDIT,
} from './liftMethodCopy'

/** The two Lift sections of Method: the projected one-rep max with what is built on it, and the lift age grade. */
export function LiftMethodSections() {
  return (
    <>
      <MethodSection section="lift" lead={LIFT_LEAD} facts={LIFT_FACTS} />
      <MethodSection section="liftGrade" lead={LIFT_GRADE_LEAD} facts={LIFT_GRADE_FACTS}>
        <p className="muted">{LIFT_STANDARDS_CREDIT}</p>
      </MethodSection>
    </>
  )
}
