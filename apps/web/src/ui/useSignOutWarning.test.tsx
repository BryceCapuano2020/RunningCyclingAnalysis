// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { waitingCount } from '../worker/outbox'
import { useSignOutWarning } from './useSignOutWarning'

vi.mock('../worker/outbox', () => ({ waitingCount: vi.fn() }))
const unsentSets = vi.hoisted(() => vi.fn())
vi.mock('../worker/liftStore', () => ({
  openLiftStore: () => ({ pendingCount: unsentSets }),
}))

function Harness({ signOut, userId }: { signOut: () => void; userId?: string }) {
  const { requestSignOut, dialog } = useSignOutWarning(userId, signOut)
  return (
    <>
      <button onClick={requestSignOut}>Sign out</button>
      {dialog}
    </>
  )
}

beforeEach(() => {
  vi.mocked(waitingCount).mockReset()
  unsentSets.mockReset().mockResolvedValue(0)
})

describe('signing out with saves waiting', () => {
  it('signs out at once when nothing is waiting', async () => {
    vi.mocked(waitingCount).mockResolvedValue(0)
    const signOut = vi.fn()
    render(<Harness signOut={signOut} userId="u1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(signOut).toHaveBeenCalledOnce())
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('asks first, saying how many, and signs out only when the athlete agrees', async () => {
    vi.mocked(waitingCount).mockResolvedValue(3)
    const signOut = vi.fn()
    render(<Harness signOut={signOut} userId="u1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('3 activities from your last import are still waiting')
    expect(signOut).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('stays signed in when the athlete cancels', async () => {
    vi.mocked(waitingCount).mockResolvedValue(1)
    const signOut = vi.fn()
    render(<Harness signOut={signOut} userId="u1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('alertdialog')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(signOut).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('signs out at once when no account is known to hold saves', async () => {
    const signOut = vi.fn()
    render(<Harness signOut={signOut} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledOnce()
    expect(waitingCount).not.toHaveBeenCalled()
  })
})

describe('signing out with lifting sets not sent', () => {
  it('names them first, and signs out only when the athlete agrees', async () => {
    vi.mocked(waitingCount).mockResolvedValue(0)
    unsentSets.mockResolvedValue(3)
    const signOut = vi.fn()
    render(<Harness signOut={signOut} userId="u1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(
      '3 lifting sets are not sent yet. They are kept here for your next sign-in; another account signing in here removes them.',
    )
    expect(dialog).not.toHaveTextContent('activities')
    expect(signOut).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('says both when activities are waiting too', async () => {
    vi.mocked(waitingCount).mockResolvedValue(2)
    unsentSets.mockResolvedValue(1)
    render(<Harness signOut={vi.fn()} userId="u1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('2 activities from your last import are still waiting')
    expect(dialog).toHaveTextContent('1 lifting set is not sent yet. It is kept here')
  })
})
