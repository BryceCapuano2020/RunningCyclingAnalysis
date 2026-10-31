// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import { SettingsOverTime } from './SettingsOverTime'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderForm() {
  return render(
    <SettingsOverTime
      entries={[]}
      state="ready"
      units="metric"
      onAdd={async () => undefined}
      onRemove={async () => undefined}
    />,
  )
}

describe('the From date', () => {
  it('starts from today, and rolls over to the next day at midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 10, 23, 30))
    renderForm()
    expect(screen.getByLabelText('From')).toHaveValue('2026-06-10')
    act(() => vi.advanceTimersByTime(31 * 60_000))
    expect(screen.getByLabelText('From')).toHaveValue('2026-06-11')
  })

  it('keeps a date the athlete picked through midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 10, 23, 30))
    renderForm()
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2024-01-05' } })
    act(() => vi.advanceTimersByTime(31 * 60_000))
    expect(screen.getByLabelText('From')).toHaveValue('2024-01-05')
  })

  it('limits the picker to the years the settings accept', () => {
    renderForm()
    expect(screen.getByLabelText('From')).toHaveAttribute('min', '1970-01-01')
    expect(screen.getByLabelText('From')).toHaveAttribute('max', '2100-12-31')
  })
})

describe('the dated settings table', () => {
  const entries = [
    { kind: 'massKg' as const, value: 78, from: '2026-08-15' },
    { kind: 'massKg' as const, value: 75, from: '2025-08-15' },
  ]

  function renderTable() {
    return render(
      <SettingsOverTime
        entries={entries}
        state="ready"
        units="metric"
        onAdd={async () => undefined}
        onRemove={async () => undefined}
      />,
    )
  }

  it('is a plain box while it fits, so it is not an extra tab stop', () => {
    renderTable()
    expect(screen.queryByRole('region', { name: 'Your dated settings' })).not.toBeInTheDocument()
  })

  it('is a named, focusable scroll region once it is wider than its box, so its Value and Delete columns can be reached', () => {
    class MeasuringObserver {
      private readonly callback: () => void
      constructor(callback: () => void) {
        this.callback = callback
      }
      observe() {
        this.callback()
      }
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MeasuringObserver)
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(434)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(288)
    renderTable()
    expect(screen.getByRole('region', { name: 'Your dated settings' })).toHaveAttribute(
      'tabindex',
      '0',
    )
  })
})

describe('Try again', () => {
  it('is offered only when the settings could not be loaded, and runs the retry', () => {
    const retry = vi.fn()
    const { rerender } = render(
      <SettingsOverTime
        entries={[]}
        state="ready"
        units="metric"
        onAdd={async () => undefined}
        onRemove={async () => undefined}
        retry={retry}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    rerender(
      <SettingsOverTime
        entries={[]}
        state="failed"
        units="metric"
        onAdd={async () => undefined}
        onRemove={async () => undefined}
        retry={retry}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})

/*
 * Adding a dated body weight, against the weight already given:
 *
 * | the weight typed                     | Add pressed          | what happens                        |
 * | ------------------------------------ | -------------------- | ----------------------------------- |
 * | near the nearest dated weight        | once                 | kept                                |
 * | far from it, or outside the range    | once                 | asked, not kept                     |
 * | the same entry, after the question   | again                | kept                                |
 * | changed (value, setting or date)     | after the question   | asked again; the answer is not kept |
 * | no dated weight, one on the profile  | once                 | set against the profile's           |
 */
describe('adding a dated weight that looks like the wrong units', () => {
  const dated = [{ kind: 'massKg' as const, value: 78, from: '2026-08-15' }]

  function renderWeights(
    onAdd = vi.fn(async () => undefined),
    props: { entries?: typeof dated; weightKg?: number | null } = {},
  ) {
    render(
      <SettingsOverTime
        entries={props.entries ?? dated}
        weightKg={props.weightKg ?? null}
        state="ready"
        units="metric"
        onAdd={onAdd}
        onRemove={async () => undefined}
      />,
    )
    return onAdd
  }

  function add(text: string) {
    fireEvent.change(screen.getByLabelText('Value (kg)'), { target: { value: text } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  }

  it('keeps a weight near the nearest dated one at once', async () => {
    const onAdd = renderWeights()
    add('80')
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
  })

  it('asks about a weight far from the nearest dated one, and keeps it when Add is pressed again', async () => {
    const onAdd = renderWeights()
    add('150')

    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByText(/92% higher than your weight from .*, 78\.0 kg\./)).toBeInTheDocument()
    expect(screen.getByText(/press Add again to keep it\./)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ kind: 'massKg', value: 150 }))
  })

  it('asks again when the value is changed after the question, so the answer is not carried over', () => {
    const onAdd = renderWeights()
    add('150')
    add('155')

    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByText(/99% higher/)).toBeInTheDocument()
  })

  it('asks about a weight outside the typical range', () => {
    const onAdd = renderWeights(undefined, { entries: [] })
    add('34')

    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByText(/That is 34\.0 kg, outside 45 to 160 kg\./)).toBeInTheDocument()
  })

  it('sets a first dated weight against the weight on the profile', () => {
    const onAdd = renderWeights(undefined, { entries: [], weightKg: 60 })
    add('150')

    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByText(/150% higher than your saved weight, 60\.0 kg\./)).toBeInTheDocument()
  })

  it('has nothing to set a first weight against when none is saved, so a modest one is kept', async () => {
    const onAdd = renderWeights(undefined, { entries: [] })
    add('90')
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
  })

  it('asks about a high first weight, which may be pounds typed as kilograms', () => {
    const onAdd = renderWeights(undefined, { entries: [] })
    add('150')

    expect(onAdd).not.toHaveBeenCalled()
    expect(
      screen.getByText(/a high figure for a first weight\. If that is pounds, it is 68\.0 kg\./),
    ).toBeInTheDocument()
  })
})
