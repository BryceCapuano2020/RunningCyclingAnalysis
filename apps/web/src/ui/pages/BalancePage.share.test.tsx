// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings } from '@rca/core/types'
import '../../test/warmSample'
import { AnalysisSession } from '@rca/core/session'
import { analysisStub } from '../../test/analysisStub'
import { MAN_BORN_1986, makeResult, makeRideThreshold } from '../components/test/fixtures'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from '../sampleAthlete'
import { openDetail } from '../test/openDetail'
import { rowValue } from '../test/propertyRows'
import { BalancePage } from './BalancePage'
import type { LiftSet } from '@rca/core/lift'

const liftRead = vi.hoisted(() => ({ sets: [] as LiftSet[] }))
vi.mock('../lift/useLiftResults', async () => {
  const { liftResultsOf } = await import('@rca/core/lift')
  const { useMemo } = await import('react')
  return {
    // Memoised as the real hook is, so a render with the same settings draws nothing again.
    useLiftResults: (_account: unknown, settings: AthleteSettings) =>
      useMemo(() => liftResultsOf(liftRead.sets, settings, '2026-03-09'), [settings]),
  }
})
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
import { renderShareCard } from '../../share/renderCard'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

function renderPage(
  result: AnalysisResult,
  settings: AthleteSettings,
  state: Parameters<typeof analysisStub>[0] = {},
) {
  return render(
    <BalancePage
      analysis={analysisStub(state)}
      result={result}
      settings={settings}
      units="metric"
      profile={state.state?.isSample ? SAMPLE_PROFILE : MAN_BORN_1986}
      missingAge={null}
      controls={<span>Period picker</span>}
      weightKnown
      onShowAll={vi.fn()}
    />,
  )
}

/** Opens the share sheet and gives the card model its preview was drawn from. */
async function drawnCard() {
  fireEvent.click(screen.getByRole('button', { name: 'Share image' }))
  await waitFor(() => expect(renderShareCard).toHaveBeenCalled())
  const card = vi.mocked(renderShareCard).mock.calls.at(-1)?.[0]
  if (card === undefined) throw new Error('no card was drawn')
  return card
}

/** Each Balance row's heading, figure and unit, in order. */
function rows() {
  return screen.getAllByRole('article').map((tile) => ({
    tile,
    heading: tile.getAttribute('aria-label'),
    number: tile.querySelector('.stat-tile__number')?.textContent ?? null,
    unit: tile.querySelector('.stat-tile__unit')?.textContent ?? '',
  }))
}

describe('the share card’s figures are Balance’s rows', () => {
  it('gives the ride the row’s functional threshold power and its per-kilogram reading', async () => {
    // A synthetic ride threshold in the range of a trained 75 kg rider.
    const result = makeResult({ rideThreshold: makeRideThreshold(17) })
    renderPage(result, SETTINGS)
    const ride = rows().find((row) => row.heading === 'Functional threshold power')!
    const watts = Number(ride.number)
    expect(watts).toBeGreaterThanOrEqual(220)
    expect(watts).toBeLessThanOrEqual(300)
    openDetail(ride.tile)
    const card = await drawnCard()
    const hero = card.heroes.find((entry) => entry.sport === 'ride')
    expect(hero?.label).toBe('Functional threshold power')
    expect(hero?.figure).toEqual({ number: ride.number, unit: ride.unit })
    expect(hero?.sub).toBe(rowValue(ride.tile, 'Per kilogram'))
  })

  it('on the sample, repeats every row it shows and adds no lifting figure without a lift', async () => {
    const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
    if (state.result === null) throw new Error('The sample has no result')
    renderPage(state.result, SAMPLE_SETTINGS, {
      state: { isSample: true, library: state.library },
    })
    const shown = rows().filter((row) => row.number !== null)
    const card = await drawnCard()
    expect(card.heroes.map((hero) => ({ heading: hero.label, ...hero.figure }))).toEqual(
      shown.map(({ heading, number, unit }) => ({ heading, number, unit })),
    )
    expect(card.heroes.some((hero) => hero.sport === 'lift')).toBe(false)
  })
})
