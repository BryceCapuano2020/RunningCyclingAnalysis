// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import { wordsOf } from '../../test/wordsOf'
import { MAN_BORN_1986, makeResult } from '../components/fixtures'
import { MethodPage } from './MethodPage'

afterEach(cleanup)

describe('the Method page', () => {
  it('stays within its word budget', () => {
    const { container } = render(
      <MethodPage
        result={makeResult()}
        heartRateJudgement={NO_HEART_RATE_JUDGEMENT}
        units="metric"
        profile={MAN_BORN_1986}
        weightKnown
        restoring={false}
      />,
    )
    // Measured with every disclosure closed: 2,046 words before D4.10's trim, 2,010 after; the Your years topic (#311) has since added 15, so 2,025.
    expect(wordsOf(container).length).toBeLessThanOrEqual(2025)
  })
})
