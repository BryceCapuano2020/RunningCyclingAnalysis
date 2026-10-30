import { useEffect } from 'react'
import './PageLoading.css'

/**
 * What a page that is still loading shows. It appears only after a short wait, so a page that arrives
 * from the cache replaces nothing, and it is a status for a screen reader.
 */
export function PageLoading() {
  return (
    <p className="page-loading" role="status">
      Loading
    </p>
  )
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
