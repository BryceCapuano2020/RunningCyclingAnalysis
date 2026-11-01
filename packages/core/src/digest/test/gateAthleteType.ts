import { encodeFit } from '../../fit/encode'
import { parseActivityFile } from '../../import'
import { encodeTcx } from '../../tcx/encode'
import type { Activity, AthleteType } from '../../types'
import { syntheticActivity } from './syntheticActivity'

/**
 * Files read with the type their export's list gives, so a test can digest them with the label on and off. A seeded
 * synthetic run and ride: no real data.
 */

const START = Date.UTC(2026, 5, 20, 7, 0, 0)

function run(): Activity {
  return syntheticActivity({
    id: 'labelled',
    n: 1800,
    startMs: START,
    speed: new Float64Array(1800).fill(2.2),
  })
}

function ride(): Activity {
  return syntheticActivity({
    id: 'labelled-ride',
    sport: 'ride',
    n: 1800,
    startMs: START,
    speed: new Float64Array(1800).fill(7),
  })
}

/** The activity of a file, read with the type its export gave it. */
function read(bytes: Uint8Array, name: string, activityType: string): Activity {
  const parsed = parseActivityFile(bytes, name, undefined, { activityType, hashedIds: false })
  const first = parsed.ok ? parsed.activities[0] : undefined
  if (first === undefined) throw new Error(`${name} did not read`)
  return first
}

const fit = (activity: Activity) => encodeFit(activity, { gps: true })
const tcx = (activity: Activity) => encodeTcx(activity, { gps: true })

/** The label each case should give a digest at revision 7, or undefined for none. */
export interface LabelCase {
  make: () => Activity
  label: AthleteType | undefined
}

export const LABEL_CASES: Record<string, LabelCase> = {
  'FIT run listed as Hike': { make: () => read(fit(run()), 'a.fit', 'Hike'), label: 'hike' },
  'FIT run listed as Walk': { make: () => read(fit(run()), 'a.fit', 'Walk'), label: 'walk' },
  'FIT run listed as Nordic Ski': {
    make: () => read(fit(run()), 'a.fit', 'Nordic Ski'),
    label: 'ski',
  },
  'FIT run listed as Weight Training': {
    make: () => read(fit(run()), 'a.fit', 'Weight Training'),
    label: 'other',
  },
  'FIT run listed in German (Wanderung)': {
    make: () => read(fit(run()), 'a.fit', 'Wanderung'),
    label: undefined,
  },
  'FIT run listed as Run': { make: () => read(fit(run()), 'a.fit', 'Run'), label: undefined },
  'FIT run listed as Trail Run': {
    make: () => read(fit(run()), 'a.fit', 'Trail Run'),
    label: undefined,
  },
  'FIT ride listed as Ride': { make: () => read(fit(ride()), 'a.fit', 'Ride'), label: undefined },
  'FIT ride listed as Hike': { make: () => read(fit(ride()), 'a.fit', 'Hike'), label: 'hike' },
  'TCX run listed as Hike': { make: () => read(tcx(run()), 'a.tcx', 'Hike'), label: 'hike' },
}
