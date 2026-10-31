// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import {
  POWER_KEPT_NOTE,
  POWER_SET_ASIDE_NOTE,
  estimatedPowerNote,
  powerCheckChip,
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

describe('a ride without a power meter whose estimate is over what riders hold', () => {
  const estimatedPower = { durationS: 1200, wkg: 9.04 }

  it('says what the estimate needs and what else would show it, and offers to keep the power', async () => {
    render(
      <PowerCheck
        activity={makeActivity({ sport: 'ride', powerCheck: 'set-aside', estimatedPower })}
      />,
    )
    const note = estimatedPowerNote(estimatedPower)
    expect(screen.getByText(note)).toBeTruthy()
    expect(note).toContain('no power meter')
    expect(note).toContain('needs 9.0 W/kg')
    expect(note).toContain(
      'An assisted bike, a tow or a wrong weight setting would read like this.',
    )
    expect(note).not.toMatch(/e-bike|motor|cheat|fraud|fake/i)
    await userEvent.click(screen.getByRole('button', { name: 'Keep this power' }))
    expect(localStorage.getItem('rca.keepPower.v1')).toBe('["activity-1"]')
  })

  it('keeps the meter’s note for a ride with one, and the kept note once kept', () => {
    render(<PowerCheck activity={makeActivity({ sport: 'ride', powerCheck: 'set-aside' })} />)
    expect(screen.getByText(POWER_SET_ASIDE_NOTE)).toBeTruthy()
    cleanup()
    render(
      <PowerCheck activity={makeActivity({ sport: 'ride', powerCheck: 'kept', estimatedPower })} />,
    )
    expect(screen.getByText(POWER_KEPT_NOTE)).toBeTruthy()
  })
})

describe('powerCheckChip', () => {
  it('is a chip for each state and none for a ride whose power is not in question', () => {
    expect(powerCheckChip('set-aside')).toBe('Power set aside')
    expect(powerCheckChip('kept')).toBe('Power kept')
    expect(powerCheckChip(undefined)).toBeNull()
  })
})
