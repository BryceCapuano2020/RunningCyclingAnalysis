import { useRef } from 'react'
import { Dropzone } from '../components/Dropzone'
import { ExportGuides } from '../components/ExportGuides'
import { CLIMB_NEEDED } from '../components/headlineNeed'
import { HEADLINE_LABEL } from '../grades'
import { useTouchFirst } from '../useMediaQuery'
import type { AnalysisController } from '../useAnalysis'
import { LandingExample, LandingFitnessExample } from './LandingExample'
import { PAGE_HEADING_ID } from './pageHeading'

const METHOD_HEADING_ID = 'landing-method-heading'

/**
 * The privacy promise that ends the hero's subline. Signed out, nothing is uploaded. Signed in, the
 * summaries are stored in the private library, so it says the analysis stays on the device and no more.
 */
function privacyLine(signedIn: boolean): string {
  return signedIn ? 'Your files are analysed on your device.' : 'Nothing leaves your device.'
}

export interface LandingPageProps {
  analysis: AnalysisController
  signedIn: boolean
  /** Receives dropped or chosen files. The app asks the setup questions first, when they are due. */
  onFiles: (files: File[]) => void
}

/** Shown while there is no result: the promise, the drop target, an example and how it works. */
export function LandingPage({ analysis, signedIn, onFiles }: LandingPageProps) {
  const guidesHeading = useRef<HTMLHeadingElement>(null)
  // On a touch screen the actions come straight after the pitch, ahead of the example, so they are on the first screen.
  const touch = useTouchFirst()

  // Focus moves to the guides, which scrolls to them. A fragment link would break the hash routes.
  function showExportGuides() {
    guidesHeading.current?.focus()
  }

  const dropzone = (
    <Dropzone
      onFiles={onFiles}
      onSample={analysis.loadSample}
      onShowGuides={showExportGuides}
      busy={analysis.busy}
      signedIn={signedIn}
    />
  )

  return (
    <div className="page-stack">
      <div className="landing__hero">
        <section className="app__pitch">
          <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
            Are you a better runner or a better cyclist?
          </h1>
          <p className="lede secondary">{`Drop in your Strava or Garmin export or watch files to see your level in each sport for your age, with honest ranges. ${privacyLine(signedIn)}`}</p>
        </section>
        {/* A pointer sees the example first, with the drop zone beside it; a touch screen sees the actions first. */}
        <div className={touch ? 'landing__start landing__start--touch' : 'landing__start'}>
          {touch && dropzone}
          <LandingExample />
          {!touch && dropzone}
        </div>
        {/* The second panel follows the actions, so Add files stays on the first screen. */}
        <LandingFitnessExample />
      </div>
      <ol className="app__steps">
        <li>
          <h2>1. Add your files</h2>
          <p className="secondary">
            Download your account export from Strava or Garmin and drop the zip as it is, or export
            from Wahoo, COROS or Zwift.
          </p>
        </li>
        <li>
          <h2>2. Both sports on one scale</h2>
          <p className="secondary">
            The app asks for your age, sex and weight. Your age and sex set the standard for each
            sport, and a ride needs your weight to show its level.
          </p>
        </li>
        <li>
          <h2>3. See your balance</h2>
          <p className="secondary">
            Your level in each sport, which way your balance leans, and what to add for a steadier
            answer.
          </p>
        </li>
      </ol>
      <ExportGuides
        headingRef={guidesHeading}
        sample={signedIn ? undefined : { busy: analysis.busy, onSample: analysis.loadSample }}
      />
      <section className="landing__method" aria-labelledby={METHOD_HEADING_ID}>
        <h2 id={METHOD_HEADING_ID}>How the result is worked out</h2>
        <p className="secondary">
          {`Each sport is judged on your best ${HEADLINE_LABEL}: running by its pace, allowing for hills, and cycling by its power. Without a power meter, power is estimated from speed, gradient and weight, and only on ${CLIMB_NEEDED}.`}
        </p>
        <p className="secondary">
          Each result is compared with the standard for your age and sex on the day of that effort.
        </p>
        <p className="secondary">
          A ride’s result is an estimate with a range. If the two could be level, it says they are
          in balance.
        </p>
        <a href="#/method">Full method</a>
      </section>
    </div>
  )
}
