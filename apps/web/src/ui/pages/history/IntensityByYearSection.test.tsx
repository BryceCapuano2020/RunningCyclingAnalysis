// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IntensityRow, IntensityShares } from '@rca/core/history'
import '../../../test/deviceZone'
import { IntensityByYearSection } from './IntensityByYearSection'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const NONE: IntensityShares = { easy: 0, moderate: 0, hard: 0, seconds: 0, counted: 0 }
const TIMED: IntensityShares = { easy: 0.4, moderate: 0.2, hard: 0.4, seconds: 36_000, counted: 9 }
const row = (year: number, run: IntensityShares, ride: IntensityShares): IntensityRow => ({
  year,
  sports: { run, ride },
})

describe('IntensityByYearSection', () => {
  it('toggles between the sports that have heart-rate time, opening on running', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    render(<IntensityByYearSection years={[row(2025, TIMED, TIMED)]} />)
    expect(screen.getByRole('radio', { name: 'Run' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Ride' }))
    expect(screen.getByRole('radio', { name: 'Ride' })).toBeChecked()
    expect(screen.getByRole('figure', { name: 'Ride intensity by year' })).toBeInTheDocument()
  })

  it('has no toggle when only one sport has heart-rate time', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    render(<IntensityByYearSection years={[row(2025, NONE, TIMED)]} />)
    expect(screen.queryByRole('radio', { name: 'Run' })).toBeNull()
    expect(screen.getByRole('figure', { name: 'Ride intensity by year' })).toBeInTheDocument()
  })
})
