import type { AthleteSettings } from '@rca/core/types'
import type { AnalysisController } from './analysis/controller'
import { useDeviceCopy } from './analysis/deviceCopy'
import { useLiveAnalysis } from './analysis/liveAnalysis'
import type { Account, LibraryStatus } from './analysis/model'

export { DEVICE_GRACE_MS } from './analysis/liveAnalysis'
export type { AnalysisController, LibraryStatus }

/**
 * The analysis the page shows: the live one (./analysis/liveAnalysis.ts), with the last visit's results from the device
 * copy standing in until the live analysis has answered. Once it has, only it is shown.
 */
export function useAnalysis(settings: AthleteSettings, account: Account): AnalysisController {
  const live = useLiveAnalysis(settings, account)
  const copy = useDeviceCopy(account, live.state, live.libraryStatus, live.busy)
  return copy === null ? live : { ...live, state: copy.state, copyStale: copy.stale }
}
