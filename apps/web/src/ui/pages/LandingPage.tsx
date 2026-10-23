import type { UnitSystem } from '@rca/core/units'
import { Methodology } from '../components'
import { Dropzone } from '../components/Dropzone'
import type { AnalysisController } from '../useAnalysis'
import { LandingExample } from './LandingExample'
import { PAGE_HEADING_ID } from './pageHeading'

export interface LandingPageProps {
  analysis: AnalysisController
  signedIn: boolean
  units: UnitSystem
  /** Receives dropped or chosen files. The app asks the setup questions first, when they are due. */
  onFiles: (files: File[]) => void
}

/** Shown while there is no result: the promise, the drop target, an example and how it works. */
export function LandingPage({ analysis, signedIn, units, onFiles }: LandingPageProps) {
  return (
    <div className="page-stack">
      <section className="app__pitch">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          How balanced are you as an athlete?
        </h1>
        <p className="lede secondary">
          Add your run and ride files to see your running and cycling side by side, how your balance
          leans, and what your bike fitness is worth on foot.
        </p>
      </section>
      <div className="landing__start">
        <Dropzone
          onFiles={onFiles}
          onSample={analysis.loadSample}
          busy={analysis.busy}
          signedIn={signedIn}
        />
        <LandingExample units={units} />
      </div>
      <ol className="app__steps">
        <li>
          <h2>1. Add your files</h2>
          <p className="secondary">
            FIT, GPX or TCX files from Garmin, Wahoo, Coros or Zwift, or the zip from Strava&rsquo;s
            account export.
          </p>
        </li>
        <li>
          <h2>2. Both sports on one scale</h2>
          <p className="secondary">
            Pace and power are converted to the energy they cost per kilogram, so a run and a ride
            can be compared fairly.
          </p>
        </li>
        <li>
          <h2>3. See your balance</h2>
          <p className="secondary">
            Where you stand in each sport, how they compare, and what would sharpen the answer.
          </p>
        </li>
      </ol>
      <Methodology />
    </div>
  )
}
