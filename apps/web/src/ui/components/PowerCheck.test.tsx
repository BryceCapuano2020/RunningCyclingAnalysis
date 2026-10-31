// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import {
  POWER_KEPT_NOTE,
  POWER_SET_ASIDE_NOTE,
  powerCheckChip,
  powerHeartRateNote,
} from '../analysis/powerCheckCopy'
import { makeActivity } from './fixtures'
import { PowerCheck } from './PowerCheck'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('PowerCheck', () => {
  it('says nothing for an activity whose power is not in question', () => {
    const { container } = render(<PowerCheck activity={makeActivity({ sport: 'ride' })} />)
    expect(container.textContent).toBe('')
  })

  it('says a set-aside ride’s power is left out, names what to check, and offers to keep it', async () => {
    render(<PowerCheck activity={makeActivity({ sport: 'ride', powerCheck: 'set-aside' })} />)
    expect(screen.getByText(POWER_SET_ASIDE_NOTE)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Keep this power' }))
    expect(localStorage.getItem('rca.keepPower.v1')).toBe('["activity-1"]')
  })

  it('says a kept ride’s power counts, and offers to set it aside again', async () => {
    localStorage.setItem('rca.keepPower.v1', '["activity-1"]')
    render(<PowerCheck activity={makeActivity({ sport: 'ride', powerCheck: 'kept' })} />)
    expect(screen.getByText(POWER_KEPT_NOTE)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Set this power aside' }))
    expect(localStorage.getItem('rca.keepPower.v1')).toBe('[]')
  })
})

describe('the heart rate over the questioned power', () => {
  const evidence = (heartRateShare: number) => ({ durationS: 1200, wkg: 8.04, heartRateShare })

  it('says what the heart rate averaged, and that a hard one cannot settle the power', () => {
    expect(powerHeartRateNote(evidence(0.93))).toBe(
      'Over its best 20 min, at 8.0 W/kg, your heart rate averaged 93% of your max. That is as high as a hard effort reads. Heart rate cannot say whether the power was right.',
    )
  })

  it('says a lower one is lower than an effort at that power usually shows, without a verdict', () => {
    const note = powerHeartRateNote(evidence(0.78))
    expect(note).toContain('averaged 78% of your max')
    expect(note).toContain('lower than an effort at that power usually shows')
    expect(note).not.toMatch(/wrong|fault|broken|cheat/i)
  })

  it('sits under the set-aside note and under the kept one, and is absent without a reading', () => {
    render(
      <PowerCheck
        activity={makeActivity({
          sport: 'ride',
          powerCheck: 'set-aside',
          powerHeartRate: evidence(0.93),
        })}
      />,
    )
    expect(screen.getByText(/^Over its best 20 min/)).toBeTruthy()
    cleanup()
    render(
      <PowerCheck
        activity={makeActivity({
          sport: 'ride',
          powerCheck: 'kept',
          powerHeartRate: evidence(0.7),
        })}
      />,
    )
    expect(screen.getByText(/averaged 70% of your max/)).toBeTruthy()
    cleanup()
    render(<PowerCheck activity={makeActivity({ sport: 'ride', powerCheck: 'set-aside' })} />)
    expect(screen.queryByText(/^Over its best/)).toBeNull()
  })
})

describe('powerCheckChip', () => {
  it('is a chip for each state and none for a ride whose power is not in question', () => {
    expect(powerCheckChip('set-aside')).toBe('Power set aside')
    expect(powerCheckChip('kept')).toBe('Power kept')
    expect(powerCheckChip(undefined)).toBeNull()
  })
})
