// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScaleLane, ScaleModel } from './balanceScaleModel'
import { SCALE_TABLE_COLUMNS } from './balanceScaleModel'
import { BalanceScale } from './BalanceScale'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const RUN: ScaleLane = {
  sport: 'run',
  centre: 64,
  low: null,
  high: null,
  level: 'Local',
  basis: 'recorded',
  basisText: 'recorded',
  effort: '6:37 /mi',
  pct: '64%',
  sub: 'Local · 6:37 /mi on your best 20 min',
  subShort: 'Local · 6:37 /mi',
  rangeLow: null,
  rangeHigh: null,
}
const RIDE: ScaleLane = {
  sport: 'ride',
  centre: 58,
  low: 52,
  high: 63,
  level: 'Recreational to Local',
  basis: 'estimated',
  basisText: 'estimated',
  effort: '246 W',
  pct: '58%',
  sub: 'Recreational to Local · 246 W on your best 20 min',
  subShort: 'Recreational to Local · 246 W',
  rangeLow: '52',
  rangeHigh: '63%',
}
const MODEL: ScaleModel = {
  lanes: [RUN, RIDE],
  gap: {
    figure: '6 pts',
    note: 'toward running · 90% range 1 to 12 points',
    noteShort: 'range 1 to 12 points',
    noteTiny: 'range 1 to 12',
    side: 'toward running',
    rangeValue: '1 to 12 points',
  },
  target: {
    sport: 'ride',
    at: 64,
    eyebrow: 'To level with running',
    line: 'about 270 W (245 to 295 W) · now 246 W',
    sentence:
      'To grade level with your running at 20 min, your best ride would need about 270 W (roughly 245 to 295 W; now 246 W).',
  },
  description: 'Age-grade level of your best 20 min. Run 64 percent, Local, recorded.',
  rows: [
    ['Run', 'Recorded', '64%', 'Local', '6:37 /mi', 'None'],
    ['Ride', 'Estimated', '58%', 'Recreational to Local', '246 W', '52 to 63%'],
  ],
}

/** Makes the drawing measure at a width, as a browser's ResizeObserver does on the first look. */
function measureAt(width: number) {
  class Observer {
    private readonly callback: (entries: unknown[]) => void

    constructor(callback: (entries: unknown[]) => void) {
      this.callback = callback
    }

    observe() {
      this.callback([{ contentRect: { width } }])
    }
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', Observer)
}

describe('BalanceScale', () => {
  it('is named by its heading, and the drawing is one image named by the model’s description', () => {
    render(<BalanceScale model={MODEL} />)
    const region = screen.getByRole('region', { name: 'Where you stand' })
    expect(within(region).getByRole('img', { name: MODEL.description })).toBeInTheDocument()
  })

  it('draws a dot for the recorded run and a ring over a bracketed band for the estimated ride', () => {
    const { container } = render(<BalanceScale model={MODEL} />)
    const run = container.querySelector('g[data-sport="run"]')
    const ride = container.querySelector('g[data-sport="ride"]')
    expect(run).toHaveAttribute('data-kind', 'dot')
    expect(run?.querySelector('.balance-scale__dot')).not.toBeNull()
    expect(run?.querySelector('.balance-scale__range')).toBeNull()
    expect(ride).toHaveAttribute('data-kind', 'ring')
    expect(ride?.querySelector('.balance-scale__ring')).not.toBeNull()
    expect(ride?.querySelector('.balance-scale__range')).not.toBeNull()
    expect(ride?.querySelectorAll('.balance-scale__cap')).toHaveLength(2)
  })

  it('prints each lane’s grade large with its level and figure and the range ends, and nothing of the gap or the target in the drawing', () => {
    measureAt(1000)
    const { container } = render(<BalanceScale model={MODEL} />)
    const text = Array.from(container.querySelectorAll('svg text')).map((node) => node.textContent)
    expect(text).toEqual(expect.arrayContaining(['64%', '58%', '52', '63%']))
    expect(text).toContain('Local · 6:37 /mi on your best 20 min')
    // The drawing's rows hold one label for each dot: the gap and the target are said under it.
    expect(text).not.toContain('6 pts')
    expect(text).not.toContain('To level with running')
    expect(text.filter((node) => /^\d+%$/.test(node ?? '') && node !== '63%')).toEqual(
      expect.arrayContaining(['64%', '58%']),
    )
  })

  it('says the gap in one caption line under the drawing, and the level target in another', () => {
    measureAt(1000)
    const { container } = render(<BalanceScale model={MODEL} />)
    expect(container.querySelector('.balance-scale__lean')).toHaveTextContent(
      '6 pts toward running · 90% range 1 to 12 points',
    )
    expect(container.querySelector('.balance-scale__target')).toHaveTextContent(
      'To level with runningabout 270 W (245 to 295 W) · now 246 W',
    )
    expect(container.querySelector('svg .balance-scale__connector')).not.toBeNull()
  })

  it('words a gap of no points as the same grade, with no figure', () => {
    const level = { ...MODEL.gap!, figure: '0 pts', side: 'same grade' }
    const { container } = render(<BalanceScale model={{ ...MODEL, gap: level }} />)
    expect(container.querySelector('.balance-scale__lean')).toHaveTextContent(
      'Same grade · 90% range 1 to 12 points',
    )
  })

  it('keys the ring as "Estimated" for estimated watts, and as measured power with the level via the run equivalent otherwise', () => {
    const measured = {
      ...MODEL,
      lanes: [RUN, { ...RIDE, basisText: 'via run equivalent' }] as ScaleModel['lanes'],
    }
    const { container, unmount } = render(<BalanceScale model={MODEL} />)
    expect(screen.getByRole('button', { name: 'Estimated' })).toBeInTheDocument()
    unmount()
    const again = render(<BalanceScale model={measured} />)
    expect(screen.queryByRole('button', { name: 'Estimated' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Power measured · level via run equivalent' }),
    ).toBeInTheDocument()
    expect(
      Array.from(again.container.querySelectorAll('.balance-scale__basis')).map(
        (n) => n.textContent,
      ),
    ).toEqual(['recorded', 'via run equivalent'])
    expect(container).toBeDefined()
  })

  it('writes the gap with no range clause where the range rounds to one value', () => {
    const point = { ...MODEL.gap!, note: 'toward running', rangeValue: '' }
    const { container } = render(<BalanceScale model={{ ...MODEL, gap: point }} />)
    expect(container.querySelector('.balance-scale__lean')).toHaveTextContent(
      /^6 pts toward running$/,
    )
  })

  it('names the figure, so a screen reader finds it by its own name as well as the heading’s', () => {
    render(<BalanceScale model={MODEL} />)
    expect(
      screen.getByRole('figure', {
        name: 'Level scale: age-graded level of your best 20 min, by sport',
      }),
    ).toBeInTheDocument()
  })

  it('writes the plain-words edges of the levels it shows in the sentence over the drawing', () => {
    const { container } = render(<BalanceScale model={MODEL} />)
    expect(container.querySelector('.balance-scale__lede')?.textContent).toMatch(
      /Recreational below 60%, Local from 60%, Regional from 70%\.$/,
    )
  })

  it('names the level bands the axis shows, from Recreational on', () => {
    const { container } = render(<BalanceScale model={MODEL} />)
    const names = Array.from(container.querySelectorAll('.balance-scale__band-name')).map(
      (node) => node.textContent,
    )
    expect(names).toEqual(['Recreational', 'Local', 'Regional'])
    expect(container.querySelectorAll('.balance-scale__band')).toHaveLength(3)
  })

  it('names each lane with its sport glyph and whether its grade is recorded or estimated', () => {
    const { container } = render(<BalanceScale model={MODEL} />)
    const names = Array.from(container.querySelectorAll('.balance-scale__lane-name')).map(
      (node) => node.textContent,
    )
    expect(names).toEqual(['Runrecorded', 'Rideestimated'])
    expect(container.querySelectorAll('.balance-scale__lane-name .icon')).toHaveLength(2)
  })

  it('gives the same figures as a table under the drawing, closed', () => {
    const { container } = render(<BalanceScale model={MODEL} />)
    const details = container.querySelector('details')
    expect(details).not.toHaveAttribute('open')
    expect(
      within(details as HTMLElement)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(SCALE_TABLE_COLUMNS)
    expect(within(details as HTMLElement).getAllByRole('row')).toHaveLength(3)
  })

  it('defines the level, and what estimated means, in place', () => {
    render(<BalanceScale model={MODEL} />)
    for (const term of ['level', 'Estimated']) {
      const button = screen.getByRole('button', { name: term })
      fireEvent.click(button)
      expect(document.getElementById(button.getAttribute('aria-controls') ?? '')).toHaveTextContent(
        term === 'level' ? /Recreational below 60%/ : /Worked out from a model/,
      )
    }
  })

  it('keys the dot, the ring and the band, and says a level is not a ranking in the definition, not in a caption', () => {
    const { container } = render(<BalanceScale model={MODEL} />)
    expect(container.querySelector('.balance-scale__swatch--dot')).not.toBeNull()
    expect(container.querySelector('.balance-scale__swatch--ring')).not.toBeNull()
    expect(container.querySelector('.balance-scale__swatch--band')).not.toBeNull()
    const lede = container.querySelector('.balance-scale__lede')?.cloneNode(true) as HTMLElement
    lede.querySelectorAll('.definition__note').forEach((note) => note.remove())
    expect(lede.textContent).not.toMatch(/ranking/)
    const level = screen.getByRole('button', { name: 'level' })
    expect(document.getElementById(level.getAttribute('aria-controls') ?? '')).toHaveTextContent(
      /A level, not a ranking\./,
    )
  })

  it('draws no ghost ring when the model has no target', () => {
    const { container } = render(<BalanceScale model={{ ...MODEL, target: null }} />)
    expect(container.querySelector('.balance-scale__ghost')).toBeNull()
    expect(container.querySelector('.balance-scale__target')).toBeNull()
    expect(container.querySelector('.balance-scale__lean')).not.toBeNull()
  })

  it('puts the level target’s sentence in the table twin, so the target is not in the drawing alone', () => {
    const { container } = render(<BalanceScale model={MODEL} />)
    const details = container.querySelector('details') as HTMLElement
    expect(within(details).getByText(MODEL.target!.sentence)).toBeInTheDocument()
  })

  it('has no target sentence in the table twin without a target', () => {
    const { container } = render(<BalanceScale model={{ ...MODEL, target: null }} />)
    expect(container.querySelector('.balance-scale__target-text')).toBeNull()
  })

  it('starts compact on a phone, before it has measured anything, so a phone never paints the desktop drawing first', () => {
    const was = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 })
    try {
      const { container } = render(<BalanceScale model={MODEL} />)
      expect(container.querySelector('svg')).toHaveAttribute('data-compact', 'true')
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: was })
    }
  })

  it('starts as the desktop drawing in a wide window', () => {
    const { container } = render(<BalanceScale model={MODEL} />)
    expect(container.querySelector('svg')).toHaveAttribute('data-compact', 'false')
  })
})
