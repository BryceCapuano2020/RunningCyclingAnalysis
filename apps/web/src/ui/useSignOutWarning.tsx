import { useState } from 'react'
import type { ReactNode } from 'react'
import { unsentLifts } from '../worker/liftCounts'
import { waitingCount } from '../worker/outbox'
import { ConfirmDialog } from './components/ConfirmDialog'
import { plural } from './components/plural'

/**
 * Signing out clears what the browser kept for the account, including activities from an import that are still
 * waiting to be saved to it. When there are any, signing out asks first and says how many, so nothing is lost
 * without a word. Lifting sets not sent yet are named too, though they wait for the next sign-in. Otherwise it
 * signs out at once.
 */
export function useSignOutWarning(
  userId: string | undefined,
  signOut: () => void,
): { requestSignOut: () => void; dialog: ReactNode } {
  const [asking, setAsking] = useState<{
    count: number
    sets: number
    opener: HTMLElement | null
  } | null>(null)
  const requestSignOut = () => {
    const active = document.activeElement
    const opener = active instanceof HTMLElement ? active : null
    if (userId === undefined) return signOut()
    void Promise.all([waitingCount(userId), unsentLifts(userId).catch(() => 0)]).then(
      ([count, sets]) => {
        if (count > 0 || sets > 0) setAsking({ count, sets, opener })
        else signOut()
      },
    )
  }
  const dialog = (
    <ConfirmDialog
      open={asking !== null}
      title="Sign out with saves waiting?"
      description={[
        asking?.count
          ? `${plural(asking.count, 'activity', 'activities')} from your last import ${asking.count === 1 ? 'is' : 'are'} still waiting to be saved to your account. If you sign out now they are not saved: add their files again after you sign in.`
          : '',
        asking?.sets
          ? `${plural(asking.sets, 'lifting set')} ${asking.sets === 1 ? 'is' : 'are'} not sent yet. ${asking.sets === 1 ? 'It is' : 'They are'} kept here for your next sign-in; another account signing in here removes ${asking.sets === 1 ? 'it' : 'them'}.`
          : '',
      ]
        .filter((text) => text !== '')
        .join(' ')}
      confirmLabel="Sign out"
      opener={asking?.opener ?? null}
      onConfirm={() => {
        setAsking(null)
        signOut()
      }}
      onClose={() => setAsking(null)}
    />
  )
  return { requestSignOut, dialog }
}
