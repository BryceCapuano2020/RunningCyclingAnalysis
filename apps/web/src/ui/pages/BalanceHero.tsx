import type { AnalysisResult } from '@rca/core/pipeline'
import type { HeadlinePick } from '../components'
import { BalanceMeter } from '../components/BalanceMeter'
import { HARDER_EFFORTS_TITLE, headlineText } from '../components/headlineText'
import { PAGE_HEADING_ID } from './pageHeading'
import { countSport } from '../records'

export interface BalanceHeroProps {
  result: AnalysisResult
  /** The comparison the headline describes, or null when the two sports cannot be compared yet. */
  pick: HeadlinePick | null
}

/** What is missing before the two sports can be compared, as the page's title and one sentence. */
function missingText(result: AnalysisResult): { title: string; detail: string } {
  const runs = countSport(result.activities, 'run')
  const rides = countSport(result.activities, 'ride')
  if (runs > 0 && rides === 0) {
    return { title: 'Add rides to see your balance', detail: 'Your running is below.' }
  }
  if (rides > 0 && runs === 0) {
    return { title: 'Add runs to see your balance', detail: 'Your cycling is below.' }
  }
  if (runs === 0 && rides === 0) {
    return {
      title: 'Add a run and a ride to see your balance',
      detail: 'Your files have no running or cycling activities yet.',
    }
  }
  return {
    title: HARDER_EFFORTS_TITLE,
    detail:
      'Both sports are in your files, but no efforts of the same length could be compared yet.',
  }
}

/** The answer: which way your balance leans, with the gap drawn as a meter. */
export function BalanceHero({ result, pick }: BalanceHeroProps) {
  if (pick === null) {
    const { title, detail } = missingText(result)
    return (
      <section className="balance-hero">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          {title}
        </h1>
        <p className="lede secondary">{detail}</p>
      </section>
    )
  }
  const { title, summary } = headlineText(pick.point)
  return (
    <section className="balance-hero">
      <h1 id={PAGE_HEADING_ID} tabIndex={-1} className="balance-hero__title">
        {title}
      </h1>
      <p className="lede secondary">{summary}</p>
      <BalanceMeter ratio={pick.point.ratio} />
    </section>
  )
}
