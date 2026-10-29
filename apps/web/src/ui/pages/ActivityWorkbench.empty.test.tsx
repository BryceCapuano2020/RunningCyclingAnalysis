// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ActivityTrace } from '@rca/core/workbench'
import { ActivityWorkbench } from './ActivityWorkbench'
import { steadyTrace } from './workbenchFixtures'

function show(trace: ActivityTrace) {
  return render(
    <ActivityWorkbench
      activityId={trace.activityId}
      units="metric"
      loadTrace={async () => ({ kind: 'trace', trace })}
    />,
  )
}

describe('measures with nothing to draw', () => {
  it('leaves a flat measure or an all-zero one out of the stack, and its chip says no data', async () => {
    const trace = steadyTrace(600)
    trace.streams.altitude = new Float32Array(600).fill(12)
    trace.streams.power = new Float32Array(600)
    trace.streams.cadence = Float32Array.from({ length: 600 }, (_, i) => 160 + (i % 5))
    show(trace)
    const figure = await screen.findByRole('figure', { name: /^Pace and heart rate over time/ })
    expect(figure.querySelector('[data-channel="altitude"]')).toBeNull()
    expect(figure.querySelector('[data-channel="power"]')).toBeNull()
    const elevation = screen.getByRole('checkbox', { name: /^Elevation/ })
    expect(elevation).toBeDisabled()
    expect(elevation).not.toBeChecked()
    expect(elevation.closest('label')).toHaveTextContent('no data')
    expect(screen.getByRole('checkbox', { name: /^Measured power/ })).toBeDisabled()
    // A measure that varies is a choice, as before, and has no note.
    const cadence = screen.getByRole('checkbox', { name: /^Cadence/ })
    expect(cadence).toBeEnabled()
    expect(within(cadence.closest('label')!).queryByText('no data')).toBeNull()
  })
})
