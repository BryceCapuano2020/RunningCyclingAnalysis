// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsOverTime } from './SettingsOverTime'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
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
