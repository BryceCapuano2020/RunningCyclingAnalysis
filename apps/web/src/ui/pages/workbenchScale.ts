import type { ActivityTrace, CadenceUnit, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import {
  METRES_PER_FOOT,
  METRES_PER_KM,
  METRES_PER_MILE,
  formatClock,
  groupThousands,
  paceSeconds,
} from '@rca/core/units'
import { niceTicks, tickDecimals } from '../charts/scale'
import type { ValueTick } from '../charts/timeSeriesTypes'
import { displayValue, isPaceReading } from './workbenchFormat'

/** The number and the unit of a written reading: "5:03 /km" is 5:03 and /km, "12.5°C" is 12.5 and °C. */
export function readingParts(text: string): { value: string; unit: string } {
  const match = /^([\d:.,\-−—]+)\s*(.*)$/.exec(text)
  return match === null ? { value: text, unit: '' } : { value: match[1]!, unit: match[2]! }
}

/** The steps a pace axis counts in, in seconds: a tick falls on a round pace, never on 4:52. */
const PACE_STEPS_S = [5, 10, 15, 20, 30, 60, 120, 300]

/** A measure's reading as the axis counts it, which for a pace is seconds a mile or a kilometre. */
interface DisplayScale {
  show: (raw: number) => number
  hide: (shown: number) => number
  label: (shown: number, decimals: number) => string
}

function scaleOf(
  metric: TraceMetric,
  sport: ActivityTrace['sport'],
  units: UnitSystem,
): DisplayScale {
  if (isPaceReading(metric, sport)) {
    const metres = paceSeconds(1, units)
    return {
      show: (raw) => metres / raw,
      hide: (shown) => metres / shown,
      label: (s) => formatClock(s),
    }
  }
  const plain: DisplayScale = {
    show: (raw) => raw,
    hide: (shown) => shown,
    label: (shown, decimals) => groupThousands(shown.toFixed(decimals)),
  }
  if (metric === 'speed') {
    const perHour = (units === 'imperial' ? METRES_PER_MILE : METRES_PER_KM) / 3600
    return { ...plain, show: (raw) => raw / perHour, hide: (shown) => shown * perHour }
  }
  if (metric === 'altitude' && units === 'imperial') {
    return {
      ...plain,
      show: (raw) => raw / METRES_PER_FOOT,
      hide: (shown) => shown * METRES_PER_FOOT,
    }
  }
  if (metric === 'temperature' && units === 'imperial') {
    return { ...plain, show: (raw) => raw * 1.8 + 32, hide: (shown) => (shown - 32) / 1.8 }
  }
  return plain
}

/** Round ticks inside [low, high], at most `count`, positioned by reading and labelled as the athlete counts it. */
export function valueTicks(
  metric: TraceMetric,
  sport: ActivityTrace['sport'],
  units: UnitSystem,
  low: number,
  high: number,
  count: number,
): ValueTick[] {
  const scale = scaleOf(metric, sport, units)
  const [a, b] = [scale.show(low), scale.show(high)]
  const [min, max] = a < b ? [a, b] : [b, a]
  let shown: number[]
  if (isPaceReading(metric, sport)) {
    const step = PACE_STEPS_S.find((candidate) => (max - min) / candidate <= count + 1) ?? 300
    shown = []
    for (let s = Math.ceil(min / step) * step; s <= max; s += step) shown.push(s)
  } else {
    shown = niceTicks(min, max, count)
    // A step is the nearest round one, which can leave more ticks than a row has room for.
    for (let wanted = count - 1; shown.length > count + 1 && wanted >= 1; wanted -= 1) {
      shown = niceTicks(min, max, wanted)
    }
  }
  const decimals = tickDecimals(shown)
  return shown.map((value) => ({ value: scale.hide(value), label: scale.label(value, decimals) }))
}

/** A reading as number and unit, written the way the page writes it everywhere else. */
export function readingOf(
  metric: TraceMetric,
  raw: number,
  sport: ActivityTrace['sport'],
  units: UnitSystem,
  cadenceUnit?: CadenceUnit,
): { value: string; unit: string } {
  return readingParts(displayValue(metric, raw, sport, units, cadenceUnit))
}
