import { useEffect, useState } from 'react'

/** Width used before the first measurement, and whenever ResizeObserver is unavailable. */
export const FALLBACK_WIDTH = 640

/** Returns a ref callback to attach to the element to measure, and its current width in px. */
export function useSize(): [(node: HTMLElement | null) => void, number] {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [width, setWidth] = useState(FALLBACK_WIDTH)

  useEffect(() => {
    if (node === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width
      if (measured !== undefined && measured > 0) setWidth(Math.floor(measured))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])

  return [setNode, width]
}
