import type { RefObject } from 'react'
import { Methodology, SignInCallout } from '../components'
import type { AnalysisController } from '../useAnalysis'
import { ImportRejections } from './ImportRejections'

/** The landing page heading. App focuses it when the page returns to the landing view. */
export function LandingPitch({ headingRef }: { headingRef: RefObject<HTMLHeadingElement | null> }) {
  return (
    <section className="app__pitch">
      <h1 ref={headingRef} tabIndex={-1}>
        How do your running and cycling energy estimates compare?
      </h1>
      <p className="secondary">
        Watts on the bike and pace on the run cannot be compared directly. This tool converts both
        into an estimated energy rate per kilogram, then compares the estimates with a range that
        reflects the model assumptions.
      </p>
    </section>
  )
}

export interface LandingViewProps {
  analysis: AnalysisController
  signedOut: boolean
  onSignIn: () => void
}

/** The part of the landing page below the files toolbar, shown while there is no result. */
export function LandingView({ analysis, signedOut, onSignIn }: LandingViewProps) {
  return (
    <>
      <ImportRejections analysis={analysis} />
      {signedOut && <SignInCallout onSignIn={onSignIn} />}
      <ol className="app__steps">
        <li>
          <h3>1. Add your files</h3>
          <p className="secondary">
            FIT, GPX or TCX files from a Garmin, Wahoo or similar device, or the zip from
            Strava&rsquo;s account export.
          </p>
        </li>
        <li>
          <h3>2. Both sports become one unit</h3>
          <p className="secondary">
            Cycling power and running speed on any gradient are converted to one energy rate, in
            watts per kilogram.
          </p>
        </li>
        <li>
          <h3>3. Your heart rate checks the maths</h3>
          <p className="secondary">
            The model assumes heart rate responds similarly to energy rate in both sports. When the
            data support it, fitted slopes adjust the energy estimates; otherwise, the
            population-based range is kept.
          </p>
        </li>
      </ol>
      <Methodology />
    </>
  )
}
