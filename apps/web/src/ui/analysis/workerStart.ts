import { keptLibraryHinted } from './keptLibrary'

/**
 * Whether the analysis worker starts with the page. It is a 350 KB script, so a first visit, which
 * has nothing kept to restore, leaves it unfetched until a request needs it. A browser that kept
 * results starts it at once, so the restoring page can end as soon as the library replies.
 */
export function workerStartsWithPage(): boolean {
  return keptLibraryHinted()
}
