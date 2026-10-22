import { useState } from 'react'
import { plural } from './plural'
import './SyncStatus.css'

export interface SyncStatusProps {
  /** Activities saved so far in the current import, or null when no upload is running. */
  uploading: number | null
  /** Activities from the latest import whose digest or requested original could not be saved. */
  failures: number
  /** The API reported that the deployment's shared original-file allowance was reached. */
  storageBudgetExceeded?: boolean
  signedIn: boolean
}

interface Notice {
  text: string
  failed: boolean
}

const STORAGE_BUDGET_NOTICE =
  'Original-file storage is paused because this deployment reached its storage allowance. Activity summaries still sync and analysis continues, but originals were not saved. Turn off file retention to continue with summaries only; re-importing now will not bypass this allowance.'

function finishNotice(saved: number, failures: number, storageBudgetExceeded: boolean): Notice {
  if (storageBudgetExceeded) return { text: STORAGE_BUDGET_NOTICE, failed: true }
  if (failures > 0) {
    const pronoun = failures === 1 ? 'It is' : 'They are'
    const count = plural(failures, 'activity', 'activities')
    return {
      text: `${count} could not be fully saved. ${pronoun} still analysed on this device. Re-import to retry; if an original exceeds 50 MiB, turn off file retention first.`,
      failed: true,
    }
  }
  return { text: `Saved ${plural(saved, 'activity', 'activities')} to your library`, failed: false }
}

/**
 * Status line for uploads. Render it once, outside the landing and results views, so its live
 * region stays mounted: a region that mounts with the content is not announced. It is empty when
 * there is nothing to say, and announces only the start and the finish of an upload. The running
 * count is visual only, since announcing every change would be noisy.
 */
export function SyncStatus({
  uploading,
  failures,
  storageBudgetExceeded = false,
  signedIn,
}: SyncStatusProps) {
  const [previous, setPrevious] = useState(uploading)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [previousStorageBudgetExceeded, setPreviousStorageBudgetExceeded] =
    useState(storageBudgetExceeded)

  // Detect the start and the finish of an upload during render, not in an effect.
  if (storageBudgetExceeded !== previousStorageBudgetExceeded) {
    setPreviousStorageBudgetExceeded(storageBudgetExceeded)
    setNotice(storageBudgetExceeded ? { text: STORAGE_BUDGET_NOTICE, failed: true } : null)
  } else if (uploading !== previous) {
    setPrevious(uploading)
    if (uploading !== null && previous === null) {
      setNotice({ text: 'Saving to your library', failed: false })
    } else if (uploading === null && previous !== null) {
      setNotice(finishNotice(previous, failures, storageBudgetExceeded))
    }
  }

  const shown = signedIn
    ? storageBudgetExceeded
      ? { text: STORAGE_BUDGET_NOTICE, failed: true }
      : notice
    : null
  const messageClass = shown?.failed
    ? 'sync-status__message sync-status__message--failed'
    : 'sync-status__message'

  return (
    <div className="sync-status">
      <p role="status" className={messageClass}>
        {shown?.text ?? ''}
      </p>
      {signedIn && uploading !== null && (
        <span className="sync-status__count" aria-hidden="true">
          {`${uploading} saved`}
        </span>
      )}
    </div>
  )
}
