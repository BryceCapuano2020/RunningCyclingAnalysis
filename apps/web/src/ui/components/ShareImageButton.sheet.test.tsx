// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canShareImage, shareFile } from '../../share/download'
import { loadCardFonts } from '../../share/renderCard'
import { EMPTY_TRIANGLE } from '../triangleSports'
import { makeResult } from './fixtures'
import { ShareImageButton } from './ShareImageButton'

vi.mock('../../share/download', () => ({
  canShareImage: vi.fn(() => false),
  canvasFile: vi.fn(
    async (_canvas: HTMLCanvasElement, name: string) =>
      new File(['png'], name, { type: 'image/png' }),
  ),
  previewUrl: vi.fn(() => 'blob:preview'),
  releasePreview: vi.fn(),
  saveFile: vi.fn(() => 'saved' as const),
  shareFile: vi.fn(async () => 'shared' as const),
}))
vi.mock('../../share/renderCard', () => ({
  loadCardFonts: vi.fn(async () => undefined),
  renderShareCard: vi.fn(() => true),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.mocked(canShareImage).mockReturnValue(false)
})

function renderButton() {
  return render(
    <ShareImageButton
      result={makeResult()}
      settings={{ massKg: 75, bikeMassKg: 9 }}
      units="metric"
      period={{ choice: 42, startMs: null, endMs: null, days: 42, fellBack: false }}
      isSample={false}
      weightKnown
      gap={null}
      grades={{ run: null, ride: null }}
      triangle={EMPTY_TRIANGLE}
      disabled={false}
    />,
  )
}

async function openSheet(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Share image' }))
  const dialog = screen.getByRole('dialog', { name: 'Share image' })
  await screen.findByRole('img', { name: /^Preview of the square card/ })
  return dialog
}

describe('the share sheet controls', () => {
  it('closes on Escape, through its state', async () => {
    renderButton()
    const dialog = await openSheet()
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(dialog, cancel)
    expect(cancel.defaultPrevented).toBe(true)
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'))
  })

  it('closes on the Close button', async () => {
    renderButton()
    const dialog = await openSheet()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'))
  })

  it('says the image could not be created when the share fails', async () => {
    vi.mocked(canShareImage).mockReturnValue(true)
    vi.mocked(shareFile).mockRejectedValueOnce(new Error('refused'))
    renderButton()
    const dialog = await openSheet()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Share file' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'The image could not be created. Try again.',
      ),
    )
  })

  it('drops a failed card load, so pointing at the trigger again loads it again', async () => {
    vi.mocked(loadCardFonts).mockRejectedValueOnce(new Error('offline'))
    renderButton()
    const trigger = screen.getByRole('button', { name: 'Share image' })
    fireEvent.pointerEnter(trigger)
    await waitFor(() => expect(loadCardFonts).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    fireEvent.pointerEnter(trigger)
    await waitFor(() => expect(loadCardFonts).toHaveBeenCalledTimes(2))
  })
})
