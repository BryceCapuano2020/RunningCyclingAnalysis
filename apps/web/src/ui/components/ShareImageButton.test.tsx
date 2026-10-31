// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EffortCheck, Sport } from '@rca/core/types'
import type { Period } from '@rca/core/period'
import { canShareImage, canvasFile, saveFile, shareFile } from '../../share/download'
import { loadCardFonts, renderShareCard } from '../../share/renderCard'
import type { BalanceGap } from '../balanceGap'
import type { GradeOutcome } from '../grades'
import { HoldInputsContext } from '../holdContext'
import { makeActivity, makeResult } from './fixtures'
import { ShareImageButton, type ShareImageButtonProps } from './ShareImageButton'

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

const NOTE = 'Made on this device. Nothing is uploaded.'
const PREVIEW_FAILED = 'The preview could not be made.'
const LOW_EFFORT: EffortCheck = { durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 }
const TRIGGER = 'Share image'
const SAVE = 'Save image'
const SHARE_FILE = 'Share file'
const PREPARING = 'Preparing…'
const SHEET = 'Share image'
const NO_GRADES: Record<Sport, GradeOutcome | null> = { run: null, ride: null }
/** A run graded Local at 64%, on the headline duration, as the page grades it. */
const RUN_GRADE: GradeOutcome = {
  kind: 'graded',
  age: 37,
  grade: { centre: { grade: 0.64, level: 'Local' }, range: null },
}
/** The sheet's box on screen, so a click can be placed inside its padding or outside it. */
const SHEET_BOX = {
  left: 100,
  top: 100,
  right: 500,
  bottom: 500,
  width: 400,
  height: 400,
  x: 100,
  y: 100,
  toJSON: () => ({}),
} as DOMRect
const PERIOD: Period = { choice: 42, startMs: null, endMs: null, days: 42, fellBack: false }

function buttonProps(overrides: Partial<ShareImageButtonProps> = {}): ShareImageButtonProps {
  return {
    result: makeResult(),
    settings: { massKg: 75, bikeMassKg: 9 },
    units: 'metric',
    period: PERIOD,
    isSample: false,
    effort: null,
    weightKnown: true,
    gap: null,
    grades: NO_GRADES,
    disabled: false,
    ...overrides,
  }
}

function renderButton(overrides: Partial<ShareImageButtonProps> = {}) {
  return render(<ShareImageButton {...buttonProps(overrides)} />)
}

/** Opens the sheet, then waits until its preview of the square card is shown. */
async function openSheet(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: TRIGGER }))
  const dialog = screen.getByRole('dialog', { name: SHEET })
  await screen.findByRole('img', { name: 'Preview of the square card' })
  return dialog
}

/** Opens the sheet when its preview cannot be drawn, and waits until the sheet says so. */
async function openFailedSheet(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: TRIGGER }))
  const dialog = screen.getByRole('dialog', { name: SHEET })
  await screen.findByText(PREVIEW_FAILED)
  return dialog
}

/** A file the test resolves by hand, so the card stays in drawing until then. */
function heldFile() {
  let resolve: (file: File) => void = () => undefined
  const promise = new Promise<File>((done) => (resolve = done))
  return { promise, resolve }
}

/** Lets pending work finish, so a draw or a share that a tap would start has started. */
function settle() {
  return act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))
}

/** Presses one of the sheet's actions. */
function press(dialog: HTMLElement, name: string) {
  fireEvent.click(within(dialog).getByRole('button', { name }))
}

describe('ShareImageButton', () => {
  it('offers one plain share button, not a primary one, and no download button', () => {
    renderButton()
    const trigger = screen.getByRole('button', { name: TRIGGER })
    expect(trigger).toHaveClass('btn')
    expect(trigger).not.toHaveClass('btn-primary')
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument()
  })

  it('opens a sheet that says the image is made on this device and nothing is uploaded', async () => {
    renderButton()
    const dialog = await openSheet()
    expect(within(dialog).getByText(NOTE)).toBeInTheDocument()
  })

  it('shows a preview of the square card, with the square shape checked', async () => {
    renderButton()
    const dialog = await openSheet()
    expect(screen.getByRole('img', { name: 'Preview of the square card' })).toHaveAttribute(
      'src',
      'blob:preview',
    )
    expect(within(dialog).getByRole('radio', { name: 'Square (feed)' })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: 'Tall (story)' })).not.toBeChecked()
  })

  it('saves the square card under a dated name and says it was saved', async () => {
    renderButton()
    const dialog = await openSheet()
    press(dialog, SAVE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Square image saved'))
    expect(saveFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.stringMatching(/^balance-.*-square\.png$/) }),
    )
    // The card's fonts load before it is drawn.
    expect(vi.mocked(loadCardFonts).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(renderShareCard).mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('saves the tall card, named for the story, when the tall shape is chosen', async () => {
    renderButton()
    const dialog = await openSheet()
    fireEvent.click(within(dialog).getByText('Tall (story)', { exact: true }))
    await screen.findByRole('img', { name: 'Preview of the tall card' })
    press(dialog, SAVE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Tall image saved'))
    expect(renderShareCard).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Running Cycling Analysis' }),
      expect.any(HTMLCanvasElement),
      'story',
    )
    expect(saveFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.stringMatching(/^balance-.*-story\.png$/) }),
    )
  })

  it('names the action Save image unless the device can share this image', async () => {
    renderButton()
    const dialog = await openSheet()
    expect(within(dialog).getByRole('button', { name: SAVE })).toBeInTheDocument()
    expect(canShareImage).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.stringMatching(/\.png$/) }),
    )
  })

  it('names the action Share file where the device can share this image, and shares it', async () => {
    vi.mocked(canShareImage).mockReturnValue(true)
    renderButton()
    const dialog = await openSheet()
    expect(within(dialog).queryByRole('button', { name: SAVE })).not.toBeInTheDocument()
    press(dialog, SHARE_FILE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Square image shared'))
    expect(shareFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.stringMatching(/-square\.png$/) }),
    )
  })

  it('starts the share within the click, before anything awaits, so the sheet opens from the tap', async () => {
    vi.mocked(canShareImage).mockReturnValue(true)
    renderButton()
    const dialog = await openSheet()
    press(dialog, SHARE_FILE)
    // No waitFor: the share must already be started when the click returns.
    expect(shareFile).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('shared'))
  })

  it('says nothing when the visitor closes the share sheet, and can try again', async () => {
    vi.mocked(canShareImage).mockReturnValue(true)
    vi.mocked(shareFile).mockResolvedValueOnce('cancelled')
    renderButton()
    const dialog = await openSheet()
    press(dialog, SHARE_FILE)
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: SHARE_FILE })).toBeEnabled(),
    )
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('holds the action, and says so, when the card cannot be drawn', async () => {
    vi.mocked(renderShareCard).mockReturnValueOnce(false)
    renderButton()
    const dialog = await openFailedSheet()
    const action = within(dialog).getByRole('button', { name: SAVE })
    expect(action).toHaveAttribute('aria-disabled', 'true')
    press(dialog, SAVE)
    await settle()
    expect(saveFile).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('holds the action when the image cannot be encoded as a file', async () => {
    vi.mocked(canvasFile).mockResolvedValueOnce(null)
    renderButton()
    const dialog = await openFailedSheet()
    expect(within(dialog).getByRole('button', { name: SAVE })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    press(dialog, SAVE)
    await settle()
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('holds the action when making the image throws, and offers it again once another shape is drawn', async () => {
    vi.mocked(renderShareCard).mockImplementationOnce(() => {
      throw new Error('canvas broke')
    })
    renderButton()
    const dialog = await openFailedSheet()
    expect(within(dialog).getByRole('button', { name: SAVE })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    fireEvent.click(within(dialog).getByText('Tall (story)', { exact: true }))
    await screen.findByRole('img', { name: 'Preview of the tall card' })
    expect(within(dialog).getByRole('button', { name: SAVE })).toHaveAttribute(
      'aria-disabled',
      'false',
    )
    press(dialog, SAVE)
    expect(saveFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.stringMatching(/-story\.png$/) }),
    )
  })

  it('marks the action aria-disabled while the image is being shared, and keeps its focus', async () => {
    let finish: (value: 'shared') => void = () => undefined
    vi.mocked(canShareImage).mockReturnValue(true)
    vi.mocked(shareFile).mockImplementationOnce(
      () => new Promise<'shared'>((resolve) => (finish = resolve)),
    )
    renderButton()
    const dialog = await openSheet()
    const action = within(dialog).getByRole('button', { name: SHARE_FILE })
    action.focus()
    press(dialog, SHARE_FILE)
    await waitFor(() => expect(action).toHaveAttribute('aria-disabled', 'true'))
    // Disabling the focused button would drop focus to the page body.
    expect(action).toBeEnabled()
    expect(action).toHaveFocus()
    await act(async () => finish('shared'))
    await waitFor(() => expect(action).toHaveAttribute('aria-disabled', 'false'))
    expect(action).toHaveFocus()
  })

  it('saves once for a double click, so a quick second press does not save the file again', async () => {
    renderButton()
    const dialog = await openSheet()
    press(dialog, SAVE)
    press(dialog, SAVE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Square image saved'))
    expect(saveFile).toHaveBeenCalledTimes(1)
  })

  it('shares once for a double click on Share file', async () => {
    vi.mocked(canShareImage).mockReturnValue(true)
    renderButton()
    const dialog = await openSheet()
    press(dialog, SHARE_FILE)
    press(dialog, SHARE_FILE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Square image shared'))
    expect(shareFile).toHaveBeenCalledTimes(1)
  })

  it('saves again for a press after the double-click window has passed', async () => {
    renderButton()
    const dialog = await openSheet()
    let clock = 10_000
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => clock)
    try {
      press(dialog, SAVE)
      clock += 2_000
      press(dialog, SAVE)
      expect(saveFile).toHaveBeenCalledTimes(2)
    } finally {
      spy.mockRestore()
    }
  })

  it('does nothing when tapped before its image is ready, and shares at once once it is', async () => {
    vi.mocked(canShareImage).mockReturnValue(true)
    const held = heldFile()
    vi.mocked(canvasFile).mockReturnValueOnce(held.promise)
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: TRIGGER }))
    const dialog = screen.getByRole('dialog', { name: SHEET })
    press(dialog, PREPARING)
    await settle()
    // A tap before the image is ready neither draws again nor starts a share.
    expect(canvasFile).toHaveBeenCalledTimes(1)
    expect(shareFile).not.toHaveBeenCalled()
    expect(saveFile).not.toHaveBeenCalled()
    held.resolve(new File(['png'], 'balance-square.png', { type: 'image/png' }))
    await screen.findByRole('img', { name: 'Preview of the square card' })
    press(dialog, SHARE_FILE)
    // Once ready, the share starts within the tap, before anything awaits.
    expect(shareFile).toHaveBeenCalledTimes(1)
  })

  it('keeps the square picture, dimmed, while the tall one is drawn, and holds the action', async () => {
    renderButton()
    const dialog = await openSheet()
    const held = heldFile()
    vi.mocked(canvasFile).mockReturnValueOnce(held.promise)
    fireEvent.click(within(dialog).getByText('Tall (story)', { exact: true }))
    expect(within(dialog).getByRole('img', { name: 'Preview of the square card' })).toHaveClass(
      'share-sheet__picture--stale',
    )
    expect(within(dialog).getByRole('button', { name: PREPARING })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    held.resolve(new File(['png'], 'balance-story.png', { type: 'image/png' }))
    const tall = await within(dialog).findByRole('img', { name: 'Preview of the tall card' })
    expect(tall).not.toHaveClass('share-sheet__picture--stale')
  })

  it('gives the preview slot the chosen shape, so it reserves the height that shape takes', async () => {
    renderButton()
    const dialog = await openSheet()
    const slot = dialog.querySelector('.share-sheet__preview')!
    expect(slot).toHaveClass('share-sheet__preview--square')
    fireEvent.click(within(dialog).getByText('Tall (story)', { exact: true }))
    expect(slot).toHaveClass('share-sheet__preview--story')
    expect(slot).not.toHaveClass('share-sheet__preview--square')
  })

  it('is not ready right after a shape switch, until the new shape is drawn', async () => {
    const held = heldFile()
    renderButton()
    const dialog = await openSheet()
    vi.mocked(canvasFile).mockReturnValueOnce(held.promise)
    fireEvent.click(within(dialog).getByText('Tall (story)', { exact: true }))
    const action = await within(dialog).findByRole('button', { name: PREPARING })
    expect(action).toHaveAttribute('aria-disabled', 'true')
    press(dialog, PREPARING)
    await settle()
    expect(saveFile).not.toHaveBeenCalled()
    held.resolve(new File(['png'], 'balance-story.png', { type: 'image/png' }))
    await screen.findByRole('img', { name: 'Preview of the tall card' })
    expect(within(dialog).getByRole('button', { name: SAVE })).toBeEnabled()
  })

  it('closes the sheet on a click on the backdrop, but not on a click in its padding', async () => {
    renderButton()
    const dialog = await openSheet()
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(SHEET_BOX)
    fireEvent.click(within(dialog).getByText(NOTE))
    expect(dialog).toHaveAttribute('open')
    // The dialog's own padding is inside its box, so a click there is still the sheet.
    fireEvent.click(dialog, { clientX: 120, clientY: 120 })
    expect(dialog).toHaveAttribute('open')
    fireEvent.click(dialog, { clientX: 20, clientY: 20 })
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'))
  })

  it('keeps the status and the actions in one foot, with the status first, so the status stays in view', async () => {
    renderButton()
    const dialog = await openSheet()
    const foot = dialog.querySelector<HTMLElement>('.share-sheet__foot')!
    const status = screen.getByRole('status')
    const action = within(foot).getByRole('button', { name: SAVE })
    expect(foot).toContainElement(status)
    expect(foot).toContainElement(within(foot).getByRole('button', { name: 'Close' }))
    expect(status.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('starts loading the card and its fonts when the trigger is pointed at, before the sheet opens', async () => {
    renderButton()
    expect(loadCardFonts).not.toHaveBeenCalled()
    fireEvent.pointerEnter(screen.getByRole('button', { name: TRIGGER }))
    await waitFor(() => expect(loadCardFonts).toHaveBeenCalled())
  })

  it('loads the card once, however often the trigger is pointed at or focused', async () => {
    renderButton()
    const trigger = screen.getByRole('button', { name: TRIGGER })
    fireEvent.pointerEnter(trigger)
    await waitFor(() => expect(loadCardFonts).toHaveBeenCalledTimes(1))
    await settle()
    act(() => trigger.focus())
    await settle()
    fireEvent.pointerEnter(trigger)
    await settle()
    expect(loadCardFonts).toHaveBeenCalledTimes(1)
  })

  it('opens the sheet without focusing its action, so the first control takes focus', async () => {
    // A modal dialog focuses its first control itself; jsdom does not, so it only opens.
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: showModal,
    })
    try {
      renderButton()
      const dialog = await openSheet()
      expect(dialog.querySelector('.share-sheet__action')).not.toHaveFocus()
    } finally {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    }
  })

  it('clears the status when the period changes, so it never describes an older card', async () => {
    const result = makeResult()
    const { rerender } = renderButton({ result })
    const dialog = await openSheet()
    press(dialog, SAVE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Square image saved'))
    rerender(<ShareImageButton {...buttonProps({ result, period: { ...PERIOD, days: 84 } })} />)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('draws the preview once, not again on every render, while its inputs stay the same', async () => {
    const props = buttonProps()
    const { rerender } = render(<ShareImageButton {...props} />)
    await openSheet()
    const drawn = vi.mocked(canvasFile).mock.calls.length
    rerender(<ShareImageButton {...props} />)
    rerender(<ShareImageButton {...props} />)
    expect(vi.mocked(canvasFile).mock.calls.length).toBe(drawn)
  })

  it('holds the share button while the analysis runs: it is aria-disabled, and a tap does not open the sheet', () => {
    const { container } = renderButton({ disabled: true })
    const trigger = screen.getByRole('button', { name: TRIGGER })
    expect(trigger).not.toBeDisabled()
    expect(trigger).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(trigger)
    expect(container.querySelector('dialog')).not.toHaveAttribute('open')
    expect(container.querySelector('.share-image__note')).toBeNull()
  })

  it('renders nothing when there is neither a comparison nor a grade gap to share', () => {
    const { container } = renderButton({
      result: makeResult({ comparison: { prior: [], calibrated: null } }),
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing while only one sport is on file, so no one-sport card is shared', () => {
    const { container } = renderButton({
      result: makeResult({
        activities: [makeActivity({ id: 'run-1', sport: 'run' })],
        comparison: { prior: [], calibrated: null },
        rideCp: null,
      }),
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing while the ride has no threshold, even with a comparison, so no image asks for more', () => {
    const { container } = renderButton({ result: makeResult({ rideCp: null }) })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing under any hold on the comparison, since the card would state what the page holds back', () => {
    const held = { implausibleRide: { text: 'A ride looks too fast.', action: 'Check the ride.' } }
    const { container } = render(
      <HoldInputsContext.Provider value={held}>
        <ShareImageButton {...buttonProps()} />
      </HoldInputsContext.Provider>,
    )
    expect(container).toBeEmptyDOMElement()
    cleanup()
    renderButton()
    expect(screen.getByRole('button', { name: TRIGGER })).toBeInTheDocument()
  })

  it('renders nothing while no weight is entered, since the balance waits for it', () => {
    const { container } = renderButton({ weightKnown: false })
    expect(container).toBeEmptyDOMElement()
  })

  it("gives the card each sport's level on its hero, with the effort it grades", async () => {
    renderButton({ grades: { run: RUN_GRADE, ride: null } })
    const dialog = await openSheet()
    press(dialog, SAVE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('saved'))
    expect(renderShareCard).toHaveBeenCalledWith(
      expect.objectContaining({
        heroes: [
          expect.objectContaining({ sport: 'run', grade: 'Local · 64% on best 20 min' }),
          expect.objectContaining({ sport: 'ride', grade: null }),
        ],
      }),
      expect.any(HTMLCanvasElement),
      'square',
    )
  })

  it('gives the card the grade gap on the page, so its headline and meter agree with it', async () => {
    const gap: BalanceGap = { centre: -6, low: -10, high: -2, lean: 'ride' }
    renderButton({ gap })
    const dialog = await openSheet()
    press(dialog, SAVE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('saved'))
    expect(renderShareCard).toHaveBeenCalledWith(
      expect.objectContaining({
        headline: 'Your balance leans toward cycling',
        meter: expect.objectContaining({ unit: 'points', lean: 'ride' }),
      }),
      expect.any(HTMLCanvasElement),
      'square',
    )
  })

  it('passes the heart-rate effort to the card so the caveat is included', async () => {
    renderButton({ effort: LOW_EFFORT })
    const dialog = await openSheet()
    press(dialog, SAVE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('saved'))
    expect(renderShareCard).toHaveBeenCalledWith(
      expect.objectContaining({
        caveat: 'Best efforts over 20 min did not reach a hard heart rate.',
      }),
      expect.any(HTMLCanvasElement),
      'square',
    )
  })
})

describe('the name on the card', () => {
  const FIELD = 'Name on the card'
  const KEY = 'rca.card-name.v1'

  /** The model the last card was drawn from. */
  function lastCard() {
    return vi.mocked(renderShareCard).mock.calls.at(-1)?.[0]
  }

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('is empty by default, so the card carries no name until one is typed', async () => {
    renderButton()
    const dialog = await openSheet()
    expect(within(dialog).getByRole('textbox', { name: FIELD })).toHaveValue('')
    expect(lastCard()?.name).toBeNull()
  })

  it('draws the name typed on the card, and keeps it on this device', async () => {
    renderButton()
    const dialog = await openSheet()
    fireEvent.change(within(dialog).getByRole('textbox', { name: FIELD }), {
      target: { value: 'Bryce Capuano' },
    })
    await waitFor(() => expect(lastCard()?.name).toBe('Bryce Capuano'))
    expect(localStorage.getItem(KEY)).toBe('Bryce Capuano')
  })

  it('shows the name kept on this device when the sheet opens', async () => {
    localStorage.setItem(KEY, 'Bryce')
    renderButton()
    const dialog = await openSheet()
    expect(within(dialog).getByRole('textbox', { name: FIELD })).toHaveValue('Bryce')
    expect(lastCard()?.name).toBe('Bryce')
  })

  it('holds the name to 40 characters, in the field and on the card', async () => {
    renderButton()
    const dialog = await openSheet()
    const field = within(dialog).getByRole('textbox', { name: FIELD })
    expect(field).not.toHaveAttribute('maxLength')
    fireEvent.change(field, { target: { value: 'c'.repeat(60) } })
    await waitFor(() => expect(lastCard()?.name).toBe('c'.repeat(40)))
    expect(localStorage.getItem(KEY)).toBe('c'.repeat(40))
  })

  it('counts the 40 characters by code point, so 45 emoji keep 40 whole ones', async () => {
    renderButton()
    const dialog = await openSheet()
    const field = within(dialog).getByRole('textbox', { name: FIELD })
    fireEvent.change(field, { target: { value: '😀'.repeat(45) } })
    await waitFor(() => expect(lastCard()?.name).toBe('😀'.repeat(40)))
    expect(field).toHaveValue('😀'.repeat(40))
  })

  it('still draws the name for this visit when storage is refused', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    renderButton()
    const dialog = await openSheet()
    fireEvent.change(within(dialog).getByRole('textbox', { name: FIELD }), {
      target: { value: 'Bryce' },
    })
    await waitFor(() => expect(lastCard()?.name).toBe('Bryce'))
  })
})
