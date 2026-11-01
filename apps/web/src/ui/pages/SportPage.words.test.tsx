// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
import { wordsOf } from '../../test/wordsOf'
import { changeOf } from '../charts/changeFixtures'
import { curvePoint } from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  makeActivity,
  makeEquivalence,
  makeResult,
} from '../components/fixtures'
import { SportPage } from './SportPage'

afterEach(cleanup)

const RESULT = makeResult({
  activities: [
    makeActivity({ id: 'run-1', sport: 'run' }),
    makeActivity({ id: 'ride-1', sport: 'ride' }),
  ],
  runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
  rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
  equivalents: [makeEquivalence()],
})

// Measured on this fixture (one run and one ride, graded, a profile) before and after D4.10's trim: Run 278 then 272 words,
// Ride 278 then 273, with no defined term on either. A budget is a ratchet: a sentence added takes another out.
const WORD_BUDGET = { run: 272, ride: 273 } as const

describe('a sport page’s first screen', () => {
  it.each(['run', 'ride'] as const)('keeps the %s page within its word budget', (sport) => {
    const { container } = render(
      <SportPage
        sport={sport}
        result={RESULT}
        previous={null}
        previousLabel={null}
        trends={NO_TRENDS}
        sameHeartRate={NO_SAME_HEART_RATE[sport]}
        lateEvidence={NO_LATE_EVIDENCE[sport]}
        change={changeOf('higher')}
        units="metric"
        massKg={75}
        weighted
        profile={MAN_BORN_1986}
        missingAge={null}
        rangeDays={42}
        controls={<span>Period picker</span>}
        footnote={null}
        emptyText="Nothing in this period."
        inLibrary={1}
        library={RESULT.activities}
        onAddFiles={vi.fn()}
      />,
    )
    expect(wordsOf(container).length).toBeLessThanOrEqual(WORD_BUDGET[sport])
  })
})
