// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EffortCheck } from '@rca/core/types'
import { saveCanvasPng } from '../../share/download'
import { loadCardFonts, renderShareCard } from '../../share/renderCard'
import { makeActivity, makeResult } from './fixtures'
import { ShareImageButton } from './ShareImageButton'

vi.mock('../../share/download', () => ({ saveCanvasPng: vi.fn(async () => 'saved' as const) }))
vi.mock('../../share/renderCard', () => ({
  loadCardFonts: vi.fn(async () => undefined),
  renderShareCard: vi.fn(() => true),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const NOTE = 'Creates a PNG on this device. Nothing is uploaded.'
const WAITING = 'Available when the analysis finishes.'
/** Exact, so the status says what happened and what to do, without blaming the browser. */
const FAILED = /^The image could not be created\. Try again\.$/
const LOW_EFFORT: EffortCheck = { durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 }
const SQUARE = 'Download square image'
const STORY = 'Download story image'

function renderButton(overrides: Partial<Parameters<typeof ShareImageButton>[0]> = {}) {
  return render(
    <ShareImageButton
      result={makeResult()}
      settings={{ massKg: 75, bikeMassKg: 9 }}
      units="metric"
      rangeDays={42}
      isSample={false}
      effort={null}
      weightKnown
      gap={null}
      disabled={false}
      {...overrides}
    />,
  )
}

function download(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}

describe('ShareImageButton', () => {
  it('offers a square image and a story image, each with an explicit name', () => {
    renderButton()
    expect(screen.getByRole('button', { name: SQUARE })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: STORY })).toBeInTheDocument()
  })

  it('describes both buttons with the note that nothing is uploaded', () => {
    renderButton()
    const note = screen.getByText(NOTE)
    for (const name of [SQUARE, STORY]) {
      const button = screen.getByRole('button', { name })
      expect(button).toHaveAttribute('aria-describedby', note.id)
      expect(button).toHaveAccessibleDescription(NOTE)
    }
  })

  it('explains the disabled state in the note while the analysis is running', () => {
    renderButton({ disabled: true })
    for (const name of [SQUARE, STORY]) {
      const button = screen.getByRole('button', { name })
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription(WAITING)
    }
    expect(screen.getByText(WAITING)).toBeInTheDocument()
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
  })

  it('renders nothing when there is neither a comparison nor a sport estimate to share', () => {
    const { container } = renderButton({
      result: makeResult({
        comparison: { prior: [], calibrated: null },
        runCp: null,
        rideCp: null,
      }),
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('offers the image when only one sport has an estimate, so the card can ask for the other', () => {
    renderButton({
      result: makeResult({
        activities: [makeActivity({ id: 'run-1', sport: 'run' })],
        comparison: { prior: [], calibrated: null },
        rideCp: null,
      }),
    })
    expect(screen.getByRole('button', { name: SQUARE })).toBeEnabled()
  })

  it('creates the square card and saves it under its own name, then says the image was saved', async () => {
    renderButton()
    download(SQUARE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Image saved'))
    expect(renderShareCard).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'RunningCyclingAnalysis' }),
      expect.any(HTMLCanvasElement),
      'square',
    )
    expect(saveCanvasPng).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      'rca-summary-square.png',
    )
    // The card's fonts load before it is drawn.
    expect(vi.mocked(loadCardFonts).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(renderShareCard).mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('creates the story card and saves it under its own name', async () => {
    renderButton()
    download(STORY)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Image saved'))
    expect(renderShareCard).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'RunningCyclingAnalysis' }),
      expect.any(HTMLCanvasElement),
      'story',
    )
    expect(saveCanvasPng).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      'rca-summary-story.png',
    )
  })

  it('passes the heart-rate effort to the card so the caveat is included', async () => {
    renderButton({ effort: LOW_EFFORT })
    download(SQUARE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Image saved'))
    expect(renderShareCard).toHaveBeenCalledWith(
      expect.objectContaining({
        caveat: 'Best efforts over 20 min may not have been all-out.',
      }),
      expect.any(HTMLCanvasElement),
      'square',
    )
  })

  it('gives the card the grade gap on the page, so its headline and meter agree with it', async () => {
    renderButton({ gap: { centre: -6, low: -10, high: -2, lean: 'ride' } })
    download(SQUARE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Image saved'))
    expect(renderShareCard).toHaveBeenCalledWith(
      expect.objectContaining({
        headline: 'Your balance leans toward cycling',
        meter: expect.objectContaining({ unit: 'points', lean: 'ride' }),
      }),
      expect.any(HTMLCanvasElement),
      'square',
    )
  })

  it('reports failure and saves nothing when the card cannot be drawn', async () => {
    vi.mocked(renderShareCard).mockReturnValueOnce(false)
    renderButton()
    download(STORY)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(FAILED))
    expect(saveCanvasPng).not.toHaveBeenCalled()
  })

  it('reports failure when the browser cannot save the image', async () => {
    vi.mocked(saveCanvasPng).mockResolvedValueOnce(null)
    renderButton()
    download(SQUARE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(FAILED))
  })

  it('says the image was shared when it went to the share sheet', async () => {
    vi.mocked(saveCanvasPng).mockResolvedValueOnce('shared')
    renderButton()
    download(SQUARE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Image shared'))
  })

  it('says nothing saved when the visitor closed the share sheet', async () => {
    vi.mocked(saveCanvasPng).mockResolvedValueOnce('cancelled')
    renderButton()
    download(SQUARE)
    await waitFor(() => expect(screen.getByRole('button', { name: SQUARE })).toBeEnabled())
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('reports failure, and is clickable again, when making the image throws', async () => {
    vi.mocked(renderShareCard).mockImplementationOnce(() => {
      throw new Error('canvas broke')
    })
    renderButton()
    download(SQUARE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(FAILED))
    expect(screen.getByRole('button', { name: SQUARE })).toBeEnabled()
  })

  it('makes one image for a double click, so the file is not downloaded twice', async () => {
    renderButton()
    download(SQUARE)
    download(SQUARE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Image saved'))
    expect(renderShareCard).toHaveBeenCalledTimes(1)
    expect(saveCanvasPng).toHaveBeenCalledTimes(1)
  })

  it('marks the buttons aria-disabled while the image is being made, and keeps its focus', async () => {
    let finish: (value: 'saved') => void = () => undefined
    vi.mocked(saveCanvasPng).mockImplementationOnce(
      () => new Promise<'saved'>((resolve) => (finish = resolve)),
    )
    renderButton()
    const button = screen.getByRole('button', { name: SQUARE })
    button.focus()
    download(SQUARE)
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    // Disabling the focused button would drop focus to the page body.
    expect(button).toBeEnabled()
    expect(button).toHaveFocus()
    await act(async () => finish('saved'))
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'false'))
    expect(button).toHaveFocus()
  })

  it('does not start a story while the square is being made', async () => {
    let finish: (value: 'saved') => void = () => undefined
    vi.mocked(saveCanvasPng).mockImplementationOnce(
      () => new Promise<'saved'>((resolve) => (finish = resolve)),
    )
    renderButton()
    download(SQUARE)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: STORY })).toHaveAttribute('aria-disabled', 'true'),
    )
    download(STORY)
    await act(async () => finish('saved'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Image saved'))
    expect(renderShareCard).toHaveBeenCalledTimes(1)
  })
})
