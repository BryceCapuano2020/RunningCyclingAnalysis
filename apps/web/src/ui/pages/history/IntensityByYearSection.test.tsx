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

const NONE: IntensityShares = {
  easy: 0,
  moderate: 0,
  hard: 0,
  seconds: 0,
  counted: 0,
  noZones: 0,
  activities: 0,
}
const TIMED: IntensityShares = {
  easy: 0.4,
  moderate: 0.2,
  hard: 0.4,
  seconds: 72_000,
  counted: 9,
  noZones: 0,
  activities: 9,
}
const row = (year: number, run: IntensityShares, ride: IntensityShares): IntensityRow => ({
  year,
  sports: { run, ride },
})

function stubResize() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
}

describe('IntensityByYearSection', () => {
  it('toggles between the sports that have heart-rate time, opening on running', () => {
    stubResize()
    render(<IntensityByYearSection years={[row(2025, TIMED, TIMED)]} />)
    expect(screen.getByRole('radio', { name: 'Run' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Ride' }))
    expect(screen.getByRole('radio', { name: 'Ride' })).toBeChecked()
    expect(screen.getByRole('figure', { name: 'Ride intensity by year' })).toBeInTheDocument()
  })

  it('has no toggle when only one sport has heart-rate time', () => {
    stubResize()
    render(<IntensityByYearSection years={[row(2025, NONE, TIMED)]} />)
    expect(screen.queryByRole('radio', { name: 'Run' })).toBeNull()
    expect(screen.getByRole('figure', { name: 'Ride intensity by year' })).toBeInTheDocument()
  })

  it('opens a rides-only library with no heart rate on riding, and asks for rides', () => {
    stubResize()
    const rides: IntensityShares = { ...NONE, activities: 5 }
    render(<IntensityByYearSection years={[row(2025, NONE, rides)]} />)
    expect(
      screen.getByText("Add rides with a heart rate to see each year's intensity."),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Add runs/)).toBeNull()
  })

  it('asks for a maximum heart rate when runs have heart rate but no zones to cut', () => {
    stubResize()
    const runs: IntensityShares = { ...NONE, noZones: 3, activities: 3 }
    render(<IntensityByYearSection years={[row(2025, runs, NONE)]} />)
    expect(
      screen.getByText(
        "Enter your max heart rate for running on Profile to see each year's intensity.",
      ),
    ).toBeInTheDocument()
  })
})
