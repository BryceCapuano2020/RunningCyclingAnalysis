import { useState } from 'react'
import type { ReactNode } from 'react'
import { waitingCount } from '../worker/outbox'
import { ConfirmDialog } from './components/ConfirmDialog'
import { plural } from './components/plural'

/**
 * Signing out clears what the browser kept for the account, including activities from an import that are still
 * waiting to be saved to it. When there are any, signing out asks first and says how many, so nothing is lost
 * without a word. Otherwise it signs out at once.
 */
export function useSignOutWarning(
  userId: string | undefined,
  signOut: () => void,
): { requestSignOut: () => void; dialog: ReactNode } {
  const [asking, setAsking] = useState<{ count: number; opener: HTMLElement | null } | null>(null)
  const requestSignOut = () => {
    const active = document.activeElement
    const opener = active instanceof HTMLElement ? active : null
    if (userId === undefined) return signOut()
    void waitingCount(userId).then((count) => {
      if (count > 0) setAsking({ count, opener })
      else signOut()
    })
  }
  const dialog = (
    <ConfirmDialog
      open={asking !== null}
      title="Sign out with saves waiting?"
      description={`${plural(asking?.count ?? 0, 'activity', 'activities')} from your last import ${asking?.count === 1 ? 'is' : 'are'} still waiting to be saved to your account. If you sign out now they are not saved: add their files again after you sign in.`}
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
