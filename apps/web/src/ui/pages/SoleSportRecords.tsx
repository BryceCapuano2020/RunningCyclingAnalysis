import { useMemo, useState } from 'react'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { AgeProfile } from '../grades'
import { ArrowRightIcon } from '../components/icons'
import { hrefFor } from '../route'
import { SPORT_LABEL, SPORT_NEEDS_WEIGHT } from '../sports'
import { bestEffortRows } from './bestEffortRows'
import { RecordTiles } from './RecordTiles'
import { tileRows } from './tileRows'

export interface SoleSportRecordsProps {
  /** The one sport the library holds. */
  sport: Sport
  result: AnalysisResult
  massKg: number
  units: UnitSystem
  profile: AgeProfile | null
  library: ActivitySummary[]
  /** False while no body weight is entered: a ride's W/kg and levels are priced at one, so the strip waits for it. */
  weightKnown: boolean
}

/**
 * The best efforts of a one-sport library, as the strip the sport's page shows under its curve, on the home page:
 * a one-sport Balance has no comparison to fill the page, so what the sport has demonstrated is what it shows. The headline
 * effort is left out, since the level and the threshold above already say it; what is here is the other lengths (a run's
 * distances, a ride's other durations), each with the activity that set it. A strip with nothing left to say is not drawn.
 */
export function SoleSportRecords({
  sport,
  result,
  massKg,
  units,
  profile,
  library,
  weightKnown,
}: SoleSportRecordsProps) {
  // Held as the sport's page holds a ride's figures: the tile above carries the one ask for the weight.
  const held = SPORT_NEEDS_WEIGHT[sport] && !weightKnown
  // A record's age counts from the time the page was opened, as on the sport's page.
  const [openedAt] = useState(() => Date.now())
  const tiles = useMemo(() => {
    if (held) return []
    const list = bestEffortRows({
      sport,
      result,
      previous: null,
      previousLabel: null,
      change: null,
      massKg,
      units,
      profile,
      library,
      openedAt,
    })
    return tileRows(sport, list.rows).filter((row) => row.key !== String(HEADLINE_DURATION_S))
  }, [held, sport, result, massKg, units, profile, library, openedAt])
  if (tiles.length === 0) return null
  return (
    <section className="section" aria-labelledby="balance-records">
      <h2 id="balance-records" className="sr-only">
        {`${SPORT_LABEL[sport]} best efforts`}
      </h2>
      <RecordTiles tiles={tiles} />
      <a className="link-arrow" href={hrefFor({ page: sport })}>
        {`All your ${SPORT_LABEL[sport].toLowerCase()} best efforts`}
        <ArrowRightIcon />
      </a>
    </section>
  )
}
