// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  it('offers 6 weeks, 12 weeks, 12 months and all time, in a group named Period, in that order', () => {
    render(picker())
    const group = screen.getByRole('group', { name: 'Period' })
    expect(
      within(group)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['6 weeks', '12 weeks', '12 months', 'All time'])
  })

  it('checks the segment for the choice on screen', () => {
    const { unmount } = render(picker({ choice: 'default' }))
    expect(screen.getByRole('radio', { name: '12 weeks' })).toBeChecked()
    unmount()
    render(picker({ choice: 365 }))
    expect(screen.getByRole('radio', { name: '12 months' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '12 weeks' })).not.toBeChecked()
  })

  it('reports the choice of the segment picked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(choice: PeriodChoice) => void>()
    render(picker({ onChange }))
    await user.click(screen.getByRole('radio', { name: '6 weeks' }))
    expect(onChange).toHaveBeenLastCalledWith(42, expect.any(Function))
    await user.click(screen.getByRole('radio', { name: 'All time' }))
    expect(onChange).toHaveBeenLastCalledWith('all', expect.any(Function))
    await user.click(screen.getByRole('radio', { name: '12 weeks' }))
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

  it('groups the shown count and the total from a thousand on', () => {
    render(picker({ choice: 42, dates: '12 May – 3 Aug 2025', shown: 1001, total: 1234 }))
    expect(screen.getByText('1,001 of 1,234 activities')).toBeInTheDocument()
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

  it('announces a count of a thousand or more with its grouping', () => {
    render(picker({ choice: 42, dates: '22 Jun – 3 Aug 2025', shown: 1001, total: 1234 }))
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing 1,001 of 1,234 activities, 6 weeks, 22 Jun – 3 Aug 2025',
    )
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
    fireEvent.click(screen.getByRole('radio', { name: '12 weeks' }))

    // The 6-week answer lands after the 12-week pick: it must not move the control back.
    rerender(picker({ choice: 42 }))
    expect(screen.getByRole('radio', { name: '12 weeks' })).toBeChecked()

    // The answer to the 12-week pick settles it, and the page's choice is shown again.
    rerender(picker({ choice: 'default' }))
    expect(screen.getByRole('radio', { name: '12 weeks' })).toBeChecked()
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

  it('renders no note line when there is nothing to say, so an empty line takes no room', () => {
    const { container } = render(picker({ dates: '12 May – 3 Aug 2025' }))
    expect(container.querySelector('.range-picker__note')).toBeNull()
  })

  it('puts the note straight under the dates, in the same control', () => {
    const { container } = render(
      picker({ dates: '12 May – 3 Aug 2025', note: 'Latest activity 3 Jun 2025, 17 months ago' }),
    )
    const caption = container.querySelector('.range-picker__caption')
    const note = container.querySelector('.range-picker__note')
    expect(note).toHaveTextContent('Latest activity 3 Jun 2025, 17 months ago')
    expect(caption?.compareDocumentPosition(note as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
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
    fireEvent.click(screen.getByRole('radio', { name: '12 weeks' }))
    fireEvent.click(screen.getByRole('radio', { name: '6 weeks' }))

    // The answer to the first 6 weeks: the page now shows 6 weeks, which is the latest pick too.
    rerender(picker({ choice: 42, onChange }))
    act(() => answers[0]?.(null))
    expect(screen.getByRole('radio', { name: '6 weeks' })).toBeChecked()

    // The answer to the 12-week pick: the latest pick is still 6 weeks, so 12 weeks must not be shown.
    rerender(picker({ choice: 'default', onChange }))
    act(() => answers[1]?.(null))
    expect(screen.getByRole('radio', { name: '6 weeks' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '12 weeks' })).not.toBeChecked()

    // The answer to the 6-week pick settles it.
    rerender(picker({ choice: 42, onChange }))
    act(() => answers[2]?.(null))
    expect(screen.getByRole('radio', { name: '6 weeks' })).toBeChecked()
  })
})

describe('RangePicker dates line', () => {
  it('renders no caption line when there are no dates and nothing is left out, so an empty line takes no room', () => {
    const { container } = render(picker({ dates: '', shown: 5, total: 5 }))
    expect(container.querySelector('.range-picker__caption')).toBeNull()
  })
})

describe('RangePicker keeps the pressed control on screen', () => {
  // The control's top edge, as the layout reports it; a test moves it to stand for a longer or shorter lede.
  let top = 400
  beforeEach(() => {
    top = 400
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          top,
          bottom: top + 40,
          left: 0,
          right: 0,
          height: 40,
          width: 0,
          x: 0,
          y: top,
        }) as DOMRect,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function pickThenAnswer(startTop: number, endTop: number) {
    const answers: Array<(reply: unknown) => void> = []
    const onChange = vi.fn((_choice: PeriodChoice, answered: (reply: unknown) => void) => {
      answers.push(answered)
    })
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    const { rerender } = render(picker({ choice: 'default', dates: 'before', onChange }))
    top = startTop
    fireEvent.click(screen.getByRole('radio', { name: '6 weeks' }))
    // The answer changes the dates, and so the height of the text above the control.
    top = endTop
    rerender(picker({ choice: 42, dates: 'after', onChange }))
    expect(scrollBy).not.toHaveBeenCalled()
    act(() => answers[0]?.(null))
    return scrollBy
  }

  it('scrolls the page by the distance the control moved, once the answer lands', () => {
    expect(pickThenAnswer(400, 427)).toHaveBeenCalledWith(0, 27)
  })

  it('scrolls back up when the text above the control gets shorter', () => {
    expect(pickThenAnswer(400, 371)).toHaveBeenCalledWith(0, -29)
  })

  it('leaves the page alone when the control was out of view at the pick', () => {
    expect(pickThenAnswer(900, 927)).not.toHaveBeenCalled()
  })

  it('leaves the page alone when the control did not move', () => {
    expect(pickThenAnswer(400, 400)).not.toHaveBeenCalled()
  })
})

describe('RangePicker custom range', () => {
  const RANGE = { from: '2025-05-12', to: '2025-06-03' }

  function withCustom(props: Partial<RangePickerProps> = {}) {
    return picker({ custom: true, range: RANGE, dates: '12 May – 3 Jun 2025', ...props })
  }

  it('offers Custom after All time only where the page offers it', () => {
    const { unmount } = render(withCustom())
    expect(
      within(screen.getByRole('group', { name: 'Period' }))
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['6 weeks', '12 weeks', '12 months', 'All time', 'Custom'])
    unmount()
    render(picker())
    expect(screen.queryByRole('radio', { name: 'Custom' })).toBeNull()
  })

  it('shows From and To, prefilled with the period on screen, when Custom is picked, and applies nothing yet', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(withCustom({ onChange }))
    await user.click(screen.getByRole('radio', { name: 'Custom' }))
    expect(screen.getByRole('radio', { name: 'Custom' })).toBeChecked()
    expect(screen.getByLabelText('From')).toHaveValue(RANGE.from)
    expect(screen.getByLabelText('To')).toHaveValue(RANGE.to)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('applies the range on Apply, and not on each change to a date', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(withCustom({ onChange }))
    await user.click(screen.getByRole('radio', { name: 'Custom' }))
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2025-04-01' } })
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(
      { from: '2025-04-01', to: RANGE.to },
      expect.any(Function),
    )
  })

  it('applies the days in order when the last day is before the first', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(withCustom({ onChange }))
    await user.click(screen.getByRole('radio', { name: 'Custom' }))
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2025-06-03' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2025-05-12' } })
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledWith(RANGE, expect.any(Function))
  })

  it('does not apply a range with a date left empty', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(withCustom({ onChange, range: null }))
    await user.click(screen.getByRole('radio', { name: 'Custom' }))
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('checks Custom for a custom range on screen, with its form open', () => {
    render(withCustom({ choice: RANGE }))
    expect(screen.getByRole('radio', { name: 'Custom' })).toBeChecked()
    expect(screen.getByLabelText('From')).toHaveValue(RANGE.from)
  })

  it('keeps the form closed when a state with the same custom range arrives after a fixed pick', async () => {
    const user = userEvent.setup()
    const { rerender } = render(withCustom({ choice: RANGE }))
    await user.click(screen.getByRole('radio', { name: '12 weeks' }))
    expect(screen.queryByLabelText('From')).toBeNull()
    // The worker answers with the same range as a new object, as it does on every state.
    rerender(withCustom({ choice: { ...RANGE } }))
    expect(screen.queryByLabelText('From')).toBeNull()
  })

  it('does not apply a date the core refuses, such as a year before 0100', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(withCustom({ onChange, range: null }))
    await user.click(screen.getByRole('radio', { name: 'Custom' }))
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '0099-01-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2025-06-03' } })
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    expect(screen.getByText('Pick dates from the year 100 on.')).toBeVisible()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('closes the form when a fixed period is picked', async () => {
    const user = userEvent.setup()
    render(withCustom())
    await user.click(screen.getByRole('radio', { name: 'Custom' }))
    await user.click(screen.getByRole('radio', { name: '12 weeks' }))
    expect(screen.queryByLabelText('From')).toBeNull()
  })
})
