import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export function ScrollableTableRegion({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollable, setScrollable] = useState(false)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const measure = () => setScrollable(element.scrollWidth > element.clientWidth)
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  })

  return (
    <div
      ref={ref}
      className="activity-workbench__table-wrap"
      role={scrollable ? 'region' : undefined}
      aria-label={scrollable ? label : undefined}
      tabIndex={scrollable ? 0 : undefined}
    >
      {children}
    </div>
  )
}
