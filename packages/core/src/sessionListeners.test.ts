import { describe, expect, it } from 'vitest'
import { encodeFit } from './fit'
import { encodeGpx } from './gpx/encode'
import { AnalysisSession } from './session'
import { sampleDataset } from './synthetic'
import type { AthleteSettings } from './types'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const run = sampleDataset().activities.find((activity) => activity.sport === 'run')!

function fitFile(name: string): File {
  return new File([new Uint8Array(encodeFit(run, { gps: true }))], name)
}

/** The same workout in a poorer format. */
function gpxFile(name: string): File {
  return new File([new Uint8Array(encodeGpx(run))], name)
}

/** Imports the files one import at a time and says which activities the library kept and replaced. */
async function importing(files: File[], throwing = false) {
  const session = new AnalysisSession()
  const kept: string[] = []
  const replaced: string[] = []
  const held: boolean[] = []
  let state
  for (const file of files) {
    state = await session.addFiles(
      [file],
      SETTINGS,
      undefined,
      undefined,
      false,
      undefined,
      (activity, info) => {
        kept.push(activity.id)
        held.push(info.held)
        if (throwing) throw new Error('evidence storage refused the trace')
      },
      (id) => {
        replaced.push(id)
      },
    )
  }
  return { kept, replaced, held, state: state! }
}

describe('AnalysisSession activity listeners', () => {
  it('hears of an activity the library keeps', async () => {
    const { kept, replaced, held, state } = await importing([fitFile('run.fit')])

    expect(kept).toHaveLength(1)
    expect(held).toEqual([false])
    expect(replaced).toEqual([])
    expect(state.totalActivities).toBe(1)
  })

  it('does not hear of a different copy the library skips as poorer', async () => {
    const { kept, replaced, state } = await importing([fitFile('run.fit'), gpxFile('run.gpx')])

    expect(kept).toHaveLength(1)
    expect(replaced).toEqual([])
    expect(state.totalActivities).toBe(1)
  })

  it('hears of the held file read again, so a recording that went missing can be restored', async () => {
    const { kept, replaced, held, state } = await importing([
      fitFile('run.fit'),
      fitFile('run.fit'),
    ])

    expect(kept).toHaveLength(2)
    expect(held).toEqual([false, true])
    expect(kept[1]).toBe(kept[0])
    expect(replaced).toEqual([])
    expect(state.totalActivities).toBe(1)
  })

  it('names the held copy that a richer copy replaces, and hears of the richer one', async () => {
    const { kept, replaced, held, state } = await importing([
      gpxFile('run.gpx'),
      fitFile('run.fit'),
    ])

    expect(kept).toHaveLength(2)
    // The richer copy is new to the library, not the held file again.
    expect(held).toEqual([false, false])
    expect(replaced).toEqual([kept[0]])
    expect(replaced[0]).not.toBe(kept[1])
    expect(state.totalActivities).toBe(1)
  })

  it('keeps analysing and saving when a listener fails', async () => {
    const { kept, state } = await importing([fitFile('run.fit')], true)

    expect(kept).toHaveLength(1)
    expect(state.totalActivities).toBe(1)
    expect(state.rejected).toEqual([])
  })
})
