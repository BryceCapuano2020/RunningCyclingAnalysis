import { useRef } from 'react'
import type { UnitSystem } from '@rca/core/units'
import { Dropzone } from '../components/Dropzone'
import { ExportGuides } from '../components/ExportGuides'
import { HISTORY_ADVICE } from '../exportGuides'
import type { AnalysisController } from '../useAnalysis'
import { LandingExample } from './LandingExample'
import { PAGE_HEADING_ID } from './pageHeading'

const METHOD_HEADING_ID = 'landing-method-heading'

export interface LandingPageProps {
  analysis: AnalysisController
  signedIn: boolean
  units: UnitSystem
  /** Receives dropped or chosen files. The app asks the setup questions first, when they are due. */
  onFiles: (files: File[]) => void
}

/** Shown while there is no result: the promise, the drop target, an example and how it works. */
export function LandingPage({ analysis, signedIn, units, onFiles }: LandingPageProps) {
  const guidesHeading = useRef<HTMLHeadingElement>(null)

  // Focus moves to the guides, which scrolls to them. A fragment link would break the hash routes.
  function showExportGuides() {
    guidesHeading.current?.focus()
  }

  return (
    <div className="page-stack">
      <section className="app__pitch">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          How balanced are you as an athlete?
        </h1>
        <p className="lede secondary">
          Add your runs and rides. See how your running and cycling compare, as your level for your
          age, and which way your balance leans.
        </p>
      </section>
      <div className="landing__start">
        <Dropzone
          onFiles={onFiles}
          onSample={analysis.loadSample}
          onShowGuides={showExportGuides}
          busy={analysis.busy}
          signedIn={signedIn}
        />
        <LandingExample units={units} />
      </div>
      <ol className="app__steps">
        <li>
          <h2>1. Add your files</h2>
          <p className="secondary">
            FIT, GPX or TCX files from Garmin, Wahoo, COROS or Zwift, or the zip from Strava’s
            account export.
          </p>
          <p className="secondary">{HISTORY_ADVICE}</p>
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
          Each sport is judged on your best 20 minutes: running by its pace, allowing for hills, and
          cycling by its power, which is estimated from speed, gradient and weight when there is no
          power meter.
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
