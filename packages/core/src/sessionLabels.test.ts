import { gzipSync, strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { encodeFit } from './fit'
import { applyLabels, undoLabels } from './import/applyLabels'
import { AnalysisSession } from './session'
import { sampleDataset } from './synthetic'
import type { ActivityDigest, AthleteSettings } from './types'

/** A Strava export read twice: the list's types label the workouts the library already holds. */

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const sample = sampleDataset().activities
const runs = sample.filter((activity) => activity.sport === 'run')
if (runs.length < 3) throw new Error('The sample has fewer than three runs')

const csv = (rows: string[]) =>
  strToU8(['Activity ID,Activity Name,Activity Type,Filename', ...rows].join('\n') + '\n')

function exportZip(types: [string, string, string]): File {
  const entries: Record<string, Uint8Array> = {
    'activities/1.fit.gz': gzipSync(encodeFit(runs[0]!, { gps: true })),
    'activities/2.fit.gz': gzipSync(encodeFit(runs[1]!, { gps: true })),
    'activities/3.fit.gz': gzipSync(encodeFit(runs[2]!, { gps: true })),
    'activities.csv': csv(
      types.map((type, i) => `${i + 1},Activity ${i + 1},${type},activities/${i + 1}.fit.gz`),
    ),
  }
  return new File([new Uint8Array(zipSync(entries))], 'export.zip')
}

/** Imports the export and returns what was saved and the types the list gave. */
async function imported(types: [string, string, string]) {
  const saved: ActivityDigest[] = []
  let listedTypes: ReadonlyMap<string, string> | undefined
  await new AnalysisSession().addFiles(
    [exportZip(types)],
    SETTINGS,
    undefined,
    async ({ digest }) => {
      saved.push(digest)
    },
    false,
    (completed) => {
      listedTypes = completed.listedTypes
    },
  )
  return { saved, listedTypes }
}

describe('the types an import’s list gives', () => {
  it('are reported by file name, for the files the list names a type for', async () => {
    const { listedTypes } = await imported(['Hike', 'Run', 'Weight Training'])
    expect([...listedTypes!]).toEqual([
      ['activities/1.fit', 'Hike'],
      ['activities/2.fit', 'Run'],
      ['activities/3.fit', 'Weight Training'],
    ])
  })

  it('are absent when the import read no list', async () => {
    let completed: { listedTypes?: unknown } = { listedTypes: 1 }
    await new AnalysisSession().addFiles(
      [new File([new Uint8Array(encodeFit(runs[0]!, { gps: true }))], 'a.fit')],
      SETTINGS,
      undefined,
      undefined,
      false,
      (done) => {
        completed = done
      },
    )
    expect(completed).not.toHaveProperty('listedTypes')
  })
})

describe('applyLabels', () => {
  it('labels the held workouts whose file the list names with a type in the table, and no other', async () => {
    const { saved, listedTypes } = await imported(['Hike', 'Run', 'Weight Training'])
    const held = saved.map((digest, i) => ({ id: `rec${i}`, digest }))
    const proposals = applyLabels(held, listedTypes!)
    expect(proposals.map((p) => [p.id, p.athleteType, p.from]).sort()).toEqual(
      [
        ['rec0', 'hike', null],
        ['rec2', 'other', null],
      ].sort(),
    )
    for (const proposal of proposals) {
      expect(proposal.revision).toBe(saved[Number(proposal.id.slice(3))]!.modelRevision)
    }
  })

  it('does it at any model revision, and never replaces the athlete’s own label', async () => {
    const { saved, listedTypes } = await imported(['Hike', 'Walk', 'Nordic Ski'])
    const held = [
      { id: 'a', digest: { ...saved[0]!, modelRevision: 3 } },
      { id: 'b', digest: { ...saved[1]!, athleteType: 'other' as const } },
      { id: 'c', digest: saved[2]! },
    ]
    const proposals = applyLabels(held, listedTypes!)
    expect(proposals.map((p) => p.id)).toEqual(['a', 'c'])
    expect(proposals[0]).toEqual({ id: 'a', revision: 3, from: null, athleteType: 'hike' })
  })

  it('gives nothing for a localised name, or for a list that names none', async () => {
    const { saved, listedTypes } = await imported(['Wanderung', 'Run', 'Ride'])
    const held = saved.map((digest, i) => ({ id: `r${i}`, digest }))
    expect(applyLabels(held, listedTypes!)).toEqual([])
    expect(applyLabels(held, new Map())).toEqual([])
  })

  it('matches a file by its key: case, a .gz and the path do not matter', async () => {
    const { saved } = await imported(['Run', 'Run', 'Run'])
    const held = [{ id: 'x', digest: saved[0]! }]
    expect(applyLabels(held, new Map([['Activities/1.FIT', 'Hike']]))).toHaveLength(1)
    expect(applyLabels(held, new Map([['activities/9.fit.gz', 'Hike']]))).toHaveLength(0)
  })

  it('is undone by its inverse: each label taken off at the revision it was put on', () => {
    const applied = [{ id: 'a', revision: 6, from: null, athleteType: 'hike' as const }]
    expect(undoLabels(applied)).toEqual([{ id: 'a', revision: 6, from: 'hike', athleteType: null }])
    expect(undoLabels(undoLabels(applied))).toEqual(applied)
  })
})
