import { useState } from 'react'
import type { ReactNode } from 'react'

/**
 * A chart's disclosure. It starts closed, and the chart mounts only once it has been opened, so a
 * closed section costs nothing and no chart is measured while it is hidden. Its summary names the
 * action a press takes: Show while closed, and Hide while open.
 */
export function EvidenceDisclosure({
  section,
  children,
}: {
  section: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  return (
    <details
      className="method__evidence"
      onToggle={(event) => {
        setOpen(event.currentTarget.open)
        if (event.currentTarget.open) setMounted(true)
      }}
    >
      <summary>
        {open ? 'Hide' : 'Show'} the evidence<span className="sr-only"> for {section}</span>
      </summary>
      {mounted && children}
    </details>
  )
}
