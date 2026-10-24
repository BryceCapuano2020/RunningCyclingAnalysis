import { useId, useRef, useState } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings, EffortCheck } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { CanvasDelivery } from '../../share/download'
import { hasShareableContent } from '../../share/hasShareableContent'
import { CARD_FILE_NAMES, type CardFormat } from '../../share/cardLayout'
import type { BalanceGap } from '../balanceGap'
import './ShareImageButton.css'

export interface ShareImageButtonProps {
  result: AnalysisResult
  settings: AthleteSettings
  units: UnitSystem
  rangeDays: number | null
  isSample: boolean
  /** Heart-rate check for the headline duration, shown on the card as a caveat when it applies. */
  effort: EffortCheck | null
  /** False while no body weight is entered: the card then leaves out the ride estimate and balance. */
  weightKnown: boolean
  /** The age-grade gap on the page, so the card states the same balance as the page. */
  gap: BalanceGap | null
  /** Analysis is running, so the comparison on screen may change. */
  disabled: boolean
}

const PRIVACY_NOTE = 'Creates a PNG on this device. Nothing is uploaded.'
const WAITING_NOTE = 'Available when the analysis finishes.'
const FAILED = 'The image could not be created. Try again.'
/** What the page says once the image has reached the visitor. A cancelled share says nothing. */
const DELIVERED: Record<CanvasDelivery, string> = {
  shared: 'Image shared',
  saved: 'Image saved',
  cancelled: '',
}

/** The two shapes, in button order. The square is the primary action. */
const SHAPES: { format: CardFormat; label: string; primary: boolean }[] = [
  { format: 'square', label: 'Download square image', primary: true },
  { format: 'story', label: 'Download story image', primary: false },
]

/**
 * Saves the balance on screen as a PNG on this device, as a square post or a story. Renders nothing
 * when there is neither a comparison nor a sport's estimate to draw. The card code loads on the
 * first click, so it is not in the app's first download.
 */
export function ShareImageButton({
  result,
  settings,
  units,
  rangeDays,
  isSample,
  effort,
  weightKnown,
  gap,
  disabled,
}: ShareImageButtonProps) {
  const [status, setStatus] = useState('')
  const [generating, setGenerating] = useState(false)
  // A ref, not state, so that a second click in the same tick is refused before React re-renders.
  const inFlight = useRef(false)
  const noteId = useId()
  if (!hasShareableContent(result)) return null

  const saveImage = async (format: CardFormat) => {
    if (inFlight.current) return
    inFlight.current = true
    setGenerating(true)
    setStatus('Creating image…')
    try {
      const [{ buildShareCard }, { loadCardFonts, renderShareCard }, { saveCanvasPng }] =
        await Promise.all([
          import('../../share/cardModel'),
          import('../../share/renderCard'),
          import('../../share/download'),
        ])
      // The canvas only draws a web font that has loaded, so wait for the card's faces first.
      await loadCardFonts()
      const card = buildShareCard(
        result,
        settings,
        units,
        rangeDays,
        isSample,
        effort,
        weightKnown,
        gap,
      )
      const canvas = document.createElement('canvas')
      const delivery =
        card !== null && renderShareCard(card, canvas, format)
          ? await saveCanvasPng(canvas, CARD_FILE_NAMES[format])
          : null
      setStatus(delivery === null ? FAILED : DELIVERED[delivery])
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
        {SHAPES.map(({ format, label, primary }) => (
          <button
            key={format}
            type="button"
            className={primary ? 'btn btn-primary' : 'btn'}
            onClick={() => void saveImage(format)}
            disabled={disabled}
            // aria-disabled, not disabled: a disabled button drops the focus it is holding. The
            // in-flight ref already refuses a second click.
            aria-disabled={generating}
            aria-describedby={noteId}
          >
            {label}
          </button>
        ))}
        <p id={noteId} className="share-image__note muted">
          {disabled ? WAITING_NOTE : PRIVACY_NOTE}
        </p>
      </div>
      <p role="status" className="share-image__status">
        {status}
      </p>
    </div>
  )
}
