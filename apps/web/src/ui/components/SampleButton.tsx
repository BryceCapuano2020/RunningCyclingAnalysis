import type { ReactNode } from 'react'

export interface SampleButtonProps {
  busy: boolean
  onSample: () => void
  /** The id of the line that says why the sample is off, while it is. */
  describedBy?: string
  children: ReactNode
}

/**
 * Starts the sample athlete. It is aria-disabled, not disabled, while an import is busy: a disabled
 * button drops the focus it holds, so the click is guarded instead.
 */
export function SampleButton({ busy, onSample, describedBy, children }: SampleButtonProps) {
  return (
    <button
      type="button"
      className="btn"
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
