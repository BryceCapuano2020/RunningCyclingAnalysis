// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { powerCheckChip, powerCheckRows } from '../analysis/powerCheckCopy'
import { makeActivity } from './test/fixtures'
import { PowerCheck } from './PowerCheck'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

/** The value shown beside a label in the page's rows. */
function valueOf(label: string): string | null | undefined {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent
}

describe('PowerCheck', () => {
  it('says nothing for an activity whose power is not in question', () => {
    const { container } = render(<PowerCheck activity={makeActivity({ sport: 'ride' })} />)
    expect(container.textContent).toBe('')
  })

  it('shows a set-aside ride as label and value, and offers to keep it', async () => {
    render(<PowerCheck activity={makeActivity({ sport: 'ride', powerCheck: 'set-aside' })} />)
    expect(valueOf('Power')).toBe('Set aside')
    expect(valueOf('Left out of')).toBe('Bests, grades and the balance')
    expect(valueOf('Check')).toMatch(/Meter calibration/)
    await userEvent.click(screen.getByRole('button', { name: 'Keep this power' }))
    expect(localStorage.getItem('rca.keepPower.v1')).toBe('["activity-1"]')
  })

  it('shows a kept ride as counting, and offers to set it aside again', async () => {
    localStorage.setItem('rca.keepPower.v1', '["activity-1"]')
    render(<PowerCheck activity={makeActivity({ sport: 'ride', powerCheck: 'kept' })} />)
    expect(valueOf('Power')).toBe('Kept')
    expect(valueOf('Counts in')).toBe('Bests and thresholds')
    await userEvent.click(screen.getByRole('button', { name: 'Set this power aside' }))
    expect(localStorage.getItem('rca.keepPower.v1')).toBe('[]')
  })

  it('keeps the rows behind Details, not on the face of the page', () => {
    render(<PowerCheck activity={makeActivity({ sport: 'ride', powerCheck: 'set-aside' })} />)
    const details = screen.getByText('Power', { selector: 'dt' }).closest('details')
    expect(details?.querySelector('summary')?.textContent).toMatch(/^Details/)
    expect(details?.open).toBe(false)
  })

  it('adds the heart rate over the questioned effort, and drops it without a reading', () => {
    const heartRate = { durationS: 1200, wkg: 8, heartRateShare: 0.93 }
    render(
      <PowerCheck
        activity={makeActivity({
          sport: 'ride',
          powerCheck: 'set-aside',
          powerHeartRate: heartRate,
        })}
      />,
    )
    expect(valueOf('Heart rate, best 20 min')).toBe('93% of reference')
    expect(valueOf('Heart rate reads')).toBe('As high as a hard effort')
    cleanup()
    render(<PowerCheck activity={makeActivity({ sport: 'ride', powerCheck: 'set-aside' })} />)
    expect(screen.queryByText(/^Heart rate/, { selector: 'dt' })).toBeNull()
  })
})

describe('powerCheckRows', () => {
  it('says a lower heart rate reads lower than a hard effort, without a verdict on the power', () => {
    const rows = powerCheckRows('set-aside', undefined, {
      durationS: 1200,
      wkg: 8,
      heartRateShare: 0.78,
    })
    expect(rows).toContainEqual({
      label: 'Heart rate reads',
      value: 'Lower than a hard effort at that power',
    })
    expect(JSON.stringify(rows)).not.toMatch(/wrong|fault|broken|cheat/i)
  })

  it('gives an estimate its best effort as a figure, in seconds under two minutes and minutes after', () => {
    const labels = (durationS: number) =>
      powerCheckRows('set-aside', { durationS, wkg: 9.04 }, undefined).map((row) => row.label)
    expect(labels(1200)).toContain('Best 20 min')
    expect(labels(120)).toContain('Best 2 min')
    expect(labels(90)).toContain('Best 90 s')
    expect(labels(5)).toContain('Best 5 s')
    const rows = powerCheckRows('set-aside', { durationS: 1200, wkg: 9.04 }, undefined)
    expect(rows).toContainEqual({ label: 'Best 20 min', value: '9.0 W/kg' })
    expect(rows).toContainEqual({ label: 'Power source', value: 'Estimated from speed and climbs' })
  })
})

describe('powerCheckChip', () => {
  it('is a chip for each state and none for a ride whose power is not in question', () => {
    expect(powerCheckChip('set-aside')).toBe('Power set aside')
    expect(powerCheckChip('kept')).toBe('Power kept')
    expect(powerCheckChip(undefined)).toBeNull()
  })
})
