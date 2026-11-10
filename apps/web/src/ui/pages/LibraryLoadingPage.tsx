import { PageLoading } from '../components/PageLoading'
import { routeName } from '../documentTitle'
import type { Route } from '../route'
import { PAGE_HEADING_ID } from './pageHeading'

/**
 * The title block each page puts its h1 in, so the title stays where it is when the result arrives. Balance and
 * the sport pages have their own heads; the others share `page-title`. Keyed by page, as the routes are.
 */
function titleBlock(route: Route, title: string) {
  const h1 = (className?: string) => (
    <h1 id={PAGE_HEADING_ID} tabIndex={-1} className={className}>
      {title}
    </h1>
  )
  switch (route.page) {
    case 'balance':
      return <div className="balance-hero__head">{h1()}</div>
    case 'run':
    case 'ride':
      return (
        <div className="page-stack sport-page" data-sport={route.page}>
          <div className="sport-page__head">{h1('sport-page__title')}</div>
        </div>
      )
    default:
      return (
        <div className="page-stack">
          <div className="page-title">{h1()}</div>
        </div>
      )
  }
}

/**
 * Stands in the page's place on a reload until the kept library replies: the page's own title in the
 * title block the page uses, then a quiet loading line that appears only after a short wait. `aria-busy`
 * is on the title block only, so the polite status beside it is still announced.
 */
export function LibraryLoadingPage({ route }: { route: Route }) {
  return (
    <section data-loading="library">
      <div aria-busy="true">{titleBlock(route, routeName(route))}</div>
      <PageLoading />
    </section>
  )
}
