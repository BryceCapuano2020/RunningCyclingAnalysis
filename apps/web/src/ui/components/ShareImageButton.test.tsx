// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EffortCheck } from '@rca/core/types'
import { saveCanvasPng } from '../../share/download'
import { renderShareCard } from '../../share/renderCard'
import { makeResult } from './fixtures'
import { ShareImageButton } from './ShareImageButton'

vi.mock('../../share/download', () => ({ saveCanvasPng: vi.fn(async () => true) }))
vi.mock('../../share/renderCard', () => ({ renderShareCard: vi.fn(() => true) }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const NOTE = 'Creates a PNG on this device. Nothing is uploaded.'
const WAITING = 'Available when the analysis finishes.'
const FAILED = 'The image could not be created. Try again, or use another browser.'
const LOW_EFFORT: EffortCheck = { durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 }

function renderButton(overrides: Partial<Parameters<typeof ShareImageButton>[0]> = {}) {
  return render(
    <ShareImageButton
      result={makeResult()}
      settings={{ massKg: 75, bikeMassKg: 9 }}
      units="metric"
      rangeDays={42}
      isSample={false}
      effort={null}
      disabled={false}
      {...overrides}
    />,
  )
}

function download() {
  fireEvent.click(screen.getByRole('button', { name: 'Download image' }))
}

describe('ShareImageButton', () => {
  it('shows a visible label, and describes the button with the note that nothing is uploaded', () => {
    renderButton()
    const button = screen.getByRole('button', { name: 'Download image' })
    const note = screen.getByText(NOTE)
    expect(button).toHaveAttribute('aria-describedby', note.id)
    expect(button).toHaveAccessibleDescription(NOTE)
  })

  it('explains the disabled state in the note while the analysis is running', () => {
    renderButton({ disabled: true })
    const button = screen.getByRole('button', { name: 'Download image' })
    expect(button).toBeDisabled()
    expect(screen.getByText(WAITING)).toBeInTheDocument()
    expect(button).toHaveAccessibleDescription(WAITING)
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
  })

  it('renders nothing when there is no comparison to share', () => {
    const { container } = renderButton({
      result: makeResult({ comparison: { prior: [], calibrated: null } }),
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('creates the card and saves it, then says the image was saved', async () => {
    renderButton()
    download()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Image saved'))
    expect(renderShareCard).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'RunningCyclingAnalysis' }),
      expect.any(HTMLCanvasElement),
    )
    expect(saveCanvasPng).toHaveBeenCalledTimes(1)
  })

  it('passes the heart-rate effort to the card so the caveat is included', async () => {
    renderButton({ effort: LOW_EFFORT })
    download()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Image saved'))
    expect(renderShareCard).toHaveBeenCalledWith(
      expect.objectContaining({
        caveat: 'Best efforts over 20 min may not have been all-out.',
      }),
      expect.any(HTMLCanvasElement),
    )
  })

  it('reports failure and saves nothing when the card cannot be drawn', async () => {
    vi.mocked(renderShareCard).mockReturnValueOnce(false)
    renderButton()
    download()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(FAILED))
    expect(saveCanvasPng).not.toHaveBeenCalled()
  })

  it('reports failure when the browser cannot save the image', async () => {
    vi.mocked(saveCanvasPng).mockResolvedValueOnce(false)
    renderButton()
    download()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(FAILED))
  })

  it('reports failure, and is clickable again, when making the image throws', async () => {
    vi.mocked(renderShareCard).mockImplementationOnce(() => {
      throw new Error('canvas broke')
    })
    renderButton()
    download()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(FAILED))
    expect(screen.getByRole('button', { name: 'Download image' })).toBeEnabled()
  })

  it('makes one image for a double click, so the file is not downloaded twice', async () => {
    renderButton()
    download()
    download()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Image saved'))
    expect(renderShareCard).toHaveBeenCalledTimes(1)
    expect(saveCanvasPng).toHaveBeenCalledTimes(1)
  })

  it('marks the button aria-disabled while the image is being made, and keeps its focus', async () => {
    let finish: (value: boolean) => void = () => undefined
    vi.mocked(saveCanvasPng).mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finish = resolve)),
    )
    renderButton()
    const button = screen.getByRole('button', { name: 'Download image' })
    button.focus()
    download()
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    // Disabling the focused button would drop focus to the page body.
    expect(button).toBeEnabled()
    expect(button).toHaveFocus()
    await act(async () => finish(true))
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'false'))
    expect(button).toHaveFocus()
  })

  it('does not start a second image while the first is being made', async () => {
    let finish: (value: boolean) => void = () => undefined
    vi.mocked(saveCanvasPng).mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finish = resolve)),
    )
    renderButton()
    download()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Download image' })).toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
    download()
    await act(async () => finish(true))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Image saved'))
    expect(renderShareCard).toHaveBeenCalledTimes(1)
  })
})
