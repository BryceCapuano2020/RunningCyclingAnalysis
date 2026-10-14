// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Header } from './Header'

afterEach(() => {
  cleanup()
})

describe('Header', () => {
  it('shows the app name and tagline', () => {
    render(<Header units="metric" onUnitsChange={vi.fn()} />)
    expect(screen.getByText('RunningCyclingAnalysis')).toBeInTheDocument()
    expect(
      screen.getByText('Compare your running and cycling fitness in one unit'),
    ).toBeInTheDocument()
  })

  it('offers imperial and metric as a labelled radio group', () => {
    render(<Header units="imperial" onUnitsChange={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Units' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Imperial' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Metric' })).not.toBeChecked()
  })

  it('reports the unit the user picks', async () => {
    const user = userEvent.setup()
    const onUnitsChange = vi.fn()
    render(<Header units="imperial" onUnitsChange={onUnitsChange} />)
    await user.click(screen.getByRole('radio', { name: 'Metric' }))
    expect(onUnitsChange).toHaveBeenCalledWith('metric')
  })

  it('reports imperial when metric is selected', async () => {
    const user = userEvent.setup()
    const onUnitsChange = vi.fn()
    render(<Header units="metric" onUnitsChange={onUnitsChange} />)
    await user.click(screen.getByRole('radio', { name: 'Imperial' }))
    expect(onUnitsChange).toHaveBeenCalledWith('imperial')
  })
})
