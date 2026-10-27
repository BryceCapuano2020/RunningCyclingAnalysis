import { useRef, useState } from 'react'
import { messageOf } from '../../api/messageOf'
import { saveAccountExport } from '../../export/saveExport'
import { formatTimeOfDay } from '../format/date'
import { DeleteAccountDialog } from './DeleteAccountDialog'
import './AccountSection.css'

export interface AccountSectionProps {
  email: string
  /** Resolves with the account's data as a JSON file. */
  onDownloadData: () => Promise<Blob>
  /** Resolves when the account is gone. Rejects when it could not be deleted. */
  onDeleteAccount: () => Promise<void>
  /** Whether the delete dialog is open. The page holds it, so it can close what else is open. */
  deleteOpen: boolean
  onDeleteOpenChange: (open: boolean) => void
}

const DOWNLOAD_FAILED = 'Could not download your data.'

/**
 * The signed-in account's data and deletion, on the Profile page. The download is saved as a file,
 * and deleting the account asks for the email address first.
 */
export function AccountSection({
  email,
  onDownloadData,
  onDeleteAccount,
  deleteOpen,
  onDeleteOpenChange,
}: AccountSectionProps) {
  const [deleteOpener, setDeleteOpener] = useState<HTMLElement | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  // State updates are not visible until the next render, so a second click in the same render
  // would still start an export. The ref is set at once.
  const exportingRef = useRef(false)

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
      setExportStatus(`Your data was downloaded at ${formatTimeOfDay(Date.now())}.`)
    } catch (failure) {
      setExportStatus(messageOf(failure, DOWNLOAD_FAILED))
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
      </div>
      {/* Always mounted, so the outcome is announced when it arrives. */}
      <p role="status" className="account-section__status muted">
        {exportStatus}
      </p>
      <div className="account-section__danger">
        <h3>Delete account</h3>
        <p className="secondary">
          Removes your profile, every activity and every stored file. This cannot be undone.
        </p>
        <button
          type="button"
          className="btn account-section__delete"
          onClick={(event) => {
            setDeleteOpener(event.currentTarget)
            onDeleteOpenChange(true)
          }}
        >
          Delete account…
        </button>
      </div>
      <DeleteAccountDialog
        open={deleteOpen}
        email={email}
        opener={deleteOpener}
        onConfirm={onDeleteAccount}
        onClose={() => onDeleteOpenChange(false)}
      />
    </section>
  )
}
