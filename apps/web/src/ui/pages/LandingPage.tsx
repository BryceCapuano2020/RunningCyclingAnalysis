import type { UnitSystem } from '@rca/core/units'
import { useRef } from 'react'
import { Dropzone } from '../components/Dropzone'
import { privacyText } from '../components/privacyText'
import { ExportGuides } from '../components/ExportGuides'
import { useTouchFirst } from '../useMediaQuery'
import type { AnalysisController } from '../useAnalysis'
import { LandingExample } from './LandingExample'
import { PAGE_HEADING_ID } from './pageHeading'

const METHOD_HEADING_ID = 'landing-method-heading'

export interface LandingPageProps {
  analysis: AnalysisController
  signedIn: boolean
  /**
   * The footer's privacy sentence for the visitor's state, which the subtitle ends on, so the page says it once in
   * one phrase. Left out, it is the sentence of a signed-out visitor, or of a signed-in one who keeps files.
   */
  privacy?: string
  /** The units the example's weight is told in. Metric without one. */
  units?: UnitSystem
  /** Receives dropped or chosen files. The app asks the setup questions first, when they are due. */
  onFiles: (files: File[]) => void
}

/** Shown while there is no result: the promise, the drop target, an example and how it works. */
export function LandingPage({
  analysis,
  signedIn,
  privacy = privacyText({ signedIn, keepFiles: true }),
  units,
  onFiles,
}: LandingPageProps) {
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
          <p className="lede secondary">{`Add your Strava or Garmin export. See your level in each sport for your age. ${privacy}`}</p>
        </section>
        {/* A pointer sees the example first, with the drop zone beside it; a touch screen sees the actions first. */}
        <div className={touch ? 'landing__start landing__start--touch' : 'landing__start'}>
          {touch && dropzone}
          <LandingExample units={units} />
          {!touch && dropzone}
        </div>
      </div>
      <ol className="app__steps">
        <li>
          <h2>1. Add your files</h2>
          <p className="secondary">
            Drop the zip from Strava or Garmin as it is, or export from Wahoo, COROS or Zwift.
          </p>
        </li>
        <li>
          <h2>2. Both sports on one scale</h2>
          <p className="secondary">
            Your age and sex set each sport’s standard. A ride also needs your weight.
          </p>
        </li>
        <li>
          <h2>3. See your balance</h2>
          <p className="secondary">
            Your level in each sport, which way your balance leans, and what has changed lately.
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
          Each sport is judged on your threshold against the standard for your age and sex.
        </p>
        <a href="#/method">Full method</a>
      </section>
    </div>
  )
}
