// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiftSet } from '@rca/core/lift'
import type { AccountController } from '../useAccount'
import { LiftConnected } from './LiftConnected'
import { RailedLiftPage } from './RailedLiftPage'
import type { LoggedDay } from './liftDays'

const hook = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('./useLiftLog', () => ({ useLiftLog: () => hook.current }))

const TODAY = '2031-01-05'
const OTHER = '2031-01-04'

const set = (over: Partial<LiftSet> = {}): LiftSet => ({
  date: TODAY,
  exercise: 'back-squat',
  equipment: 'barbell',
  setOrder: 1,
  reps: 5,
  loadKg: 100,
  rpe: 8,
  ...over,
})
const logged = (date: string, ...sets: LiftSet[]): LoggedDay => ({
  date,
  lifts: sets.map((s) => ({
    key: `${s.exercise}.${s.equipment}` as never,
    exercise: s.exercise,
    equipment: s.equipment,
    sets: [{ key: `${date}|${s.exercise}|${s.equipment}|${s.setOrder}`, set: s, state: 'put' }],
  })),
})

const save = vi.fn()
const update = vi.fn()
const remove = vi.fn()
function useHook(days: LoggedDay[], over: Record<string, unknown> = {}) {
  hook.current = {
    days,
    sets: days.flatMap((d) => d.lifts.flatMap((l) => l.sets.map((entry) => entry.set))),
    save,
    update,
    remove,
    pendingCount: 0,
    recentLifts: days.flatMap((d) =>
      d.lifts.map((l) => ({ key: l.key, exercise: l.exercise, equipment: l.equipment })),
    ),
    ready: true,
    refused: 0,
    full: false,
    ...over,
  }
}
beforeEach(() => {
  save.mockReset().mockResolvedValue(set())
  update.mockReset().mockResolvedValue(set())
  remove.mockReset().mockResolvedValue(undefined)
})

const account = (status: string) =>
  ({
    status,
    me: null,
    refresh: async () => null,
    markExpired: () => undefined,
  }) as unknown as AccountController
const view = (day = TODAY, status = 'signed-out') => (
  <LiftConnected
    account={account(status)}
    units="metric"
    day={day}
    today={TODAY}
    openDay={() => undefined}
    settings={{ massKg: 80, bikeMassKg: 9 }}
  />
)

describe('the Lift page on the log', () => {
  it('opens the Hevy import in place of the buttons, and closes it on Cancel', async () => {
    useHook([])
    render(view())
    await userEvent.click(screen.getByRole('button', { name: 'Import from Hevy' }))
    expect(screen.getByLabelText(/Hevy workouts file/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Log a set' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Log a set' })).toBeTruthy()
  })

  it('stamps a set only on today, and dates it with the day shown', async () => {
    useHook([])
    const { unmount } = render(view(TODAY))
    await userEvent.click(screen.getByRole('button', { name: 'Log a set' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Lift' }), 'back squat')
    await userEvent.click(screen.getByRole('option', { name: 'Back squat' }))
    await userEvent.type(screen.getByLabelText('Reps'), '5')
    await userEvent.type(screen.getByLabelText('Load'), '100')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(save.mock.calls[0]?.[0]).toMatchObject({ date: TODAY, timePrecision: 'set' })
    expect(save.mock.calls[0]?.[0].time).toMatch(/^\d\d:\d\d$/)
    unmount()
    save.mockClear()
    render(view(OTHER))
    await userEvent.click(screen.getByRole('button', { name: 'Log a set' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Lift' }), 'back squat')
    await userEvent.click(screen.getByRole('option', { name: 'Back squat' }))
    await userEvent.type(screen.getByLabelText('Reps'), '5')
    await userEvent.type(screen.getByLabelText('Load'), '100')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const draft = save.mock.calls[0]?.[0]
    expect(draft.date).toBe(OTHER)
    expect(draft.time).toBeUndefined()
    expect(draft.setOrder).toBeUndefined()
  })

  it('starts from the last set of the lift with the equipment chosen', async () => {
    useHook([
      logged(OTHER, set({ date: OTHER, equipment: 'dumbbell', reps: 9, loadKg: 30, rpe: 7 })),
      logged('2031-01-03', set({ date: '2031-01-03', reps: 3 })),
    ])
    render(view())
    await userEvent.click(screen.getByRole('button', { name: 'Log a set' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Lift' }))
    await userEvent.click(
      within(screen.getByRole('listbox', { name: 'Lifts' })).getByRole('option', {
        name: 'Back squat, barbell',
      }),
    )
    expect(screen.getByLabelText('Reps')).toHaveValue('3')
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.click(
      within(screen.getByRole('listbox', { name: 'Lifts' })).getByRole('option', {
        name: 'Back squat, dumbbell',
      }),
    )
    expect(screen.getByLabelText('Reps')).toHaveValue('9')
    expect(screen.getByLabelText('Equipment')).toHaveValue('dumbbell')
    expect(screen.getByLabelText('Effort (RPE)')).toHaveValue('7')
  })

  it('keeps the values and says "Not saved" when a save returns null', async () => {
    useHook([logged(OTHER, set({ date: OTHER }))])
    save.mockResolvedValue(null)
    render(view())
    await userEvent.click(screen.getByRole('button', { name: 'Log a set' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Lift' }))
    await userEvent.click(
      within(screen.getByRole('listbox', { name: 'Lifts' })).getByRole('option', {
        name: 'Back squat, barbell',
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Not saved')).toBeInTheDocument()
    expect(screen.getByLabelText('Reps')).toHaveValue('5')
  })

  it('edits through update, keeps the form open on a refusal and closes it on success', async () => {
    useHook([logged(TODAY, set())])
    update.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('x'))
    render(view())
    await userEvent.click(screen.getByRole('button', { name: /^Edit set 1 of / }))
    await userEvent.selectOptions(screen.getByLabelText('Equipment'), 'dumbbell')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ equipment: 'barbell' }),
      expect.objectContaining({ equipment: 'dumbbell', reps: 5 }),
    )
    expect(await screen.findByText('Not saved')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Not saved')).toBeInTheDocument()
    expect(screen.getByLabelText('Reps')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.queryByLabelText('Reps')).toBeNull())
  })

  it('deletes through remove', async () => {
    useHook([logged(TODAY, set())])
    render(view())
    await userEvent.click(screen.getByRole('button', { name: /^Edit set 1 of / }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(remove).toHaveBeenCalledWith(`${TODAY}|back-squat|barbell|1`)
  })

  it('closes the edit form when another tab removes the set', async () => {
    useHook([logged(TODAY, set())])
    const { rerender } = render(view())
    await userEvent.click(screen.getByRole('button', { name: /^Edit set 1 of / }))
    expect(screen.getByLabelText('Reps')).toBeInTheDocument()
    useHook([])
    rerender(view())
    expect(screen.queryByLabelText('Reps')).toBeNull()
    expect(screen.getByRole('button', { name: 'Log a set' })).toBeInTheDocument()
  })

  it('shows status rows signed in only', () => {
    useHook([], { pendingCount: 3 })
    const { unmount } = render(view(TODAY, 'signed-out'))
    expect(screen.queryByText('Not sent yet')).toBeNull()
    unmount()
    render(view(TODAY, 'signed-in'))
    expect(screen.getByText('Not sent yet')).toBeInTheDocument()
  })

  it('lists 12 earlier sessions, with Show more only past 12', async () => {
    const days = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        logged(`2030-12-${String(30 - i).padStart(2, '0')}`, set({ date: '2030-12-01' })),
      )
    useHook(days(12))
    const { unmount } = render(view())
    const list = () => within(screen.getByRole('region', { name: 'Earlier sessions' }))
    expect(list().getAllByRole('listitem')).toHaveLength(12)
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
    unmount()
    useHook(days(13))
    render(view())
    expect(list().getAllByRole('listitem')).toHaveLength(12)
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(list().getAllByRole('listitem')).toHaveLength(13)
  })
})

describe('the lead and the lifts list', () => {
  it('lead with the big three once one has an estimate, above the day, and list every lift in a table', () => {
    useHook([logged(TODAY, set())])
    render(view())
    const lead = screen.getByTestId('big-three-squat')
    // The others are not logged yet: each offers its own log.
    expect(screen.getByRole('button', { name: 'Log a bench' })).toBeInTheDocument()
    const day = screen.getByRole('button', { name: 'Log a set' })
    expect(lead.compareDocumentPosition(day) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Your lifts' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Weekly load' })).toBeInTheDocument()
  })

  it('shows neither before any lift has an estimate', () => {
    useHook([])
    render(view())
    expect(screen.queryByTestId('big-three-squat')).toBeNull()
    expect(screen.queryByTestId('lift-max')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Weekly load' })).toBeNull()
  })
})

describe('leaving an edit', () => {
  it('closes the set with Done, and a move to another day opens that day', async () => {
    useHook([logged(TODAY, set())])
    const openDay = vi.fn()
    render(
      <LiftConnected
        account={account('signed-out')}
        units="metric"
        day={TODAY}
        today={TODAY}
        openDay={openDay}
        settings={{ massKg: 80, bikeMassKg: 9 }}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^Edit set 1 of / }))
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('button', { name: /^Edit set 1 of / })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Earlier day' }))
    expect(openDay).toHaveBeenCalledWith(OTHER)
  })
})

describe('the Lift page in the shell', () => {
  it('draws the rail beside the log, with Lift among the pages', () => {
    useHook([])
    render(
      <RailedLiftPage
        account={account('signed-out')}
        units="metric"
        day={TODAY}
        today={TODAY}
        openDay={() => undefined}
        settings={{ massKg: 80, bikeMassKg: 9 }}
      />,
    )
    expect(screen.getByRole('link', { name: 'Lift' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lifting' })).toBeInTheDocument()
  })
})
