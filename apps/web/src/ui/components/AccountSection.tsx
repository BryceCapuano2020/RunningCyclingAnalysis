import { useEffect, useRef, useState } from 'react'
import { saveAccountExport } from '../../export/saveExport'
import { DeleteAccountDialog } from './DeleteAccountDialog'
import './AccountSection.css'

export interface AccountSectionProps {
  email: string
  /** Resolves with the account's data as a JSON file. */
  onDownloadData: () => Promise<Blob>
  /** Resolves when the account is gone. Rejects when it could not be deleted. */
  onDeleteAccount: () => Promise<void>
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not download your data.'
}

/**
 * The signed-in account's data and deletion, on the Profile page. The download is saved as a file,
 * and deleting the account asks for the email address first.
 */
export function AccountSection({ email, onDownloadData, onDeleteAccount }: AccountSectionProps) {
  const deleteRef = useRef<HTMLButtonElement>(null)
  const previousDialogOpen = useRef(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  // State updates are not visible until the next render, so a second click in the same render
  // would still start an export. The ref is set at once.
  const exportingRef = useRef(false)

  // The dialog is modal while open, which makes the button inert. Focus it once the dialog closes.
  useEffect(() => {
    const was = previousDialogOpen.current
    previousDialogOpen.current = dialogOpen
    if (was && !dialogOpen) deleteRef.current?.focus()
  }, [dialogOpen])

  /**
   * The button stays put while the export runs, so the item shows it is busy and keeps keyboard
   * focus. It is marked aria-disabled rather than disabled for that reason.
   */
  async function handleDownloadData() {
    if (exportingRef.current) return
    exportingRef.current = true
    setExporting(true)
    setExportStatus('Preparing your download…')
    try {
      saveAccountExport(await onDownloadData(), new Date())
      setExportStatus('Your data was downloaded')
    } catch (failure) {
      setExportStatus(messageOf(failure))
    } finally {
      exportingRef.current = false
      setExporting(false)
    }
  }

  return (
    <section className="section" aria-labelledby="profile-account">
      <h2 id="profile-account">Account</h2>
      <p>
        Signed in as <strong className="account-section__email">{email}</strong>
      </p>
      <div className="account-section__actions">
        <button
          type="button"
          className="btn"
          aria-disabled={exporting}
          onClick={() => void handleDownloadData()}
        >
          Download my data
        </button>
        <button
          ref={deleteRef}
          type="button"
          className="btn account-section__delete"
          onClick={() => setDialogOpen(true)}
        >
          Delete account…
        </button>
      </div>
      {/* Always mounted, so the outcome is announced when it arrives. */}
      <p role="status" className="account-section__status muted">
        {exportStatus}
      </p>
      <DeleteAccountDialog
        open={dialogOpen}
        email={email}
        onConfirm={onDeleteAccount}
        onClose={() => setDialogOpen(false)}
      />
    </section>
  )
}
