// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PeriodChoice } from '@rca/core/period'
import { RangePicker } from './RangePicker'
import type { RangePickerProps } from './RangePicker'

afterEach(() => {
  cleanup()
})

function picker(props: Partial<RangePickerProps> = {}) {
  return <RangePicker choice="default" onChange={vi.fn()} shown={5} total={5} {...props} />
}

describe('RangePicker', () => {
  it('offers the default and the fixed periods in a group named Period', () => {
    render(picker())
    expect(screen.getByRole('group', { name: 'Period' })).toBeInTheDocument()
    for (const label of ['Default', '6 weeks', '3 months', 'Last 12 months', 'All time']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument()
    }
  })

  it('checks the segment for the choice on screen', () => {
    const { unmount } = render(picker({ choice: 'default' }))
    expect(screen.getByRole('radio', { name: 'Default' })).toBeChecked()
    unmount()
    render(picker({ choice: 91 }))
    expect(screen.getByRole('radio', { name: '3 months' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Default' })).not.toBeChecked()
  })

  it('reports the choice of the segment picked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(choice: PeriodChoice) => void>()
    render(picker({ onChange }))
    await user.click(screen.getByRole('radio', { name: '6 weeks' }))
    expect(onChange).toHaveBeenLastCalledWith(42, expect.any(Function))
    await user.click(screen.getByRole('radio', { name: 'All time' }))
    expect(onChange).toHaveBeenLastCalledWith('all', expect.any(Function))
    await user.click(screen.getByRole('radio', { name: 'Default' }))
    expect(onChange).toHaveBeenLastCalledWith('default', expect.any(Function))
  })

  it('keeps the segment picked checked until its answer comes back, then follows the page', async () => {
    const user = userEvent.setup()
    const answers: Array<(reply: unknown) => void> = []
    const onChange = vi.fn((_choice: PeriodChoice, answered: (reply: unknown) => void) => {
      answers.push(answered)
    })
    const { rerender } = render(picker({ choice: 'default', onChange }))
    await user.click(screen.getByRole('radio', { name: '6 weeks' }))
    expect(screen.getByRole('radio', { name: '6 weeks' })).toBeChecked()

    // A reply for a choice the athlete did not pick does not undo the pick.
    rerender(picker({ choice: 'all', onChange }))
    expect(screen.getByRole('radio', { name: '6 weeks' })).toBeChecked()

    // The answer to the pick arrives, so the page's choice is shown again.
    rerender(picker({ choice: 42, onChange }))
    act(() => answers[0]?.(null))
    expect(screen.getByRole('radio', { name: '6 weeks' })).toBeChecked()
    rerender(picker({ choice: 'all', onChange }))
    expect(screen.getByRole('radio', { name: 'All time' })).toBeChecked()
  })

  it('dates the period and counts the activities in it when some are left out', () => {
    render(picker({ choice: 42, dates: '12 May – 3 Aug 2025', shown: 3, total: 12 }))
    // The dates and the count are separate elements, so each is read on its own.
    expect(screen.getByText('12 May – 3 Aug 2025')).toBeInTheDocument()
    expect(screen.getByText('3 of 12 activities')).toBeInTheDocument()
  })

  it('shows only the dates when every activity is in the period', () => {
    render(picker({ dates: '12 May – 3 Aug 2025', shown: 4, total: 4 }))
    expect(screen.getByText('12 May – 3 Aug 2025')).toBeInTheDocument()
  })

  it('counts the sport on a sport page, in its own noun', () => {
    render(picker({ noun: 'run', dates: '1 Jun – 3 Aug 2025', shown: 5, total: 6 }))
    expect(screen.getByText('1 Jun – 3 Aug 2025')).toBeInTheDocument()
    expect(screen.getByText('5 of 6 runs')).toBeInTheDocument()
  })

  it('uses the singular for a single activity in the total', () => {
    render(picker({ choice: 42, shown: 0, total: 1 }))
    expect(screen.getByText('0 of 1 activity')).toBeInTheDocument()
  })

  it('says why the default is all time, under the dates', () => {
    render(
      picker({
        dates: '15 Aug 2015 – 16 Feb 2019',
        note: 'No 12 weeks holds both a run and a ride, so this is all time.',
      }),
    )
    expect(
      screen.getByText('No 12 weeks holds both a run and a ride, so this is all time.'),
    ).toBeInTheDocument()
  })

  it('announces the period, the count and the dates as the period changes', () => {
    const { rerender } = render(
      picker({ choice: 42, dates: '22 Jun – 3 Aug 2025', shown: 3, total: 12 }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing 3 of 12 activities, 6 weeks, 22 Jun – 3 Aug 2025',
    )
    rerender(picker({ choice: 'all', dates: '15 Aug 2015 – 3 Aug 2025', shown: 12, total: 12 }))
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing all 12 activities, All time, 15 Aug 2015 – 3 Aug 2025',
    )
  })

  it('keeps the pick the athlete made last, so a reply to an earlier pick cannot re-check a segment they left', () => {
    const { rerender } = render(picker({ choice: 'default' }))
    fireEvent.click(screen.getByRole('radio', { name: '6 weeks' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Default' }))

    // The 6-week answer lands after the Default pick: it must not move the control back.
    rerender(picker({ choice: 42 }))
    expect(screen.getByRole('radio', { name: 'Default' })).toBeChecked()

    // The answer to the Default pick settles it, and the page's choice is shown again.
    rerender(picker({ choice: 'default' }))
    expect(screen.getByRole('radio', { name: 'Default' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '6 weeks' })).not.toBeChecked()
  })

  it('says a pick waits for the current import, until the worker answers it', () => {
    const answers: Array<(reply: unknown) => void> = []
    const onChange = vi.fn((_choice: PeriodChoice, answered: (reply: unknown) => void) => {
      answers.push(answered)
    })
    const { rerender } = render(picker({ choice: 'default', busy: true, onChange }))
    fireEvent.click(screen.getByRole('radio', { name: '6 weeks' }))
    expect(screen.getByText('Applies when the current import finishes')).toBeInTheDocument()

    rerender(picker({ choice: 42, busy: true, onChange }))
    act(() => answers[0]?.(null))
    expect(screen.queryByText('Applies when the current import finishes')).not.toBeInTheDocument()
  })

  it('keeps the note’s space whether or not there is a note, so a note appearing does not move the page', () => {
    const { container } = render(picker({ dates: '12 May – 3 Aug 2025' }))
    expect(container.querySelector('.range-picker__note')).toBeInTheDocument()
  })

  it('announces zero activities plainly, with no "all 0"', () => {
    render(picker({ choice: 42, dates: '12 May – 3 Aug 2025', shown: 0, total: 0 }))
    expect(screen.getByRole('status')).toHaveTextContent(
      'No activities to show, 6 weeks, 12 May – 3 Aug 2025',
    )
  })

  it('follows only the answer to the latest pick, when three quick picks are answered in order', () => {
    // The page passes each pick its own answer, and the worker answers the picks in the order made.
    const answers: Array<(reply: unknown) => void> = []
    const onChange = vi.fn((_choice: PeriodChoice, answered: (reply: unknown) => void) => {
      answers.push(answered)
    })
    const { rerender } = render(picker({ choice: 'default', onChange }))
    fireEvent.click(screen.getByRole('radio', { name: '6 weeks' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Default' }))
    fireEvent.click(screen.getByRole('radio', { name: '6 weeks' }))

    // The answer to the first 6 weeks: the page now shows 6 weeks, which is the latest pick too.
    rerender(picker({ choice: 42, onChange }))
    act(() => answers[0]?.(null))
    expect(screen.getByRole('radio', { name: '6 weeks' })).toBeChecked()

    // The answer to Default: the latest pick is still 6 weeks, so Default must not be shown.
    rerender(picker({ choice: 'default', onChange }))
    act(() => answers[1]?.(null))
    expect(screen.getByRole('radio', { name: '6 weeks' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Default' })).not.toBeChecked()

    // The answer to the last 6 weeks settles it.
    rerender(picker({ choice: 42, onChange }))
    act(() => answers[2]?.(null))
    expect(screen.getByRole('radio', { name: '6 weeks' })).toBeChecked()
  })
})
