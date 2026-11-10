// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissedOffer } from '../analysis/offerDismissal'
import { DeviceOffer } from './DeviceOffer'
import type { DeviceOfferProps } from './DeviceOffer'

const ACCOUNT = { userId: 'u1', email: 'ada@example.com' }

function setup(over: Partial<DeviceOfferProps> = {}) {
  const props: DeviceOfferProps = {
    offer: { adoptable: 3, again: 0, held: 0 },
    adoption: null,
    account: ACCOUNT,
    busy: false,
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onDismissResult: vi.fn(),
    runThenFocus: (action) => action(),
    ...over,
  }
  const view = render(<DeviceOffer {...props} />)
  return { props, view }
}

beforeEach(() => {
  localStorage.clear()
})

describe('the offer of what this browser kept', () => {
  it('asks to add them to the account it names', () => {
    setup()
    const section = screen.getByRole('region', { name: 'Activities kept in this browser' })
    expect(section).toHaveTextContent('Add them to ada@example.com?')
  })

  it('shows nothing when nothing is kept', () => {
    setup({ offer: { adoptable: 0, again: 0, held: 0 } })
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('still says what cannot be added, and offers to remove it, when nothing can be added', async () => {
    const { props } = setup({ offer: { adoptable: 0, again: 2, held: 1 } })
    const section = screen.getByRole('region', { name: 'Activities kept in this browser' })
    expect(section).toHaveTextContent('None can be added to ada@example.com.')
    expect(section).toHaveTextContent('2 activities need their files added again.')
    expect(section).toHaveTextContent('1 activity is in your account already.')
    expect(screen.queryByRole('button', { name: 'Add to my account' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Remove from this browser' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(props.onRemove).toHaveBeenCalledOnce()
  })

  it('adds them on Add', async () => {
    const { props } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Add to my account' }))
    expect(props.onAdd).toHaveBeenCalledOnce()
  })

  it('does not add while the page is busy', async () => {
    const { props } = setup({ busy: true })
    await userEvent.click(screen.getByRole('button', { name: 'Add to my account' }))
    expect(props.onAdd).not.toHaveBeenCalled()
  })

  it('goes away on Not now, and does not ask again for the same number', async () => {
    const { view, props } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('region')).toBeNull()
    expect(dismissedOffer('u1')).toBe('3:0')

    view.unmount()
    render(<DeviceOffer {...props} />)
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('asks again when more were kept since', async () => {
    const { view, props } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    view.unmount()

    render(<DeviceOffer {...props} offer={{ adoptable: 3, again: 1, held: 0 }} />)

    expect(screen.getByRole('region')).toHaveTextContent('3 activities')
  })

  it('asks before it removes them from this browser, and counts all it removes', async () => {
    const { props } = setup({ offer: { adoptable: 2, again: 1, held: 1 } })
    await userEvent.click(screen.getByRole('button', { name: 'Remove from this browser' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('4 activities kept here')
    expect(props.onRemove).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(props.onRemove).toHaveBeenCalledOnce()
  })

  it('removes nothing when the question is cancelled', async () => {
    const { props } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Remove from this browser' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(props.onRemove).not.toHaveBeenCalled()
  })
})

describe('how adding them ended', () => {
  it('says what was added and what stays, and can be put away', async () => {
    const { props } = setup({
      offer: { adoptable: 0, again: 0, held: 0 },
      adoption: { saved: 2, conflicts: 1, failed: 0, again: 0, held: 0 },
    })
    expect(screen.getByText(/Added 2 activities to your account\./)).toBeInTheDocument()
    expect(screen.getByText(/1 activity already differs/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(props.onDismissResult).toHaveBeenCalledOnce()
  })
})

describe('lifting sets kept in this browser', () => {
  it('offers lifting sets alone, and Add runs', async () => {
    const { props } = setup({ offer: { adoptable: 0, again: 0, held: 0 }, lifts: 12 })
    const section = screen.getByRole('region', { name: 'Lifting sets kept in this browser' })
    expect(section).toHaveTextContent(
      'This browser kept 12 lifting sets from before you signed in.',
    )
    expect(section).toHaveTextContent('Add them to ada@example.com?')
    expect(section).not.toHaveTextContent('Routes')
    await userEvent.click(screen.getByRole('button', { name: 'Add to my account' }))
    expect(props.onAdd).toHaveBeenCalledOnce()
  })

  it('names activities and lifting sets in one question', async () => {
    setup({ lifts: 12 })
    const section = screen.getByRole('region', { name: 'Activities kept in this browser' })
    expect(section).toHaveTextContent('kept 3 activities and 12 lifting sets from before')
  })

  it('counts the sets in what Remove removes', async () => {
    setup({ lifts: 4 })
    await userEvent.click(screen.getByRole('button', { name: 'Remove from this browser' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      '3 activities and 4 lifting sets kept here',
    )
  })

  it('says how adding them ended', () => {
    setup({
      offer: null,
      liftResult: {
        sent: 5,
        skipped: 2,
        refused: 0,
        capped: 1,
        held: 0,
        unauthorized: false,
        done: true,
        total: 5,
      },
    })
    expect(
      screen.getByText(
        /Added 3 lifting sets to your account\. 2 lifting sets were in your account already\. 1 lifting set did not fit in your account and stays in this browser\./,
      ),
    ).toBeInTheDocument()
  })

  it('waits until the lifting sets and the activities are both counted', () => {
    setup({ lifts: null })
    expect(screen.queryByRole('region')).toBeNull()
    setup({ offer: null, lifts: 5 })
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('asks again when the same total is made of other things', async () => {
    const { view, props } = setup({ offer: { adoptable: 3, again: 0, held: 0 }, lifts: 0 })
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    view.unmount()
    render(<DeviceOffer {...props} offer={{ adoptable: 0, again: 0, held: 0 }} lifts={3} />)
    expect(screen.getByRole('region')).toHaveTextContent('3 lifting sets')
  })

  it('says one thing when both ended, and never "Nothing was added" beside a lift result', () => {
    setup({
      offer: null,
      adoption: { saved: 0, conflicts: 0, failed: 0, again: 0, held: 0 },
      liftResult: {
        sent: 2,
        skipped: 0,
        refused: 0,
        capped: 0,
        held: 0,
        unauthorized: false,
        done: true,
        total: 2,
      },
    })
    expect(screen.getByText('Added 2 lifting sets to your account.')).toBeInTheDocument()
    expect(screen.queryByText(/Nothing was added/)).toBeNull()
  })

  it('counts sets a stopped run never reached, and names refused ones as removed', () => {
    setup({
      offer: null,
      liftResult: {
        sent: 1,
        skipped: 0,
        refused: 1,
        capped: 0,
        held: 1,
        unauthorized: false,
        done: false,
        total: 6,
      },
    })
    expect(
      screen.getByText(
        /Added 1 lifting set to your account\. 4 lifting sets could not be sent yet and stay in this browser\. Try again\. 1 lifting set was not valid and was removed\./,
      ),
    ).toBeInTheDocument()
  })
})
