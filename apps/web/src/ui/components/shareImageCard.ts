import { canvasFile } from '../../share/download'
import { cardFileName, type CardFormat } from '../../share/cardLayout'
import type { HoldInputs } from '../resultHold'
import type { ShareImageButtonProps } from './ShareImageButton'

/** What the card is drawn from: the page's inputs, without the analysis state. */
export type CardInputs = Omit<ShareImageButtonProps, 'disabled'> & {
  name: string
  hold: HoldInputs
}

/**
 * The card's code and its fonts. The card loads on the first use, so it is not in the app's first
 * download. The canvas only draws a web font that has loaded, so the faces are waited for first.
 */
export async function loadCardModules() {
  const [cardModel, renderCard] = await Promise.all([
    import('../../share/cardModel'),
    import('../../share/renderCard'),
  ])
  await renderCard.loadCardFonts()
  return { buildShareCard: cardModel.buildShareCard, renderShareCard: renderCard.renderShareCard }
}

export type CardModules = Awaited<ReturnType<typeof loadCardModules>>

/** The card as a PNG file and its description, or null when there is no card to draw. */
interface Made {
  file: File
  alt: string
}

/**
 * Draws the card in a shape and encodes it as a PNG file, or gives null when there is no card to
 * draw.
 */
export async function makeFile(
  inputs: CardInputs,
  format: CardFormat,
  when: Date,
  loadCard: () => Promise<CardModules>,
): Promise<Made | null> {
  const { buildShareCard, renderShareCard } = await loadCard()
  const card = buildShareCard(
    inputs.result,
    inputs.settings,
    inputs.units,
    inputs.period,
    inputs.isSample,
    inputs.weightKnown,
    inputs.gap,
    inputs.grades,
    inputs.name,
    inputs.hold,
    inputs.triangle,
    { half: inputs.half ?? null, lift: inputs.lift ?? null },
  )
  if (card === null) return null
  const canvas = document.createElement('canvas')
  if (!renderShareCard(card, canvas, format)) return null
  const file = await canvasFile(canvas, cardFileName(format, inputs.period, when))
  return file === null ? null : { file, alt: card.alt }
}
