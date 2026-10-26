// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { GradeOutcome } from '../grades'
import { AgeGradeBlock } from './AgeGradeBlock'

afterEach(() => {
  cleanup()
})

const RUN: GradeOutcome = {
  kind: 'graded',
  age: 40,
  grade: { centre: { grade: 0.67, level: 'Local' }, range: null },
}

const RIDE: GradeOutcome = {
  kind: 'graded',
  age: 40,
  grade: {
    centre: { grade: 0.66, level: 'Local' },
    range: { low: { grade: 0.63, level: 'Local' }, high: { grade: 0.69, level: 'Local' } },
  },
}

describe('AgeGradeBlock', () => {
  it('sets the effort on its own line, under the level, so the level line stays short', () => {
    const { container } = render(<AgeGradeBlock sport="run" outcome={RUN} effort="4:00 /km" />)
    expect(container.querySelector('.age-grade__line')?.textContent).toBe('Local · 67%')
    expect(container.querySelector('.age-grade__effort')?.textContent).toBe(
      'on your best 20 min, 4:00 /km',
    )
  })

  it('names the 90% range once, in the key, and not again in the caption', () => {
    const { container } = render(<AgeGradeBlock sport="ride" outcome={RIDE} effort={null} />)
    expect(screen.getByText('Ring: estimated, with its 90% range in brackets.')).toBeInTheDocument()
    const caption = container.querySelector('.muted')?.textContent
    expect(caption).toBe(
      'Graded through its running equivalent, at age 40, on the USATF road standards. A level, not a ranking.',
    )
    expect(container.textContent).not.toMatch(/The range in brackets is the 90% range/)
  })

  it('leaves no caption on a Balance card, which names no standard', () => {
    const { container } = render(
      <AgeGradeBlock sport="ride" outcome={RIDE} effort={null} namesStandard={false} />,
    )
    expect(container.querySelector('.muted')).toBeNull()
    expect(screen.getByText('Ring: estimated, with its 90% range in brackets.')).toBeInTheDocument()
  })

  it('gives the standards link its own class, so a phone can size it as a control', () => {
    const { container } = render(<AgeGradeBlock sport="run" outcome={RUN} effort={null} />)
    const link = container.querySelector('.age-grade__standards')
    expect(link?.tagName).toBe('A')
    expect(link?.textContent).toBe('USATF road standards')
    expect(link?.getAttribute('href')).toBe('#/method')
  })
})
