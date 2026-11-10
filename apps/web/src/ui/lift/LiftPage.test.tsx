// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiftPage } from './LiftPage'
import type { LiftPageProps } from './LiftPage'
import type { LiftOfDay } from './liftPageTypes'

afterEach(cleanup)

const TODAY = '2026-03-10'

const squat: LiftOfDay = {
  name: 'Back squat',
  equipment: 'barbell',
  sets: [
    { key: 's1', reps: 8, loadKg: 60, warmup: true },
    { key: 's2', reps: 5, loadKg: 100, rpe: 8 },
  ],
}
const pullUp: LiftOfDay = {
  name: 'Pull-up',
  equipment: 'bodyweight',
  sets: [{ key: 'p1', reps: 10, loadKg: 0 }],
}

function props(over: Partial<LiftPageProps> = {}): LiftPageProps {
  return {
    day: TODAY,
    today: TODAY,
    lifts: [squat, pullUp],
    earlier: [
      { day: '2026-03-08', lifts: ['Back squat', 'Bench press'] },
      { day: '2026-03-02', lifts: ['Deadlift'] },
    ],
    status: null,
    units: 'metric',
    editingKey: null,
    onDay: vi.fn(),
    onLog: vi.fn(),
    onEditSet: vi.fn(),
    ...over,
  }
}

describe('LiftPage', () => {
  it('has the title, the day, and the one primary button', () => {
    render(<LiftPage {...props()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Lifting' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Today' })).toBeInTheDocument()
    const primary = screen.getByRole('button', { name: 'Log a set' })
    expect(primary).toHaveClass('btn-primary')
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1)
  })

  it('heads each lift with its name and equipment, and gives no meta line', () => {
    const { container } = render(<LiftPage {...props()} />)
    expect(screen.getByRole('heading', { name: 'Back squat, barbell' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pull-up, bodyweight' })).toBeInTheDocument()
    expect(container.querySelector('.lift__lift .meta')).toBeNull()
  })

  it('labels sets by position and states each as load by reps', () => {
    render(<LiftPage {...props()} />)
    const squatSection = screen
      .getByRole('heading', { name: 'Back squat, barbell' })
      .closest('section')!
    expect(within(squatSection).getByText('60 kg × 8 · warm-up')).toBeInTheDocument()
    expect(within(squatSection).getByText('100 kg × 5 · RPE 8')).toBeInTheDocument()
    expect(within(squatSection).getByRole('button', { name: 'Edit set 2' })).toHaveTextContent(
      'Set 2',
    )
    expect(screen.getByText('Bodyweight × 10')).toBeInTheDocument()
  })

  it('numbers by position, whatever the stored order', () => {
    const lift = { ...squat, sets: [{ key: 'k7', reps: 5, loadKg: 90 }] }
    render(<LiftPage {...props({ lifts: [lift] })} />)
    expect(screen.getByRole('button', { name: 'Edit set 1' })).toHaveTextContent('Set 1')
  })

  it('shows loads in pounds for an imperial profile', () => {
    render(<LiftPage {...props({ units: 'imperial', lifts: [squat] })} />)
    expect(screen.getByText('220.5 lb × 5 · RPE 8')).toBeInTheDocument()
  })

  it('opens a set from its label button, with the set’s key', async () => {
    const onEditSet = vi.fn()
    render(<LiftPage {...props({ onEditSet })} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit set 1' })[0]!)
    expect(onEditSet).toHaveBeenCalledWith('s1')
  })

  it('puts the row form in place of the edited row and draws no "Log a set"', () => {
    render(<LiftPage {...props({ editingKey: 's1', rowForm: <p>Row form</p> })} />)
    expect(screen.getByText('Row form')).toBeInTheDocument()
    expect(screen.queryByText('60 kg × 8 · warm-up')).toBeNull()
    expect(screen.getByText('100 kg × 5 · RPE 8')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log a set' })).toBeNull()
  })

  it('shows the new-set form under the button slot and draws no "Log a set" while it is open', () => {
    render(<LiftPage {...props({ form: <p>New form</p> })} />)
    expect(screen.getByText('New form')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log a set' })).toBeNull()
  })

  it('calls onLog from the primary button', async () => {
    const onLog = vi.fn()
    render(<LiftPage {...props({ onLog })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Log a set' }))
    expect(onLog).toHaveBeenCalledOnce()
  })

  it('says "No sets" for an empty day and keeps the button', () => {
    render(<LiftPage {...props({ lifts: [] })} />)
    expect(screen.getByText('No sets')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log a set' })).toBeInTheDocument()
  })

  it('shows each status row only when it applies, and none signed out', () => {
    const { rerender } = render(<LiftPage {...props({ status: null })} />)
    expect(screen.queryByText('Not sent yet')).toBeNull()
    rerender(<LiftPage {...props({ status: { notSent: 0, refused: 0, full: false } })} />)
    for (const name of ['Not sent yet', 'Refused', 'Account full'])
      expect(screen.queryByText(name)).toBeNull()
    rerender(<LiftPage {...props({ status: { notSent: 3, refused: 1, full: true } })} />)
    expect(screen.getByText('Not sent yet').nextSibling).toHaveTextContent('3 sets')
    expect(screen.getByText('Refused').nextSibling).toHaveTextContent('1 set')
    expect(screen.getByText('Account full')).toBeInTheDocument()
  })

  it('lists earlier sessions as numbered rows that open their day, with the lifts as a meta line', async () => {
    const onDay = vi.fn()
    render(<LiftPage {...props({ onDay })} />)
    const list = within(
      screen.getByRole('heading', { name: 'Earlier sessions' }).closest('section')!,
    ).getByRole('list')
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Back squat, Bench press')
    await userEvent.click(within(rows[1]!).getByRole('button'))
    expect(onDay).toHaveBeenCalledWith('2026-03-02')
  })

  it('offers "Show more" only when the caller can give more', async () => {
    const onMore = vi.fn()
    const { rerender } = render(<LiftPage {...props()} />)
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
    rerender(<LiftPage {...props({ onMore })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(onMore).toHaveBeenCalledOnce()
  })

  it('draws no earlier sessions with none', () => {
    render(<LiftPage {...props({ earlier: [] })} />)
    expect(screen.queryByRole('heading', { name: 'Earlier sessions' })).toBeNull()
  })

  it('steps a day back or forward, and has no "Later day" on today', async () => {
    const onDay = vi.fn()
    const { rerender } = render(<LiftPage {...props({ onDay })} />)
    expect(screen.queryByRole('button', { name: 'Later day' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Earlier day' }))
    expect(onDay).toHaveBeenLastCalledWith('2026-03-09')
    rerender(<LiftPage {...props({ onDay, day: '2026-03-05' })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Later day' }))
    expect(onDay).toHaveBeenLastCalledWith('2026-03-06')
  })

  it('names yesterday, and an earlier day by its date', () => {
    const { rerender } = render(<LiftPage {...props({ day: '2026-03-09' })} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Yesterday' })).toBeInTheDocument()
    rerender(<LiftPage {...props({ day: '2026-03-04' })} />)
    expect(screen.getByRole('heading', { level: 2, name: /4 Mar/ })).toBeInTheDocument()
  })

  it('moves focus to the day heading when "Later day" leaves with today', async () => {
    const { rerender } = render(<LiftPage {...props({ day: '2026-03-09' })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Later day' }))
    rerender(<LiftPage {...props({ day: TODAY })} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Today' })).toHaveFocus()
  })

  it('moves focus to the next set after a delete, else the lift heading', () => {
    const { rerender } = render(<LiftPage {...props({ editingKey: 's1', rowForm: <p>f</p> })} />)
    const without = { ...squat, sets: [squat.sets[1]!] }
    rerender(<LiftPage {...props({ editingKey: null, lifts: [without, pullUp] })} />)
    expect(screen.getAllByRole('button', { name: 'Edit set 1' })[0]).toHaveFocus()
  })

  it('moves focus to the lift heading after deleting its last set in the list', () => {
    const { rerender } = render(<LiftPage {...props({ editingKey: 's2', rowForm: <p>f</p> })} />)
    rerender(
      <LiftPage
        {...props({ editingKey: null, lifts: [{ ...squat, sets: [squat.sets[0]!] }, pullUp] })}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Back squat, barbell' })).toHaveFocus()
  })

  it('draws a closed form slot (false) as no form', () => {
    render(<LiftPage {...props({ form: false, rowForm: false })} />)
    expect(screen.getByRole('button', { name: 'Log a set' })).toBeInTheDocument()
  })

  it('moves focus to the day heading when the only set of the only lift is deleted', () => {
    const only = { ...pullUp }
    const { rerender } = render(
      <LiftPage {...props({ lifts: [only], editingKey: 'p1', rowForm: <p>f</p> })} />,
    )
    rerender(<LiftPage {...props({ lifts: [], editingKey: null })} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Today' })).toHaveFocus()
  })

  it('returns focus to the row button after Cancel or Save', () => {
    const { rerender } = render(<LiftPage {...props({ editingKey: 's2', rowForm: <p>f</p> })} />)
    rerender(<LiftPage {...props({ editingKey: null })} />)
    expect(screen.getAllByRole('button', { name: 'Edit set 2' })[0]).toHaveFocus()
  })

  it('does not move focus when the day changes with a form open', () => {
    const { rerender } = render(<LiftPage {...props({ editingKey: 's2', rowForm: <p>f</p> })} />)
    rerender(
      <LiftPage {...props({ day: '2026-03-09', today: TODAY, lifts: [], editingKey: null })} />,
    )
    expect(document.body).toHaveFocus()
  })

  it('announces a refusal or a full account as a status', () => {
    const { rerender } = render(
      <LiftPage {...props({ status: { notSent: 2, refused: 0, full: false } })} />,
    )
    expect(screen.queryByRole('status')).toBeNull()
    rerender(<LiftPage {...props({ status: { notSent: 0, refused: 1, full: false } })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Refused')
  })

  it('has no word "strength" in its text', () => {
    const { container } = render(
      <LiftPage {...props({ status: { notSent: 2, refused: 1, full: true }, onMore: vi.fn() })} />,
    )
    expect(container.textContent?.toLowerCase()).not.toContain('strength')
  })
})
