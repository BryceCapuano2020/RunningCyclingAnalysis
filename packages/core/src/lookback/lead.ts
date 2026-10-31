import { LOOKBACK } from './params'
import type { HindsightEpisode, HindsightFitness } from './types'

const YEAR_MS = 365.25 * 86_400_000

/**
 * Whether an episode is strong enough to be the lead of the look-back (never in a library under two years): a change of `lead.delta` or more, `lead.z` standard
 * errors against the floor, ended or begun within the last `lead.years` before the horizon. Being listed needs less
 * (the monitor's own bar); a lead is what the page opens on, so it is held to more. A slip still open at the horizon is
 * judged by when it began.
 */
export function meetsLeadBar(episode: HindsightEpisode, years: HindsightFitness): boolean {
  // Under two years no season can be told from change, so nothing leads.
  if (years.toMs - years.fromMs < LOOKBACK.list.shortWeeks * 7 * 86_400_000) return false
  const size = Math.abs(Math.log1p(episode.change.value))
  const when = episode.toMs ?? episode.fromMs
  return (
    size >= LOOKBACK.lead.delta &&
    Math.abs(episode.z) >= LOOKBACK.lead.z &&
    years.toMs - when <= LOOKBACK.lead.years * YEAR_MS
  )
}
