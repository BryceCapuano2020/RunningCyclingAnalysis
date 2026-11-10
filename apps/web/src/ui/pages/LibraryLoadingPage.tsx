import { PageLoading } from '../components/PageLoading'
import { routeName } from '../documentTitle'
import type { Route } from '../route'
import { PAGE_HEADING_ID } from './pageHeading'

/**
 * Stands in the page's place on a reload until the kept library replies: the page's own title, then a
 * quiet loading line that appears only after a short wait. A reload that answers at once shows no line.
 */
export function LibraryLoadingPage({ route }: { route: Route }) {
  return (
    <section aria-busy="true">
      <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
        {routeName(route)}
      </h1>
      <PageLoading />
    </section>
  )
}
