// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DigestSplit } from '@rca/core/types'
import type { ActivityTrace } from '@rca/core/workbench'
import { useSplitsView } from '../useSplitsView'
import { SplitsTable, type SplitsTableProps } from './SplitsTable'
import type { SplitsLoad } from './splitRows'

afterEach(() => {
  cleanup()
})

function split(overrides: Partial<DigestSplit> = {}): DigestSplit {
  return {
    distanceM: 1000,
    seconds: 300,
    gradeAdjustedSeconds: 290,
    elevationGainM: 12,
    avgHeartRate: 150,
    ...overrides,
  }
}

function loaded(km: DigestSplit[]): SplitsLoad {
  return { status: 'loaded', splits: { km, mile: [] } }
}

/** A stretch of a run: its seconds, its speed in m/s, and whether the timer was paused through it. */
interface Stretch {
  seconds: number
  speed: number
  paused?: boolean
  heartRate: number
}

/** A run of stretches back to back, with the distance the speeds add up to and the laps given. */
function traceOf(stretches: Stretch[], laps: [number, number][]): ActivityTrace {
  const speed = stretches.flatMap((s) => Array.from({ length: s.seconds }, () => s.speed))
  const paused = stretches.flatMap((s) =>
    Array.from({ length: s.seconds }, () => (s.paused ? 1 : 0)),
  )
  const heartRate = stretches.flatMap((s) => Array.from({ length: s.seconds }, () => s.heartRate))
  let metres = 0
  const distance = speed.map((v) => {
    const here = metres
    metres += v
    return here
  })
  return {
    version: 1,
    activityId: 'run-laps',
    sport: 'run',
    durationS: speed.length,
    distance: Float64Array.from(distance),
    paused: Uint8Array.from(paused),
    unrecorded: new Uint8Array(speed.length),
    streams: { speed: Float32Array.from(speed), heartRate: Float32Array.from(heartRate) },
    laps: laps.map(([startS, endS]) => ({ startS, endS })),
  }
}

/** Two reps with a 120 s paused rest between, a lap for each, and a few seconds after the last lap. */
function repsWithRest(): ActivityTrace {
  return traceOf(
    [
      { seconds: 80, speed: 5, heartRate: 170 },
      { seconds: 120, speed: 0, paused: true, heartRate: 140 },
      { seconds: 90, speed: 4, heartRate: 175 },
    ],
    [
      [0, 80],
      [80, 200],
      [200, 280],
    ],
  )
}

describe('SplitsTable: a single split', () => {
  it('does not mark the only split as the fastest', () => {
    render(<SplitsTable load={loaded([split()])} units="metric" distanceM={1200} />)
    expect(screen.getAllByText('5:00 /km').length).toBeGreaterThan(0)
    expect(screen.queryByText('Fastest')).not.toBeInTheDocument()
  })

  it('marks the fastest of two', () => {
    render(
      <SplitsTable
        load={loaded([split(), split({ seconds: 285 })])}
        units="metric"
        distanceM={2000}
      />,
    )
    // The table and the list each carry the chip.
    expect(screen.getAllByText('Fastest')).toHaveLength(2)
  })
})

describe('SplitsTable: a steep descent', () => {
  const steep = split({ seconds: 300, gradeAdjustedSeconds: 600, elevationGainM: 0 })

  it('leaves the flat pace out where it is far slower than the pace run, and says why once', () => {
    render(<SplitsTable load={loaded([steep, split(), steep])} units="metric" distanceM={3000} />)
    const rows = within(screen.getByRole('table', { name: 'Pace for each kilometre' }))
      .getAllByRole('row')
      .slice(1)
    expect(within(rows[0]!).queryByText('10:00 /km')).not.toBeInTheDocument()
    expect(within(rows[0]!).getByText('Left out on a steep descent')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('4:50 /km')).toBeInTheDocument()
    expect(screen.getAllByText(/GAP is left out where a steep descent/)).toHaveLength(1)
  })

  it('keeps a flat pace at the margin, and shows no note when nothing is left out', () => {
    render(
      <SplitsTable
        load={loaded([split({ seconds: 300, gradeAdjustedSeconds: 450 }), split()])}
        units="metric"
        distanceM={2000}
      />,
    )
    expect(screen.getAllByText('7:30 /km').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Flat pace is left out/)).not.toBeInTheDocument()
  })

  it('leaves the flat pace out in both representations', () => {
    render(<SplitsTable load={loaded([steep, split()])} units="metric" distanceM={2000} />)
    expect(screen.queryByText('10:00 /km')).not.toBeInTheDocument()
  })
})

/** The table as the activity page holds it: the view it opens on is chosen once the trace is settled. */
function Splits(props: Omit<SplitsTableProps, 'view' | 'onViewChange'>) {
  const state = useSplitsView('run-1', { trace: props.trace ?? null, settled: true })
  return <SplitsTable {...props} view={state.view} onViewChange={state.choose} />
}

describe('SplitsTable: recorded laps', () => {
  it('leads with uneven laps, and offers the kilometres as the other view', () => {
    render(
      <Splits load={loaded([split()])} units="metric" distanceM={1200} trace={repsWithRest()} />,
    )
    expect(screen.getByRole('button', { name: 'Laps', pressed: true })).toBeInTheDocument()
    const rows = within(
      screen.getByRole('table', { name: 'Pace for each lap the device recorded' }),
    )
      .getAllByRole('row')
      .slice(1)
    expect(rows).toHaveLength(3)
    expect(within(rows[0]!).getByText('3:20 /km')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('0.40 km')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('1:20')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('170 bpm')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Fastest')).toBeInTheDocument()
    // The paused rest is not timed, so it has no pace.
    expect(within(rows[1]!).getByText('Not timed')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Not measured')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('4:10 /km')).toBeInTheDocument()
    // The athlete's choice is kept, and the kilometres are one press away.
    fireEvent.click(screen.getByRole('button', { name: 'Kilometres' }))
    expect(screen.getByRole('button', { name: 'Kilometres', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Pace for each kilometre' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /each lap/ })).not.toBeInTheDocument()
  })

  it('offers no laps for a run without them or with one, and shows the splits only', () => {
    const { rerender } = render(
      <Splits
        load={loaded([split()])}
        units="metric"
        distanceM={1200}
        trace={traceOf([{ seconds: 100, speed: 4, heartRate: 150 }], [])}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Laps' })).not.toBeInTheDocument()
    rerender(
      <Splits
        load={loaded([split()])}
        units="metric"
        distanceM={1200}
        trace={traceOf([{ seconds: 100, speed: 4, heartRate: 150 }], [[0, 100]])}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Laps' })).not.toBeInTheDocument()
  })

  it('shows the laps alone when the run has no whole-unit splits', () => {
    render(<Splits load={loaded([])} units="metric" distanceM={900_000} trace={repsWithRest()} />)
    expect(screen.queryByRole('button', { name: 'Laps' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('table', { name: 'Pace for each lap the device recorded' }),
    ).toBeInTheDocument()
  })
})
