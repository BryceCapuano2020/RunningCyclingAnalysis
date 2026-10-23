import { useEffect, useId, useRef, useState } from 'react'
import type { Me } from '@rca/contract'
import { saveAccountExport } from '../../export/saveExport'
import { DeleteAccountDialog } from './DeleteAccountDialog'
import { GoogleSignInButton } from './GoogleSignInButton'
import './AccountMenu.css'

export type AccountStatus = 'loading' | 'signed-out' | 'signed-in' | 'unavailable'

export interface AccountMenuProps {
  status: AccountStatus
  me: Me | null
  onSignIn: () => void
  onSignOut: () => void
  onDeleteAccount: () => Promise<void>
  /** Resolves with the account's data as a JSON file. Without it the menu has no download item. */
  onDownloadData?: () => Promise<Blob>
}

/** The first word of the name, or the part of the email before the @ when there is no name. */
function firstNameOf(me: Me): string {
  const [first] = me.user.name.trim().split(/\s+/)
  if (first) return first
  const [local] = me.user.email.split('@')
  return local || me.user.email
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not download your data.'
}

/** First and last initials of the name, or the first letter of the email when there is no name. */
function initialsOf(me: Me): string {
  const words = me.user.name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '')
  const ends = words.length > 1 ? [words.at(0), words.at(-1)] : [words.at(0)]
  const letters = ends.map((word) => word?.charAt(0) ?? '').join('')
  return (letters || me.user.email.charAt(0)).toUpperCase()
}

/**
 * The header's account control. Signed out it offers Google sign-in. Signed in it is a disclosure
 * button that opens the email, sign out, the data download and account deletion. A placeholder of
 * the same height holds the space while the session loads, and nothing renders when accounts are
 * unavailable.
 */
export function AccountMenu({
  status,
  me,
  onSignIn,
  onSignOut,
  onDeleteAccount,
  onDownloadData,
}: AccountMenuProps) {
  const panelId = `${useId()}-panel`
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const signInRef = useRef<HTMLButtonElement>(null)
  const previousStatus = useRef(status)
  const [open, setOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  // State updates are not visible until the next render, so a second click in the same render
  // would still start an export. The ref is set at once.
  const exportingRef = useRef(false)

  const menuOpen = open && status === 'signed-in' && me !== null

  // Signing out or deleting the account removes the trigger, which would drop focus to the body.
  // Put it on the sign-in button that replaces it.
  useEffect(() => {
    const was = previousStatus.current
    previousStatus.current = status
    if (was === 'signed-in' && status === 'signed-out') signInRef.current?.focus()
  }, [status])

  // While the menu is open, the document handles the ways it closes: a press outside, focus moving
  // out, and Escape. Escape returns focus to the trigger. The wrapper itself has no role, so it
  // carries no key or focus handlers of its own.
  useEffect(() => {
    if (!menuOpen) return
    const isOutside = (node: EventTarget | null) => {
      const wrapper = wrapperRef.current
      return wrapper !== null && node instanceof Node && !wrapper.contains(node)
    }
    function handlePointerDown(event: PointerEvent) {
      if (isOutside(event.target)) setOpen(false)
    }
    // A null related target is a click on inert space, which the pointer handler already covers.
    function handleFocusOut(event: FocusEvent) {
      if (isOutside(event.relatedTarget)) setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      setOpen(false)
      // Return focus to the trigger only when it was in the menu or nowhere in particular, so an
      // Escape meant for another control does not pull focus away from it.
      const active = document.activeElement
      if (active === null || active === document.body || !isOutside(active)) {
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('focusout', handleFocusOut)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('focusout', handleFocusOut)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  if (status === 'unavailable') return null
  if (status === 'loading') return <span className="account-menu__placeholder" aria-hidden="true" />
  if (status === 'signed-out' || me === null) {
    return <GoogleSignInButton onClick={onSignIn} buttonRef={signInRef} />
  }

  const { email } = me.user
  const firstName = firstNameOf(me)
  const initials = initialsOf(me)
  const pictureUrl = me.user.pictureUrl

  function handleSignOut() {
    setOpen(false)
    onSignOut()
  }

  /**
   * The menu stays open, so the item shows it is busy and the status line can say how it ended. The
   * item is marked aria-disabled rather than disabled, so it keeps keyboard focus while busy.
   */
  async function handleDownloadData(download: () => Promise<Blob>) {
    if (exportingRef.current) return
    exportingRef.current = true
    setExporting(true)
    setExportStatus('Preparing your download…')
    try {
      saveAccountExport(await download(), new Date())
      setExportStatus('Your data was downloaded')
    } catch (failure) {
      setExportStatus(messageOf(failure))
    } finally {
      exportingRef.current = false
      setExporting(false)
    }
  }

  function openDeleteDialog() {
    setOpen(false)
    setDialogOpen(true)
  }

  function closeDeleteDialog() {
    setDialogOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <>
      <div ref={wrapperRef} className="account-menu">
        <button
          ref={triggerRef}
          type="button"
          className="account-menu__trigger"
          aria-expanded={menuOpen}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="account-menu__avatar" aria-hidden="true">
            {pictureUrl ? <img src={pictureUrl} alt="" referrerPolicy="no-referrer" /> : initials}
          </span>
          <span className="account-menu__name">{firstName}</span>
          <span className="account-menu__chevron" aria-hidden="true" />
        </button>
        {/* One dropdown holds the menu and the status below it, so the status is never covered by the menu. */}
        <div className="account-menu__dropdown">
          <div id={panelId} className="account-menu__panel" hidden={!menuOpen}>
            <p className="account-menu__email">{email}</p>
            {onDownloadData && (
              <button
                type="button"
                className="account-menu__item"
                aria-disabled={exporting}
                onClick={() => void handleDownloadData(onDownloadData)}
              >
                Download my data
              </button>
            )}
            <button type="button" className="account-menu__item" onClick={handleSignOut}>
              Sign out
            </button>
            <button
              type="button"
              className="account-menu__item account-menu__item--danger"
              onClick={openDeleteDialog}
            >
              Delete account…
            </button>
          </div>
          {/* Outside the panel and always mounted, so a result still shows, and is announced, after the menu closes. */}
          <p className="account-menu__status" role="status">
            {exportStatus}
          </p>
        </div>
      </div>
      <DeleteAccountDialog
        open={dialogOpen}
        email={email}
        onConfirm={onDeleteAccount}
        onClose={closeDeleteDialog}
      />
    </>
  )
}
