import type { ReactNode } from 'react'

export interface SampleButtonProps {
  busy: boolean
  onSample: () => void
  /** The id of the line that says why the sample is off, while it is. */
  describedBy?: string
  /** The one primary action, as it is on a touch screen, where the sample leads. */
  primary?: boolean
  children: ReactNode
}

/**
 * Starts the sample athlete. It is aria-disabled, not disabled, while an import is busy: a disabled
 * button drops the focus it holds, so the click is guarded instead.
 */
export function SampleButton({
  busy,
  onSample,
  describedBy,
  primary = false,
  children,
}: SampleButtonProps) {
  return (
    <button
      type="button"
      className={primary ? 'btn btn-primary' : 'btn'}
      onClick={() => {
        if (!busy) onSample()
      }}
      aria-disabled={busy}
      aria-describedby={busy ? describedBy : undefined}
    >
      {children}
    </button>
  )
}
