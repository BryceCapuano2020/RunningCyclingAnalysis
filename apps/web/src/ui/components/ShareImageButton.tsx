import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { AthleteSettings, EffortCheck, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { saveCardName, storedCardName } from '../../share/cardName'
import { cardFileName, type CardFormat } from '../../share/cardLayout'
import {
  canShareImage,
  canvasFile,
  previewUrl,
  releasePreview,
  saveFile,
  shareFile,
  type CanvasDelivery,
} from '../../share/download'
import { hasShareableContent } from '../../share/hasShareableContent'
import type { BalanceGap } from '../balanceGap'
import type { GradeOutcome } from '../grades'
import { CardNameField } from './CardNameField'
import { SegmentedControl, type SegmentedControlOption } from './SegmentedControl'
import { useModalDialog } from './useModalDialog'
import './ShareImageButton.css'

export interface ShareImageButtonProps {
  result: AnalysisResult
  settings: AthleteSettings
  units: UnitSystem
  /** The period on screen, which the card names with its dates. */
  period: Period
  isSample: boolean
  /** Heart-rate check for the headline duration, shown on the card as a caveat when it applies. */
  effort: EffortCheck | null
  /** False while no body weight is entered: the balance waits for it, so no card is offered. */
  weightKnown: boolean
  /** The age-grade gap on the page, so the card states the same balance as the page. */
  gap: BalanceGap | null
  /** Each sport's grade as the page shows it, so the card's levels match the cards. A ride's waits for the weight. */
  grades: Record<Sport, GradeOutcome | null>
  /** Analysis is running, so the comparison on screen may change. */
  disabled: boolean
}

/** What the card is drawn from: the page's inputs, without the analysis state. */
type CardInputs = Omit<ShareImageButtonProps, 'disabled'> & { name: string }

interface Preview {
  format: CardFormat
  /** The PNG file of the card, or null when it could not be drawn. The action shares or saves this file. */
  file: File | null
  /** The card as a picture, or null when it could not be drawn. */
  url: string | null
}

const TRIGGER = 'Share image'
const SHEET_TITLE = 'Share image'
const PRIVACY_NOTE = 'Made on this device. Nothing is uploaded.'
const SAVE = 'Save image'
const SHARE = 'Share file'
const PREPARING = 'Preparing…'
/** A second press this soon after an action is the same double click, so it is ignored. */
const REPEAT_PRESS_MS = 600
const FAILED = 'The image could not be created. Try again.'
const PREVIEW_WAITING = 'Creating preview…'
const PREVIEW_FAILED = 'The preview could not be made.'
/** The file the device is asked whether it can share, before any card is drawn. */
const SHARE_CHECK = new File([], 'share-check.png', { type: 'image/png' })

/** Each shape's name and use: the sheet's choice reads "Square (feed)" and "Tall (story)". */
const SHAPE: Record<CardFormat, { name: string; use: string }> = {
  square: { name: 'Square', use: 'feed' },
  story: { name: 'Tall', use: 'story' },
}
const SHAPES: SegmentedControlOption<CardFormat>[] = (['square', 'story'] as const).map(
  (format) => ({ value: format, label: `${SHAPE[format].name} (${SHAPE[format].use})` }),
)

/** What the status says once the image has reached the visitor. A cancelled share says nothing. */
function deliveredText(format: CardFormat, delivery: CanvasDelivery): string {
  if (delivery === 'cancelled') return ''
  const name = SHAPE[format].name
  return delivery === 'shared' ? `${name} image shared` : `${name} image saved`
}

/**
 * The card's code and its fonts. The card loads on the first use, so it is not in the app's first
 * download. The canvas only draws a web font that has loaded, so the faces are waited for first.
 */
async function loadCardModules() {
  const [cardModel, renderCard] = await Promise.all([
    import('../../share/cardModel'),
    import('../../share/renderCard'),
  ])
  await renderCard.loadCardFonts()
  return { buildShareCard: cardModel.buildShareCard, renderShareCard: renderCard.renderShareCard }
}

type CardModules = Awaited<ReturnType<typeof loadCardModules>>

/**
 * Draws the card in a shape and encodes it as a PNG file, or gives null when there is no card to
 * draw.
 */
async function makeFile(
  inputs: CardInputs,
  format: CardFormat,
  when: Date,
  loadCard: () => Promise<CardModules>,
): Promise<File | null> {
  const { buildShareCard, renderShareCard } = await loadCard()
  const card = buildShareCard(
    inputs.result,
    inputs.settings,
    inputs.units,
    inputs.period,
    inputs.isSample,
    inputs.effort,
    inputs.weightKnown,
    inputs.gap,
    inputs.grades,
    inputs.name,
  )
  if (card === null) return null
  const canvas = document.createElement('canvas')
  if (!renderShareCard(card, canvas, format)) return null
  return canvasFile(canvas, cardFileName(format, inputs.period, when))
}

/**
 * Shares the balance on screen as a PNG, through a sheet with a preview of the card, a choice of
 * shape, and one action: the device's share sheet where it can take this image, or a download. The
 * card is drawn and encoded once for the preview, so the action can start the share straight away.
 * Renders nothing while there is no balance to share: both sports have a threshold, and a weight is
 * entered.
 */
export function ShareImageButton(props: ShareImageButtonProps) {
  const { result, settings, units, period, isSample, effort, weightKnown, gap, grades, disabled } =
    props
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<CardFormat>('square')
  const [status, setStatus] = useState('')
  // The name on the card, read from this device once and kept there as it is typed.
  const [name, setName] = useState(storedCardName)
  const changeName = (next: string) => {
    setName(next)
    saveCardName(next)
  }
  const [generating, setGenerating] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [basis, setBasis] = useState({ result, period, units })
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null)
  // A ref, not state, so that a second click in the same tick is refused before React re-renders.
  const inFlight = useRef(false)
  // When the last action was accepted, so a double click is one press.
  const lastPress = useRef(0)
  const titleId = useId()
  const dialogRef = useModalDialog(open, trigger)
  // The card loads once for this sheet, so the trigger's pointer and focus and the first draw share it. A
  // failed load is dropped, so the next attempt loads again.
  const cardLoad = useRef<Promise<CardModules> | null>(null)
  const loadCard = useCallback(() => {
    if (cardLoad.current === null) {
      cardLoad.current = loadCardModules().catch((error: unknown) => {
        cardLoad.current = null
        throw error
      })
    }
    return cardLoad.current
  }, [])
  // Starts the load before anything is drawn, so the first preview does not wait for it.
  const preloadCard = () => {
    loadCard().catch(() => undefined)
  }

  // A new analysis, period or unit system makes the status describe an older card, so it is cleared.
  if (basis.result !== result || basis.period !== period || basis.units !== units) {
    setBasis({ result, period, units })
    setStatus('')
  }

  // The picture in view was drawn from these. When any changes, or the sheet opens or closes, it is for an
  // older card, so it is dropped now, and the action is held until the new one is drawn.
  const drawnFrom: readonly unknown[] = [
    open,
    result,
    settings,
    units,
    period,
    isSample,
    effort,
    weightKnown,
    gap,
    grades,
    name,
  ]
  const [seenFrom, setSeenFrom] = useState<readonly unknown[]>(drawnFrom)
  if (drawnFrom.some((value, index) => value !== seenFrom[index])) {
    setSeenFrom(drawnFrom)
    setPreview(null)
  }

  // A picture is released when the one drawn after it replaces it, or the sheet closes. Until then the
  // last picture stays in view, so a shape switch does not blank the sheet.
  useEffect(() => {
    const url = preview?.url ?? null
    return () => {
      if (url !== null) releasePreview(url)
    }
  }, [preview])

  // A click on the backdrop lands on the dialog itself, not on anything inside it, so it closes the sheet.
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    const closeOnBackdrop = (event: MouseEvent) => {
      // The dialog itself is the target for a click on its backdrop and on its padding, so the box decides.
      if (event.target !== dialog) return
      const box = dialog.getBoundingClientRect()
      const inside =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom
      if (!inside) setOpen(false)
    }
    dialog.addEventListener('click', closeOnBackdrop)
    return () => dialog.removeEventListener('click', closeOnBackdrop)
  })

  useEffect(() => {
    if (!open) return
    let current = true
    const source: CardInputs = {
      result,
      settings,
      units,
      period,
      isSample,
      effort,
      weightKnown,
      gap,
      grades,
      name,
    }
    makeFile(source, format, new Date(), loadCard).then(
      (file) => {
        if (current) setPreview({ format, file, url: file === null ? null : previewUrl(file) })
      },
      () => {
        if (current) setPreview({ format, file: null, url: null })
      },
    )
    return () => {
      current = false
    }
  }, [
    open,
    format,
    result,
    settings,
    units,
    period,
    isSample,
    effort,
    weightKnown,
    gap,
    grades,
    name,
    loadCard,
  ])

  if (!hasShareableContent(result, gap, weightKnown, grades.ride)) return null

  const shown = preview?.format === format ? preview : null
  // The action has a file to share or save only once this shape is drawn; until then it is held.
  const readyFile = shown?.file ?? null
  const actionLabel = shown === null ? PREPARING : canShareImage(SHARE_CHECK) ? SHARE : SAVE

  /** Hands the image to the share sheet, or downloads it where the sheet cannot take it. */
  const deliver = (file: File) => {
    if (canShareImage(file)) {
      // The share starts here, within the click: nothing above awaits.
      inFlight.current = true
      setGenerating(true)
      shareFile(file)
        .then(
          (delivery) => setStatus(deliveredText(format, delivery)),
          () => setStatus(FAILED),
        )
        .finally(() => {
          inFlight.current = false
          setGenerating(false)
        })
      return
    }
    setStatus(deliveredText(format, saveFile(file)))
  }

  const onAction = () => {
    // Refused before anything else, so no await sits before the share: a save in flight, or one just made.
    const now = Date.now()
    if (inFlight.current || now - lastPress.current < REPEAT_PRESS_MS) return
    // Not drawn yet: there is nothing to share or save, so the tap does nothing.
    if (readyFile === null) return
    lastPress.current = now
    deliver(readyFile)
  }

  return (
    <div className="share-image" onPointerEnter={preloadCard} onFocus={preloadCard}>
      <button
        ref={setTrigger}
        type="button"
        className="btn"
        aria-haspopup="dialog"
        // aria-disabled, not disabled: a disabled button drops the focus it holds.
        aria-disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen(true)
        }}
      >
        {TRIGGER}
      </button>
      <dialog
        ref={dialogRef}
        className="share-sheet"
        aria-labelledby={titleId}
        onCancel={(event) => {
          // Escape goes through the state, so the open flag stays the one source.
          event.preventDefault()
          setOpen(false)
        }}
      >
        <div className="share-sheet__body">
          <h2 id={titleId}>{SHEET_TITLE}</h2>
          <p className="muted">{PRIVACY_NOTE}</p>
          <CardNameField value={name} onChange={changeName} />
          <SegmentedControl
            legend="Format"
            options={SHAPES}
            selected={format}
            onSelect={setFormat}
          />
          <div className={`share-sheet__preview share-sheet__preview--${format}`}>
            {preview?.url ? (
              <img
                className={preview.format === format ? undefined : 'share-sheet__picture--stale'}
                src={preview.url}
                alt={`Preview of the ${SHAPE[preview.format].name.toLowerCase()} card`}
              />
            ) : (
              <p className="muted">{shown === null ? PREVIEW_WAITING : PREVIEW_FAILED}</p>
            )}
          </div>
          <div className="share-sheet__foot">
            <p role="status" className="share-sheet__status">
              {status}
            </p>
            <div className="share-sheet__actions">
              <button
                type="button"
                className="btn share-sheet__action"
                // aria-disabled, not disabled: a disabled button drops the focus it is holding.
                aria-disabled={generating || readyFile === null}
                onClick={onAction}
              >
                {actionLabel}
              </button>
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  )
}
