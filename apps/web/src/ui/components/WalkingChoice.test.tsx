// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CountWalkingRuns, WalkingPaceSection } from './WalkingChoice'

afterEach(() => {
  cleanup()
})

/** The activity page's state: the run is marked until it is counted, as the session reports it. */
function Harness({ counted: start = false }: { counted?: boolean }) {
  const [counted, setCounted] = useState(start)
  return (
    <WalkingPaceSection
      walkingPace={!counted}
      choice={{
        counted,
        onCount: () => setCounted(true),
        onStop: () => setCounted(false),
      }}
    />
  )
}

describe('WalkingPaceSection', () => {
  it('moves focus to Leave this run out once the run is counted, and back to Count this run when it is left out', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Count this run' }))
    expect(screen.getByRole('button', { name: 'Leave this run out' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Leave this run out' }))
    expect(screen.getByRole('button', { name: 'Count this run' })).toHaveFocus()
  })

  it('does not take focus when the page opens on a counted run', () => {
    render(<Harness counted />)
    expect(screen.getByRole('button', { name: 'Leave this run out' })).not.toHaveFocus()
  })

  it('says the run is left out while it is marked, and counted once it is', () => {
    render(<Harness />)
    expect(screen.getByText(/left out of your run analysis/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Count this run' }))
    expect(screen.getByText(/You count it as a run/)).toBeInTheDocument()
  })

  it('offers no button where the choice is not given, and shows nothing for an ordinary run', () => {
    const { container, rerender } = render(<WalkingPaceSection walkingPace />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<WalkingPaceSection walkingPace={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('CountWalkingRuns', () => {
  it('counts the runs, and leaves focus to the page, which moves it once the state has flipped', () => {
    const onCount = vi.fn()
    render(<CountWalkingRuns count={22} onCount={onCount} />)
    fireEvent.click(screen.getByRole('button', { name: 'Count these runs' }))
    expect(onCount).toHaveBeenCalledTimes(1)
  })
})

describe('WalkingPaceSection after a press that changed nothing', () => {
  it('does not move focus at a later flip made elsewhere, nor after the page moves on', () => {
    function Stuck({ counted }: { counted: boolean }) {
      return (
        <WalkingPaceSection
          walkingPace={!counted}
          choice={{ counted, onCount: () => undefined, onStop: () => undefined }}
        />
      )
    }
    const view = render(<Stuck counted={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Count this run' }))
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    view.rerender(<Stuck counted />)
    expect(screen.getByRole('button', { name: 'Leave this run out' })).not.toHaveFocus()
  })
})
