import { Suspense, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { PageLoadBoundary } from './PageLoadBoundary'
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

/**
 * The place a page that loads on first use appears: a failed load shows a retry card, a slow one a loading
 * status, and a page that has appeared reports its key to `onShown`.
 */
export function PageFrame({
  pageKey,
  onShown,
  children,
}: {
  pageKey: string
  onShown: (key: string) => void
  children: ReactNode
}) {
  return (
    <PageLoadBoundary pageKey={pageKey}>
      <Suspense fallback={<PageLoading />}>
        {children}
        <PageShown pageKey={pageKey} onShown={onShown} />
      </Suspense>
    </PageLoadBoundary>
  )
}
