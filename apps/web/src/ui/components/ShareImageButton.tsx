import { useRef, useState } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings, EffortCheck } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { pickHeadline } from './pickHeadline'
import './ShareImageButton.css'

export interface ShareImageButtonProps {
  result: AnalysisResult
  settings: AthleteSettings
  units: UnitSystem
  rangeDays: number | null
  isSample: boolean
  /** Heart-rate check for the headline duration, shown on the card as a caveat when it applies. */
  effort: EffortCheck | null
  /** Analysis is running, so the comparison on screen may change. */
  disabled: boolean
}

const NOTE_ID = 'share-image-note'
const PRIVACY_NOTE = 'Creates a PNG on this device. Nothing is uploaded.'
const WAITING_NOTE = 'Available when the analysis finishes.'
const FAILED = 'The image could not be created. Try again, or use another browser.'

/**
 * Saves the comparison on screen as a PNG on this device. Renders nothing when there is no
 * comparison to share. The card code loads on the first click, so it is not in the app's first
 * download.
 */
export function ShareImageButton({
  result,
  settings,
  units,
  rangeDays,
  isSample,
  effort,
  disabled,
}: ShareImageButtonProps) {
  const [status, setStatus] = useState('')
  const [generating, setGenerating] = useState(false)
  // A ref, not state, so that a second click in the same tick is refused before React re-renders.
  const inFlight = useRef(false)
  if (pickHeadline(result.comparison) === null) return null

  const saveImage = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setGenerating(true)
    setStatus('Creating image…')
    try {
      const [{ buildShareCard }, { renderShareCard }, { saveCanvasPng }] = await Promise.all([
        import('../../share/cardModel'),
        import('../../share/renderCard'),
        import('../../share/download'),
      ])
      const card = buildShareCard(result, settings, units, rangeDays, isSample, effort)
      const canvas = document.createElement('canvas')
      const saved = card !== null && renderShareCard(card, canvas) && (await saveCanvasPng(canvas))
      setStatus(saved ? 'Image saved' : FAILED)
    } catch {
      setStatus(FAILED)
    } finally {
      inFlight.current = false
      setGenerating(false)
    }
  }

  return (
    <div className="share-image">
      <div className="share-image__actions">
        <button
          type="button"
          className="btn"
          onClick={() => void saveImage()}
          disabled={disabled}
          // aria-disabled, not disabled: a disabled button drops the focus it is holding. The
          // in-flight ref already refuses a second click.
          aria-disabled={generating}
          aria-describedby={NOTE_ID}
        >
          Download image
        </button>
        <p id={NOTE_ID} className="share-image__note muted">
          {disabled ? WAITING_NOTE : PRIVACY_NOTE}
        </p>
      </div>
      <p role="status" className="share-image__status">
        {status}
      </p>
    </div>
  )
}
