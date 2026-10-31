import { useCallback, useEffect, useState } from 'react'
import { preloadResultPages } from './lazyPages'
import { usePageFocus } from './usePageFocus'

/**
 * What the app does for pages that load on first use. When results are on their way (files are being
 * read, a kept library is restoring or an account is signed in) the pages that show them preload in
 * parallel with the analysis. A page's heading may not exist when its `key` changes, so focus and scroll
 * wait until the page calls the returned `onShown` with its key.
 */
export function useLoadedPages(key: string, resultsComing: boolean): (shownKey: string) => void {
  useEffect(() => {
    if (resultsComing) preloadResultPages()
  }, [resultsComing])
  const [shownKey, setShownKey] = useState(key)
  const onShown = useCallback((shown: string) => setShownKey(shown), [])
  usePageFocus(key, shownKey)
  return onShown
}
