import type { Ref } from 'react'
import './ConfirmActions.css'

export interface ConfirmActionsProps {
  /** Names the destructive action: "Delete" for a saved activity, and the removal's own name elsewhere. */
  confirmLabel: string
  /** A busy action stays focusable and ignores activation, Cancel included, so focus holds still. */
  busy?: boolean
  /** Looks unavailable but still runs onConfirm, so the handler can say why nothing was removed. */
  unready?: boolean
  /** The id of the text that explains the confirm button, when it needs one. */
  confirmDescribedBy?: string
  /** Lets the parent focus Cancel, the safe choice, when the question opens. */
  cancelRef?: Ref<HTMLButtonElement>
  onCancel: () => void
  /** Omit when there is nothing to confirm, such as a refusal that retrying cannot fix. */
  onConfirm?: () => void
}

/**
 * The Cancel and confirm pair for every removal. The confirm is always the destructive button, so a
 * removal reads the same wherever it is asked for.
 */
export function ConfirmActions({
  confirmLabel,
  busy = false,
  unready = false,
  confirmDescribedBy,
  cancelRef,
  onCancel,
  onConfirm,
}: ConfirmActionsProps) {
  return (
    <div className="confirm-actions">
      <button
        ref={cancelRef}
        type="button"
        className="btn"
        aria-disabled={busy}
        onClick={() => {
          // aria-disabled, not disabled: a disabled button drops the focus it holds.
          if (!busy) onCancel()
        }}
      >
        Cancel
      </button>
      {onConfirm && (
        <button
          type="button"
          className="btn confirm-actions__confirm"
          aria-disabled={busy || unready}
          aria-describedby={confirmDescribedBy}
          onClick={() => {
            if (!busy) onConfirm()
          }}
        >
          {confirmLabel}
        </button>
      )}
    </div>
  )
}
