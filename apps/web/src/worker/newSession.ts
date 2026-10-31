import { AnalysisSession } from '@rca/core/session'
import { deviceZone } from './viewerZone'

/** The worker's session, with the device's zone given to it: where a file recorded no local day, days and weeks are cut there. */
export function newSession(): AnalysisSession {
  const session = new AnalysisSession()
  session.setZone(deviceZone)
  return session
}
