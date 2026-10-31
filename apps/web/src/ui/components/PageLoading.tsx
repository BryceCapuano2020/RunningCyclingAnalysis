import { useEffect, useRef } from 'react'
import './PageLoading.css'

/**
 * What a page that is still loading shows. It appears only after a short wait, so a page that arrives
 * from the cache replaces nothing, and it is a status for a screen reader.
 */
export function PageLoading() {
  // The status is in the page empty and filled once it is there, so a screen reader announces the change.
  const status = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (status.current !== null) status.current.textContent = 'Loading'
  }, [])
  return <p className="page-loading" role="status" ref={status} />
}

/**
 * Rendered beside a lazy page, inside its Suspense boundary: React mounts it only once the page is
 * on screen, which is when focus and scroll can move to the page's heading. Keyed by page, it reports
 * each page as it appears.
 */
export function PageShown({
  pageKey,
  onShown,
}: {
  pageKey: string
  onShown: (key: string) => void
}) {
  useEffect(() => onShown(pageKey), [pageKey, onShown])
  return null
}
